// One-time removal of the retired bundled starter seed (native only).
//
// Older binaries (through App Store build 12) planted Ralph's personal April
// 2026 iPad export — 14 pieces, 2 folders, 57 practice-log rows, 26 sheet
// music photos — into every fresh install via seedIfEmpty(). That's wrong for
// strangers (their "library" is someone else's music and practice history),
// ships photographed sheet music in the binary, and — because every install
// reuses the SAME row ids — collides in the cloud once two seeded accounts
// sync. Seeding is now retired; this cleanup, delivered over OTA, empties the
// starter content off installs the old embedded code already seeded.
//
// Safety rules, in order (this code runs on Ralph's own devices too):
//   1. Runs at most once per install (settings marker), and only when seed
//      piece ids are actually present.
//   2. NEVER touches a device with a signed-in account or recorded sync owner
//      — it marks itself done and walks away. Ralph's iPad is signed in; a
//      user who signed in before the OTA landed keeps the starter content
//      rather than risk deleting anything that may have reached their cloud.
//   3. Per piece, only removes rows that are provably untouched: the piece row
//      and its exercises still carry the seed's exact updated_at stamps, and
//      no practice beyond the seed's own log rows references the piece.
//   4. All deletes run under withSyncApplying so nothing lands in the sync
//      outbox — these rows must never travel.
// Ralph's 57 bundled practice-log rows are removed even for adopted pieces:
// users can't edit log rows, so a manifest id is always Ralph's history, and
// leaving it would pollute the user's own practice stats.

import { Directory, File, Paths } from 'expo-file-system';

import { supabase } from '@/lib/supabase/client';
import { withSyncApplying } from '@/lib/sync/engine';

import { getDb } from './client';
import {
  SEED_FOLDERS,
  SEED_PIECES,
  SEED_PRACTICE_LOG_IDS,
  SEED_SETTINGS,
} from './seedManifest';

const DONE_KEY = 'seed.cleanup_done';

function sameStamp(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}

async function markDone(): Promise<void> {
  const db = getDb();
  await withSyncApplying(async () => {
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?);',
      DONE_KEY,
      JSON.stringify('true'),
    );
  });
}

export async function cleanupStarterSeed(): Promise<void> {
  try {
    const db = getDb();

    const marker = await db.getFirstAsync<{ value_json: string }>(
      'SELECT value_json FROM settings WHERE key = ?;',
      DONE_KEY,
    );
    if (marker) return;

    // Nothing seeded here (fresh install on a post-seed binary)? Done.
    const seedPieceIds = SEED_PIECES.map((p) => p.id);
    const present = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM pieces WHERE id IN (${placeholders(seedPieceIds.length)});`,
      ...seedPieceIds,
    );
    if ((present?.c ?? 0) === 0) {
      await markDone();
      return;
    }

    // Rule 2: a signed-in device (or one that ever synced) is off limits.
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await markDone();
        return;
      }
    } catch {
      // If we can't tell whether someone is signed in, do nothing this launch
      // and try again next time — deleting is the thing that must never be
      // wrong.
      return;
    }
    try {
      const owner = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM sync_state WHERE key = 'owner_user_id';",
      );
      if (owner?.value) {
        await markDone();
        return;
      }
    } catch {
      return;
    }

    // Rule 3: decide, per piece, whether the user adopted it.
    const toDelete: (typeof SEED_PIECES)[number][] = [];
    for (const m of SEED_PIECES) {
      const row = await db.getFirstAsync<{ updated_at: number | null }>(
        'SELECT updated_at FROM pieces WHERE id = ?;',
        m.id,
      );
      if (!row) continue; // already gone
      if (!sameStamp(row.updated_at, m.updated_at)) continue; // edited → keep

      let adopted = false;
      for (const ex of m.exercises) {
        const exRow = await db.getFirstAsync<{ updated_at: number | null }>(
          'SELECT updated_at FROM exercises WHERE id = ?;',
          ex.id,
        );
        if (exRow && !sameStamp(exRow.updated_at, ex.updated_at)) {
          adopted = true; // they reconfigured a starter exercise
          break;
        }
      }
      if (!adopted && SEED_PRACTICE_LOG_IDS.length > 0) {
        const practiced = await db.getFirstAsync<{ c: number }>(
          `SELECT COUNT(*) AS c FROM practice_log WHERE piece_id = ? AND id NOT IN (${placeholders(SEED_PRACTICE_LOG_IDS.length)});`,
          m.id,
          ...SEED_PRACTICE_LOG_IDS,
        );
        if ((practiced?.c ?? 0) > 0) adopted = true; // they practiced it
      }
      if (!adopted) toDelete.push(m);
    }

    const filesToDelete: string[] = [];

    await withSyncApplying(() =>
      db.withTransactionAsync(async () => {
        for (const m of toDelete) {
          const exIds = m.exercises.map((e) => e.id);
          if (exIds.length > 0) {
            const ph = placeholders(exIds.length);
            await db.runAsync(
              `DELETE FROM tempo_ladder_progress WHERE exercise_id IN (${ph});`,
              ...exIds,
            );
            await db.runAsync(
              `DELETE FROM click_up_progress WHERE exercise_id IN (${ph});`,
              ...exIds,
            );
            await db.runAsync(`DELETE FROM exercises WHERE id IN (${ph});`, ...exIds);
          }
          await db.runAsync('DELETE FROM strategy_last_used WHERE piece_id = ?;', m.id);
          await db.runAsync('DELETE FROM pieces WHERE id = ?;', m.id);
          filesToDelete.push(...m.files);
        }

        // Ralph's bundled practice history goes regardless of adoption.
        if (SEED_PRACTICE_LOG_IDS.length > 0) {
          await db.runAsync(
            `DELETE FROM practice_log WHERE id IN (${placeholders(SEED_PRACTICE_LOG_IDS.length)});`,
            ...SEED_PRACTICE_LOG_IDS,
          );
        }

        // Seeded folders: only if unrenamed AND nothing (kept pieces, user
        // documents, subfolders) still lives inside.
        for (const f of SEED_FOLDERS) {
          const row = await db.getFirstAsync<{ updated_at: number | null }>(
            'SELECT updated_at FROM folders WHERE id = ?;',
            f.id,
          );
          if (!row || !sameStamp(row.updated_at, f.updated_at)) continue;
          const kids = await db.getFirstAsync<{ c: number }>(
            `SELECT (SELECT COUNT(*) FROM pieces WHERE folder_id = ?)
                  + (SELECT COUNT(*) FROM documents WHERE folder_id = ?)
                  + (SELECT COUNT(*) FROM folders WHERE parent_folder_id = ?) AS c;`,
            f.id,
            f.id,
            f.id,
          );
          if ((kids?.c ?? 0) === 0) {
            await db.runAsync('DELETE FROM folders WHERE id = ?;', f.id);
          }
        }

        // Seeded settings (Ralph's colors, tip flags, last-used instrument):
        // delete only if the stored value is still byte-for-byte the seed's.
        for (const s of SEED_SETTINGS) {
          await db.runAsync(
            'DELETE FROM settings WHERE key = ? AND value_json = ?;',
            s.key,
            s.value_json,
          );
        }
      }),
    );

    // Remove the copied sheet-music photos for deleted pieces. Best-effort;
    // an orphaned file is cosmetic, a thrown error here must not undo the row
    // cleanup that already committed.
    const piecesDir = new Directory(Paths.document, 'pieces');
    if (piecesDir.exists) {
      for (const name of filesToDelete) {
        try {
          const f = new File(piecesDir, name);
          if (f.exists) f.delete();
        } catch {
          // ignore
        }
      }
    }

    await markDone();
    console.log(
      `[seedCleanup] Removed ${toDelete.length}/${SEED_PIECES.length} starter pieces, ` +
        `${SEED_PRACTICE_LOG_IDS.length} bundled practice-log rows.`,
    );
  } catch (e) {
    // Never block startup; without the marker we simply try again next launch.
    console.warn('[seedCleanup] failed (will retry next launch)', e);
  }
}
