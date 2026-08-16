// The two-way sync engine (SYNC_PLAN Phase 2) — NATIVE ONLY.
//
// Push: drain sync_outbox (populated by SQLite triggers on every local
// insert/update) up to Supabase, parents before children, newest-wins per row.
// A piece/document whose image or PDF only exists in the iPad sandbox gets its
// file uploaded first, so what lands on the web is usable, not a broken link.
//
// Pull: per-table watermark on the cloud's server_updated_at (server-stamped,
// immune to device-clock skew), applied to SQLite newest-wins. Deletes travel
// as deleted_at tombstones in BOTH directions; the engine never hard-deletes.
//
// Phase 3 (lazy assets + annotations):
// - pieces/documents PULL now also INSERTS brand-new cloud rows, keeping
//   their cloud https URLs — music added on the web appears on the iPad by
//   itself. Native screens render remote URLs directly; opening the passage/
//   document downloads its files into the sandbox for offline use
//   (lib/assets/materializeAssets.ts).
// - Pencil marks sync. Saves are local-first with a best-effort cloud mirror
//   (repos annotations.ts / documentAnnotations.ts); rows whose saved_at
//   outruns mirrored_at are re-mirrored here, and cloud-side marks are
//   adopted on pull unless this device holds unmirrored strokes (those push
//   first — an offline drawing must never be clobbered by an older web copy).
//   document_annotations PULL additionally waits for the cloud to have
//   server_updated_at (db/migrations/2026-08-15-sync-phase3-annotations.sql).
//
// Scope guards, deliberate:
// - recordings + custom patterns are already cloud-native on both platforms.
//
// The whole engine is best-effort and resumable: any failure leaves the row
// in the outbox for the next run. It must NEVER throw to its caller.

import { File, Paths } from 'expo-file-system';

import { getDb } from '@/lib/db/client';
import { supabase } from '@/lib/supabase/client';

const BUCKET = 'pieces';
const PULL_PAGE = 500;

type Row = Record<string, unknown>;

export type SyncStatus = {
  state: 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out' | 'waiting-server';
  lastSyncAt: number | null;
  pendingCount: number;
  lastError: string | null;
  /** Up to 3 waiting items, named in plain English with why they're waiting. */
  stuck: { label: string; reason: string }[];
};

let running = false;
let cloudReady: boolean | null = null;

// ── sync_state helpers ──────────────────────────────────────────────────────

async function getState(key: string): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_state WHERE key = ?;',
    key,
  );
  return row?.value ?? null;
}

async function setState(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?);',
    key,
    value,
  );
}

// Raise the trigger guard while the engine itself writes local rows (applying
// cloud pulls, binding practice-log ids) so those writes don't echo back into
// the outbox. Kept as tight as possible around the actual statements: while
// the flag is up, a concurrent user write would skip outbox capture. expo-
// sqlite serializes statements on one connection and these windows are
// per-batch, so the exposure is microseconds — but don't wrap long loops
// with awaits on the network inside.
async function withApplying<T>(fn: () => Promise<T>): Promise<T> {
  const db = getDb();
  await db.runAsync('UPDATE sync_ctl SET applying = 1 WHERE id = 1;');
  try {
    return await fn();
  } finally {
    await db.runAsync('UPDATE sync_ctl SET applying = 0 WHERE id = 1;');
  }
}

// For other cloud-sourced local writers (the one-shot /import-supabase path):
// rows that came FROM the cloud must not queue themselves to be pushed back.
export const withSyncApplying = withApplying;

// ── public status (Account screen) ──────────────────────────────────────────

// Turn a raw defer error into a sentence a musician can act on.
function plainReason(raw: string | null): string {
  if (!raw) return 'will keep retrying automatically';
  if (/local file (missing|empty)/i.test(raw)) return 'its image file is missing on this device';
  if (/assets not uploadable/i.test(raw)) return 'its page images are missing on this device';
  if (/foreign key/i.test(raw)) return 'it belongs to something that no longer exists (like a deleted folder)';
  if (/network|fetch|timeout/i.test(raw)) return 'waiting for internet';
  return 'hit a problem; retrying automatically';
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const db = getDb();
  const pending = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM sync_outbox;',
  );
  // Pencil marks waiting to reach the cloud aren't outbox rows — they're
  // tracked by saved/mirrored stamps on the rows themselves.
  let annPending = 0;
  try {
    const ann = await db.getFirstAsync<{ n: number }>(
      `SELECT
         (SELECT COUNT(*) FROM pieces
           WHERE annotation_saved_at IS NOT NULL
             AND annotation_saved_at > COALESCE(annotation_mirrored_at, 0))
       + (SELECT COUNT(*) FROM document_annotations
           WHERE saved_at IS NOT NULL AND saved_at > COALESCE(mirrored_at, 0)) AS n;`,
    );
    annPending = ann?.n ?? 0;
  } catch {
    // pre-migration DB — outbox count still shows
  }
  const last = await getState('last_sync_at');
  const err = await getState('last_error');
  const state = await getState('last_state');

  // Name up to 3 waiting items so the card can say WHAT is stuck and why.
  const stuck: SyncStatus['stuck'] = [];
  if ((pending?.n ?? 0) > 0) {
    try {
      const rows = await db.getAllAsync<{ table_name: string; row_id: string; last_error: string | null }>(
        'SELECT table_name, row_id, last_error FROM sync_outbox ORDER BY queued_at LIMIT 3;',
      );
      for (const r of rows) {
        let label = 'an item';
        if (r.table_name === 'pieces') {
          const p = await db.getFirstAsync<{ title: string }>('SELECT title FROM pieces WHERE id = ?;', r.row_id);
          label = p?.title ? `“${p.title}”` : 'a passage';
        } else if (r.table_name === 'documents') {
          const d = await db.getFirstAsync<{ title: string }>('SELECT title FROM documents WHERE id = ?;', r.row_id);
          label = d?.title ? `“${d.title}”` : 'a piece of music';
        } else if (r.table_name === 'practice_log') {
          label = 'a practice session';
        } else if (r.table_name === 'strategy_last_used') {
          label = 'a practice bookmark';
        } else {
          label = 'practice progress';
        }
        stuck.push({ label, reason: plainReason(r.last_error) });
      }
    } catch {
      // pre-migration DB or transient read issue — the count still shows
    }
  }

  if (annPending > 0 && stuck.length < 3) {
    stuck.push({
      label: annPending === 1 ? 'a pencil drawing' : 'pencil drawings',
      reason: 'will keep retrying automatically',
    });
  }

  return {
    state: running
      ? 'syncing'
      : ((state as SyncStatus['state']) ?? 'idle'),
    lastSyncAt: last ? Number(last) : null,
    pendingCount: (pending?.n ?? 0) + annPending,
    lastError: err,
    stuck,
  };
}

// ── the entry point ─────────────────────────────────────────────────────────

export async function syncNow(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      await setState('last_state', 'signed-out');
      return;
    }
    const userId = data.session.user.id;

    // Sync bookkeeping is PER-ACCOUNT. If a different user signs in on this
    // device (account switch, or a test account), the previous account's pull
    // watermarks and reconcile flag must not carry over: stale watermarks
    // would silently skip pulling the new account's older rows, and a stale
    // plog_reconciled would skip the duplicate-guard binding for its practice
    // history. Reset both; a fresh full pull and re-reconcile are idempotent.
    const owner = await getState('owner_user_id');
    if (owner !== userId) {
      const db = getDb();
      await db.runAsync(
        "DELETE FROM sync_state WHERE key LIKE 'wm_%' OR key = 'plog_reconciled';",
      );
      await setState('owner_user_id', userId);
    }

    // The cloud needs its side of the groundwork (server_updated_at etc.)
    // before any of this can run. Probe once per app launch; until the
    // migration is applied the engine is a clean no-op.
    if (cloudReady === null) cloudReady = await probeCloudReady();
    if (!cloudReady) {
      await setState('last_state', 'waiting-server');
      return;
    }

    await reconcilePracticeLogOnce();
    await pushAll(userId);
    await pullAll();

    await setState('last_sync_at', String(Date.now()));
    await setState('last_error', '');
    await setState('last_state', 'idle');
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    // Network failures are routine (practice rooms have dead wifi) — record
    // and move on; the outbox keeps everything for the next attempt.
    await setState('last_error', msg).catch(() => {});
    await setState(
      'last_state',
      /network|fetch|timeout/i.test(msg) ? 'offline' : 'error',
    ).catch(() => {});
    console.warn('[sync] run failed', e);
  } finally {
    running = false;
  }
}

async function probeCloudReady(): Promise<boolean> {
  const { error } = await supabase
    .from('pieces')
    .select('id, server_updated_at')
    .limit(1);
  if (!error) return true;
  if (/server_updated_at/.test(error.message)) return false;
  throw error;
}

// ── one-time practice-log identity binding ──────────────────────────────────
// Rows that reached this iPad through the old one-shot import are the SAME
// sessions as cloud rows, but the two sides don't share an id yet (cloud
// client_id is null for pre-June rows; local sync_id was minted random in the
// migration). Bind them by their natural identity (piece, strategy,
// millisecond timestamp) so the first push can't duplicate history.
async function reconcilePracticeLogOnce(): Promise<void> {
  if ((await getState('plog_reconciled')) === '1') return;
  const db = getDb();

  const locals = await db.getAllAsync<{
    id: number;
    sync_id: string;
    piece_id: string;
    strategy: string;
    practiced_at: number;
  }>('SELECT id, sync_id, piece_id, strategy, practiced_at FROM practice_log WHERE sync_id IS NOT NULL;');
  const byTriple = new Map<string, (typeof locals)[number]>();
  const localSyncIds = new Set<string>();
  for (const l of locals) {
    byTriple.set(`${l.piece_id}|${l.strategy}|${l.practiced_at}`, l);
    localSyncIds.add(l.sync_id);
  }

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('practice_log')
      .select('id, client_id, piece_id, strategy, practiced_at')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const c of data) {
      const local = byTriple.get(`${c.piece_id}|${c.strategy}|${c.practiced_at}`);
      if (c.client_id) {
        if (localSyncIds.has(c.client_id)) continue; // already bound
        if (local && local.sync_id !== c.client_id) {
          // Cloud already has an identity for this session — adopt it locally
          // and drop the seeded push (content is the same row).
          await withApplying(async () => {
            await db.runAsync(
              'UPDATE practice_log SET sync_id = ? WHERE id = ?;',
              c.client_id,
              local.id,
            );
          });
          await db.runAsync(
            'DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?;',
            'practice_log',
            local.sync_id,
          );
          localSyncIds.add(c.client_id);
        }
      } else if (local) {
        // Legacy cloud row — claim it with the local identity so future
        // edits/deletes of this session travel.
        const { error: claimErr } = await supabase
          .from('practice_log')
          .update({ client_id: local.sync_id })
          .eq('id', c.id)
          .is('client_id', null);
        if (claimErr) throw claimErr;
        await db.runAsync(
          'DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?;',
          'practice_log',
          local.sync_id,
        );
      }
    }
    if (data.length < 1000) break;
  }

  await setState('plog_reconciled', '1');
}

// ── PUSH ────────────────────────────────────────────────────────────────────

type Queued = { row_id: string; queued_at: number };

async function takeQueued(table: string): Promise<Queued[]> {
  const db = getDb();
  return db.getAllAsync<Queued>(
    'SELECT row_id, queued_at FROM sync_outbox WHERE table_name = ? ORDER BY queued_at LIMIT 200;',
    table,
  );
}

async function clearQueued(table: string, q: Queued): Promise<void> {
  const db = getDb();
  // Only clear if the row wasn't re-queued while we were pushing it.
  await db.runAsync(
    'DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ? AND queued_at = ?;',
    table,
    q.row_id,
    q.queued_at,
  );
}

// Record WHY a row was set aside, so the Sync card can name it instead of
// just counting it. Best-effort — diagnostics must never break the sync.
async function markDeferred(table: string, rowId: string, e: unknown): Promise<void> {
  try {
    const msg =
      e instanceof Error ? e.message : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    const db = getDb();
    await db.runAsync(
      'UPDATE sync_outbox SET last_error = ? WHERE table_name = ? AND row_id = ?;',
      msg.slice(0, 300),
      table,
      rowId,
    );
  } catch {
    // diagnostics only
  }
}

// Parents before children — cloud foreign keys demand it.
async function pushAll(userId: string): Promise<void> {
  await pushFolders();
  await pushDocuments(userId);
  await pushPieces(userId);
  await pushAnnotations();
  await pushDocumentAnnotations();
  await pushExercises();
  await pushProgress('tempo_ladder_progress', [
    'mode', 'start_tempo', 'goal_tempo', 'increment', 'cluster_low',
    'cluster_high', 'target_reps', 'goal_date', 'custom_pattern_id',
    'custom_block_index', 'custom_rep_in_block', 'current_tempo',
    'current_streak', 'updated_at',
  ]);
  await pushProgress('click_up_progress', ['current_index', 'updated_at']);
  await pushStrategyLastUsed();
  await pushPracticeLog();
}

// Generic helper: insert-if-absent (id-keyed), then a per-row newest-wins
// update. The update is guarded with updated_at <= ours, so a newer web edit
// can never be clobbered by a stale offline push.
async function pushIdTable(
  table: string,
  rows: Row[],
  queued: Queued[],
  updateCols: string[],
  lwwCol = 'updated_at',
): Promise<void> {
  if (rows.length === 0) return;
  const { error: insErr } = await supabase
    .from(table)
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (insErr) throw insErr;

  for (const row of rows) {
    const patch: Row = {};
    for (const c of updateCols) patch[c] = row[c];
    const { error } = await supabase
      .from(table)
      .update(patch)
      .eq('id', String(row.id))
      .lte(lwwCol, row[lwwCol] as number);
    if (error) throw error;
    const q = queued.find((x) => x.row_id === String(row.id));
    if (q) await clearQueued(table, q);
  }
}

async function pushFolders(): Promise<void> {
  const db = getDb();
  const queued = await takeQueued('folders');
  if (queued.length === 0) return;
  const rows: Row[] = [];
  for (const q of queued) {
    const r = await db.getFirstAsync<Row>('SELECT * FROM folders WHERE id = ?;', q.row_id);
    if (!r) { await clearQueued('folders', q); continue; }
    rows.push({
      id: r.id, name: r.name, parent_folder_id: r.parent_folder_id,
      sort_order: r.sort_order ?? 0, color: r.color ?? null,
      created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
    });
  }
  await pushIdTable('folders', rows, queued, [
    'name', 'parent_folder_id', 'sort_order', 'color', 'updated_at', 'deleted_at',
  ]);
}

function isLocalUri(uri: unknown): uri is string {
  return typeof uri === 'string' && uri.startsWith('file://');
}

// Saved absolute sandbox paths go stale every time the app container UUID
// changes (app/TestFlight update) — the file still exists, but under the
// CURRENT container. Re-root the path at today's documents directory before
// trusting it. Returns a URI whose file exists, or null if the file is truly
// gone under both the stored and healed paths.
function healLocalUri(uri: string): string | null {
  try {
    if (new File(uri).exists) return uri;
  } catch {
    // fall through to healing
  }
  const marker = '/Documents/';
  const at = uri.indexOf(marker);
  if (at < 0) return null;
  const suffix = uri.slice(at + marker.length);
  const docRoot = Paths.document.uri.endsWith('/') ? Paths.document.uri : `${Paths.document.uri}/`;
  const healed = `${docRoot}${suffix}`;
  try {
    if (new File(healed).exists) return healed;
  } catch {
    // gone
  }
  return null;
}

function extOf(uri: string): { ext: string; contentType: string } {
  const clean = uri.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return { ext: 'png', contentType: 'image/png' };
  if (clean.endsWith('.webp')) return { ext: 'webp', contentType: 'image/webp' };
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

// Upload a sandbox file and return its public URL (cache-busted). Throws on
// failure — callers defer the row and retry next run.
async function uploadLocalFile(
  localUri: string,
  path: string,
  contentType: string,
): Promise<string> {
  const f = new File(localUri);
  if (!f.exists) throw new Error(`local file missing: ${localUri}`);
  const bytes = await f.bytes();
  if (!bytes || bytes.length === 0) throw new Error(`local file empty: ${localUri}`);
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (up.error) throw up.error;
  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return `${publicUrl}?v=${Date.now().toString(36)}`;
}

async function pushDocuments(userId: string): Promise<void> {
  const db = getDb();
  const queued = await takeQueued('documents');
  for (const q of queued) {
    try {
      const r = await db.getFirstAsync<Row>('SELECT * FROM documents WHERE id = ?;', q.row_id);
      if (!r) { await clearQueued('documents', q); continue; }

      const { data: existing, error: exErr } = await supabase
        .from('documents')
        .select('id, updated_at')
        .eq('id', r.id as string)
        .maybeSingle();
      if (exErr) throw exErr;

      // Cloud already at least as new (e.g. the migration-seeded outbox on a
      // library that came FROM the cloud)? Nothing to push — and crucially,
      // nothing to re-upload.
      if (existing && Number(existing.updated_at) >= Number(r.updated_at)) {
        await clearQueued('documents', q);
        continue;
      }

      // Tombstones skip all asset work: send the marker if the cloud knows
      // the doc, drop the entry if it never did.
      if (r.deleted_at) {
        if (existing) {
          const { error } = await supabase
            .from('documents')
            .update({
              title: r.title, composer: r.composer, folder_id: r.folder_id,
              sort_order: r.sort_order ?? 0, sections_json: r.sections_json,
              updated_at: r.updated_at, deleted_at: r.deleted_at,
            })
            .eq('id', r.id as string)
            .lte('updated_at', r.updated_at as number);
          if (error) throw error;
        }
        await clearQueued('documents', q);
        continue;
      }

      // Assets: image-docs need every page in Storage; PDF docs need the
      // original PDF (web renders pages from it on demand).
      let pagesJson = r.pages_json as string;
      let originalUri = r.original_uri as string | null;
      let pagesCloudSafe = true;
      const pages = JSON.parse(pagesJson || '[]') as Row[];
      if (r.source_kind === 'images') {
        const out: Row[] = [];
        for (const p of pages) {
          if (isLocalUri(p.image_uri)) {
            const healed = healLocalUri(p.image_uri);
            if (!healed) {
              pagesCloudSafe = false;
              out.push(p);
              continue;
            }
            const { contentType } = extOf(healed);
            const url = await uploadLocalFile(
              healed,
              `${userId}/documents/${r.id}/p${p.index}.jpg`,
              contentType,
            );
            out.push({ ...p, image_uri: url });
          } else if (typeof p.image_uri === 'string') {
            out.push(p);
          } else {
            pagesCloudSafe = false;
            out.push(p);
          }
        }
        pagesJson = JSON.stringify(out);
      } else {
        // PDF doc: web ignores local page caches — strip any sandbox paths.
        pagesJson = JSON.stringify(
          pages.map((p) => (isLocalUri(p.image_uri) ? { index: p.index, w: p.w, h: p.h } : p)),
        );
        if (isLocalUri(originalUri)) {
          const healed = healLocalUri(originalUri);
          if (healed) {
            originalUri = await uploadLocalFile(
              healed,
              `${userId}/documents/${r.id}/original.pdf`,
              'application/pdf',
            );
          }
          // still file:// (truly gone)? the insert guard below defers it.
        }
      }

      const base: Row = {
        title: r.title, composer: r.composer, folder_id: r.folder_id,
        sort_order: r.sort_order ?? 0, sections_json: r.sections_json,
        updated_at: r.updated_at, deleted_at: r.deleted_at,
      };
      if (existing) {
        // Only replace the cloud's asset columns when ours are fully
        // cloud-safe — never overwrite good URLs with sandbox paths.
        const patch: Row = { ...base };
        if (pagesCloudSafe && !isLocalUri(originalUri)) {
          patch.pages_json = pagesJson;
          patch.page_count = r.page_count;
          patch.original_uri = originalUri;
        }
        const { error } = await supabase
          .from('documents')
          .update(patch)
          .eq('id', r.id as string)
          .lte('updated_at', r.updated_at as number);
        if (error) throw error;
      } else {
        if (!pagesCloudSafe || isLocalUri(originalUri)) {
          throw new Error(`document ${r.id} assets not uploadable yet`);
        }
        const { error } = await supabase.from('documents').insert({
          id: r.id, source_kind: r.source_kind, original_uri: originalUri,
          page_count: r.page_count, pages_json: pagesJson,
          created_at: r.created_at, ...base,
        });
        // Same cross-account guard as pieces: an id that exists under a
        // different user is invisible to us and unclaimable — keep local.
        if (error && error.code === '23505') {
          console.warn('[sync] document belongs to another account — kept local only', r.id);
        } else if (error) {
          throw error;
        }
      }
      await clearQueued('documents', q);
    } catch (e) {
      // Leave this document queued (missing file, offline mid-upload…) and
      // keep going — one stuck row must not dam the whole outbox.
      console.warn('[sync] document push deferred', q.row_id, e);
      await markDeferred('documents', q.row_id, e);
    }
  }
}

async function pushPieces(userId: string): Promise<void> {
  const db = getDb();
  const queued = await takeQueued('pieces');
  for (const q of queued) {
    try {
      const r = await db.getFirstAsync<Row>('SELECT * FROM pieces WHERE id = ?;', q.row_id);
      if (!r) { await clearQueued('pieces', q); continue; }

      const { data: existing, error: exErr } = await supabase
        .from('pieces')
        .select('id, updated_at')
        .eq('id', r.id as string)
        .maybeSingle();
      if (exErr) throw exErr;

      // Cloud already at least as new? Skip — most importantly this stops
      // the migration-seeded first sync from re-uploading a whole imported
      // library's images back to where they came from.
      if (existing && Number(existing.updated_at) >= Number(r.updated_at)) {
        await clearQueued('pieces', q);
        continue;
      }

      const base: Row = {
        title: r.title, composer: r.composer,
        units_json: r.units_json, folder_id: r.folder_id,
        sort_order: r.sort_order ?? 0, due_date: r.due_date,
        performance_tempo: r.performance_tempo,
        document_id: r.document_id, regions_json: r.regions_json,
        updated_at: r.updated_at, deleted_at: r.deleted_at,
      };

      // Tombstones need no asset work: send the marker if the cloud knows
      // this row; there is nothing worth creating if it doesn't.
      if (r.deleted_at) {
        if (existing) {
          const { error } = await supabase
            .from('pieces')
            .update(base)
            .eq('id', r.id as string)
            .lte('updated_at', r.updated_at as number);
          if (error) throw error;
        }
        await clearQueued('pieces', q);
        continue;
      }

      // Upload sandbox images so the web copy renders — healing stale
      // container paths first (absolute paths break on every app update).
      // Original keeps the canonical path, the working crop gets the -crop
      // variant (same convention the web upload path uses).
      let sourceUri = r.source_uri as string;
      let originalUri = r.original_uri as string | null;
      let thumbUri = r.thumbnail_uri as string | null;
      if (isLocalUri(originalUri)) {
        const healed = healLocalUri(originalUri);
        if (healed) {
          const { ext, contentType } = extOf(healed);
          originalUri = await uploadLocalFile(healed, `${userId}/${r.id}.${ext}`, contentType);
        } else {
          originalUri = null; // full photo gone — the crop below may survive
        }
      }
      if (isLocalUri(sourceUri)) {
        const healed = healLocalUri(sourceUri);
        if (healed) {
          const { ext, contentType } = extOf(healed);
          const path = originalUri
            ? `${userId}/${r.id}-crop.${ext}`
            : `${userId}/${r.id}.${ext}`;
          sourceUri = await uploadLocalFile(healed, path, contentType);
        }
      }
      if (isLocalUri(thumbUri) || !thumbUri) {
        thumbUri = isLocalUri(sourceUri) ? null : sourceUri;
      }

      if (existing) {
        // Never overwrite good cloud URLs with dead sandbox paths: URI
        // columns join the patch only when they're real URLs.
        const patch: Row = { ...base };
        if (!isLocalUri(sourceUri)) {
          patch.source_uri = sourceUri;
          patch.thumbnail_uri = thumbUri;
          patch.original_uri = originalUri;
        }
        const { error } = await supabase
          .from('pieces')
          .update(patch)
          .eq('id', r.id as string)
          .lte('updated_at', r.updated_at as number);
        if (error) throw error;
      } else if (isLocalUri(sourceUri) && !r.document_id) {
        // Standalone photo passage whose image file is gone everywhere: the
        // image IS the passage, so there is nothing recoverable to sync.
        // Dropping it (with a trace) beats clogging the outbox forever.
        console.warn('[sync] piece skipped — image lost locally, nothing to save', r.id);
        await clearQueued('pieces', q);
        continue;
      } else {
        // Document-child passages stay valuable without their crop cache:
        // the boxes + name + history sync, and the marked region can always
        // be re-rendered from the parent document's pages.
        const { error } = await supabase.from('pieces').insert({
          id: r.id, source_kind: r.source_kind,
          source_uri: isLocalUri(sourceUri) ? '' : sourceUri,
          thumbnail_uri: isLocalUri(sourceUri) ? null : thumbUri,
          original_uri: originalUri,
          annotation_data: r.annotation_data ?? null,
          annotation_image_uri: r.annotation_image_uri ?? null,
          created_at: r.created_at, ...base,
        });
        // 23505 = this id already exists in the cloud but RLS hid it from
        // our existence check — it belongs to a DIFFERENT account (a library
        // imported under account A, device now signed into account B).
        // This device's copy stays local; retrying can never succeed.
        if (error && error.code === '23505') {
          console.warn('[sync] piece belongs to another account — kept local only', r.id);
        } else if (error) {
          throw error;
        }
      }
      await clearQueued('pieces', q);
    } catch (e) {
      console.warn('[sync] piece push deferred', q.row_id, e);
      await markDeferred('pieces', q.row_id, e);
    }
  }
}

// Pencil marks whose local save outran their cloud mirror (offline drawing,
// stale session, passage not pushed yet). Not outbox-driven: the saved/
// mirrored stamps on the rows themselves are the queue, so a crash can never
// lose track of an unmirrored drawing.
async function pushAnnotations(): Promise<void> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: string;
    annotation_data: string | null;
    annotation_image_uri: string | null;
    annotation_saved_at: number;
  }>(
    `SELECT id, annotation_data, annotation_image_uri, annotation_saved_at
     FROM pieces
     WHERE annotation_saved_at IS NOT NULL
       AND annotation_saved_at > COALESCE(annotation_mirrored_at, 0)
     LIMIT 100;`,
  );
  for (const r of rows) {
    try {
      // .select confirms a row was actually written — PostgREST reports a
      // zero-row update (piece not in the cloud yet) as success. Zero rows =
      // leave unmirrored; it retries after the piece's own push lands.
      const { data, error } = await supabase
        .from('pieces')
        .update({
          annotation_data: r.annotation_data,
          annotation_image_uri: r.annotation_image_uri,
        })
        .eq('id', r.id)
        .select('id');
      if (error) throw error;
      if ((data ?? []).length === 0) continue;
      await withApplying(() =>
        db.runAsync(
          'UPDATE pieces SET annotation_mirrored_at = ? WHERE id = ? AND annotation_saved_at = ?;',
          r.annotation_saved_at,
          r.id,
          r.annotation_saved_at,
        ),
      );
    } catch (e) {
      console.warn('[sync] annotation push deferred', r.id, e);
    }
  }
}

async function pushDocumentAnnotations(): Promise<void> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    document_id: string;
    page: number;
    annotation_data: string | null;
    annotation_image_uri: string | null;
    updated_at: number;
    saved_at: number;
  }>(
    `SELECT document_id, page, annotation_data, annotation_image_uri, updated_at, saved_at
     FROM document_annotations
     WHERE saved_at IS NOT NULL AND saved_at > COALESCE(mirrored_at, 0)
     LIMIT 100;`,
  );
  for (const r of rows) {
    try {
      const { error } = await supabase.from('document_annotations').upsert({
        document_id: r.document_id,
        page: r.page,
        annotation_data: r.annotation_data,
        annotation_image_uri: r.annotation_image_uri,
        updated_at: r.updated_at,
      });
      if (error) {
        // 23503 = the parent document isn't in the cloud. Deleted/gone
        // locally → these marks can never land and are invisible anyway;
        // stamp them mirrored so they stop retrying. Otherwise the document
        // push was merely deferred — retry next run.
        if ((error as { code?: string }).code === '23503') {
          const parent = await db.getFirstAsync<{ deleted_at: number | null }>(
            'SELECT deleted_at FROM documents WHERE id = ?;',
            r.document_id,
          );
          if (!parent || parent.deleted_at != null) {
            await db.runAsync(
              'UPDATE document_annotations SET mirrored_at = ? WHERE document_id = ? AND page = ?;',
              r.saved_at,
              r.document_id,
              r.page,
            );
            continue;
          }
        }
        throw error;
      }
      await db.runAsync(
        'UPDATE document_annotations SET mirrored_at = ? WHERE document_id = ? AND page = ? AND saved_at = ?;',
        r.saved_at,
        r.document_id,
        r.page,
        r.saved_at,
      );
    } catch (e) {
      console.warn('[sync] doc-annotation push deferred', `${r.document_id} p${r.page}`, e);
    }
  }
}

async function pushExercises(): Promise<void> {
  const db = getDb();
  const queued = await takeQueued('exercises');
  for (const q of queued) {
    try {
      const r = await db.getFirstAsync<Row>('SELECT * FROM exercises WHERE id = ?;', q.row_id);
      if (!r) { await clearQueued('exercises', q); continue; }
      const row: Row = {
        id: r.id, piece_id: r.piece_id, strategy: r.strategy,
        config_json: r.config_json ?? '{}', name: r.name,
        sort_order: r.sort_order ?? 0,
        created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
      };
      const { error: insErr } = await supabase
        .from('exercises')
        .upsert([row], { onConflict: 'id', ignoreDuplicates: true });
      if (insErr) {
        // 23503 = the parent piece isn't in the cloud. If that piece is
        // deleted (or gone) locally, this exercise is invisible anyway —
        // drop it. Otherwise the piece's own push was deferred, so defer.
        if ((insErr as { code?: string }).code === '23503') {
          const parent = await db.getFirstAsync<{ deleted_at: number | null }>(
            'SELECT deleted_at FROM pieces WHERE id = ?;',
            r.piece_id as string,
          );
          if (!parent || parent.deleted_at != null) {
            await clearQueued('exercises', q);
            continue;
          }
        }
        throw insErr;
      }
      const { error } = await supabase
        .from('exercises')
        .update({
          piece_id: r.piece_id, strategy: r.strategy,
          config_json: r.config_json ?? '{}', name: r.name,
          sort_order: r.sort_order ?? 0,
          updated_at: r.updated_at, deleted_at: r.deleted_at,
        })
        .eq('id', r.id as string)
        .lte('updated_at', r.updated_at as number);
      if (error) throw error;
      await clearQueued('exercises', q);
    } catch (e) {
      console.warn('[sync] exercise push deferred', q.row_id, e);
      await markDeferred('exercises', q.row_id, e);
    }
  }
}

async function pushProgress(table: string, cols: string[]): Promise<void> {
  const db = getDb();
  const queued = await takeQueued(table);
  for (const q of queued) {
    try {
      const r = await db.getFirstAsync<Row>(
        `SELECT * FROM ${table} WHERE exercise_id = ?;`,
        q.row_id,
      );
      if (!r) { await clearQueued(table, q); continue; }
      const row: Row = { exercise_id: r.exercise_id };
      for (const c of cols) row[c] = r[c];
      const { error: insErr } = await supabase
        .from(table)
        .upsert([row], { onConflict: 'exercise_id', ignoreDuplicates: true });
      if (insErr) {
        // Parent exercise not in the cloud. Drop the entry when the chain
        // above it is dead — exercise gone/deleted, OR its PIECE deleted
        // (a deleted piece's exercises are dropped from sync, so their
        // progress can never land and is invisible in the app anyway).
        // A live chain means the exercise push was merely deferred: retry.
        if ((insErr as { code?: string }).code === '23503') {
          const chain = await db.getFirstAsync<{ ex_deleted: number | null; piece_deleted: number | null; piece_exists: number }>(
            `SELECT e.deleted_at AS ex_deleted, p.deleted_at AS piece_deleted,
                    CASE WHEN p.id IS NULL THEN 0 ELSE 1 END AS piece_exists
             FROM exercises e LEFT JOIN pieces p ON p.id = e.piece_id
             WHERE e.id = ?;`,
            r.exercise_id as string,
          );
          const chainDead =
            !chain ||
            chain.ex_deleted != null ||
            !chain.piece_exists ||
            chain.piece_deleted != null;
          if (chainDead) {
            await clearQueued(table, q);
            continue;
          }
        }
        throw insErr;
      }
      const patch: Row = {};
      for (const c of cols) patch[c] = r[c];
      const { error } = await supabase
        .from(table)
        .update(patch)
        .eq('exercise_id', r.exercise_id as string)
        .lte('updated_at', r.updated_at as number);
      if (error) throw error;
      await clearQueued(table, q);
    } catch (e) {
      console.warn(`[sync] ${table} push deferred`, q.row_id, e);
      await markDeferred(table, q.row_id, e);
    }
  }
}

async function pushStrategyLastUsed(): Promise<void> {
  const db = getDb();
  const queued = await takeQueued('strategy_last_used');
  for (const q of queued) {
    try {
      const sep = q.row_id.indexOf('|');
      const pieceId = q.row_id.slice(0, sep);
      const strategy = q.row_id.slice(sep + 1);
      const r = await db.getFirstAsync<Row>(
        'SELECT * FROM strategy_last_used WHERE piece_id = ? AND strategy = ?;',
        pieceId,
        strategy,
      );
      if (!r) { await clearQueued('strategy_last_used', q); continue; }
      const { error: insErr } = await supabase
        .from('strategy_last_used')
        .upsert(
          [{ piece_id: pieceId, strategy, last_used_at: r.last_used_at }],
          { onConflict: 'user_id,piece_id,strategy', ignoreDuplicates: true },
        );
      if (insErr) {
        // Parent piece not in the cloud: gone/deleted locally → drop the
        // stamp; otherwise the piece push was deferred, so defer this too.
        if ((insErr as { code?: string }).code === '23503') {
          const parent = await db.getFirstAsync<{ deleted_at: number | null }>(
            'SELECT deleted_at FROM pieces WHERE id = ?;',
            pieceId,
          );
          if (!parent || parent.deleted_at != null) {
            await clearQueued('strategy_last_used', q);
            continue;
          }
        }
        throw insErr;
      }
      const { error } = await supabase
        .from('strategy_last_used')
        .update({ last_used_at: r.last_used_at })
        .eq('piece_id', pieceId)
        .eq('strategy', strategy)
        .lte('last_used_at', r.last_used_at as number);
      if (error) throw error;
      await clearQueued('strategy_last_used', q);
    } catch (e) {
      console.warn('[sync] strategy_last_used push deferred', q.row_id, e);
      await markDeferred('strategy_last_used', q.row_id, e);
    }
  }
}

async function pushPracticeLog(): Promise<void> {
  const db = getDb();
  const queued = await takeQueued('practice_log');
  if (queued.length === 0) return;

  const ids = queued.map((q) => q.row_id);
  const { data: existing, error: exErr } = await supabase
    .from('practice_log')
    .select('client_id')
    .in('client_id', ids);
  if (exErr) throw exErr;
  const inCloud = new Set((existing ?? []).map((r) => r.client_id as string));

  for (const q of queued) {
    try {
      const r = await db.getFirstAsync<Row>(
        'SELECT * FROM practice_log WHERE sync_id = ?;',
        q.row_id,
      );
      if (!r) { await clearQueued('practice_log', q); continue; }
      if (inCloud.has(q.row_id)) {
        const { error } = await supabase
          .from('practice_log')
          .update({
            data_json: r.data_json,
            updated_at: r.updated_at,
            deleted_at: r.deleted_at,
          })
          .eq('client_id', q.row_id)
          .lte('updated_at', r.updated_at as number);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('practice_log').insert({
          client_id: q.row_id,
          piece_id: r.piece_id, strategy: r.strategy,
          practiced_at: r.practiced_at, data_json: r.data_json,
          exercise_id: r.exercise_id, document_id: r.document_id,
          updated_at: r.updated_at ?? r.practiced_at,
          deleted_at: r.deleted_at,
        });
        // 23505 = someone else inserted this client_id between our check and
        // now (e.g. a concurrent web flush) — the session is saved, move on.
        if (error && error.code !== '23505') throw error;
      }
      await clearQueued('practice_log', q);
    } catch (e) {
      console.warn('[sync] practice_log push deferred', q.row_id, e);
      await markDeferred('practice_log', q.row_id, e);
    }
  }
}

// ── PULL ────────────────────────────────────────────────────────────────────

async function pullAll(): Promise<void> {
  await pullTable('folders', applyFolder);
  await pullTable('documents', applyDocument);
  await pullTable('pieces', applyPiece);
  await pullDocumentAnnotations();
  await pullTable('exercises', applyExercise);
  await pullTable('tempo_ladder_progress', applyTempoLadderProgress);
  await pullTable('click_up_progress', applyClickUpProgress);
  await pullTable('strategy_last_used', applyStrategyLastUsed);
  await pullTable('practice_log', applyPracticeLog);
}

async function pullTable(
  table: string,
  apply: (row: Row) => Promise<void>,
): Promise<void> {
  const wmKey = `wm_${table}`;
  let watermark = (await getState(wmKey)) ?? '1970-01-01T00:00:00Z';
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('server_updated_at', watermark)
      .order('server_updated_at', { ascending: true })
      .limit(PULL_PAGE);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      await withApplying(() => apply(row as Row));
    }
    watermark = String((data[data.length - 1] as Row).server_updated_at);
    await setState(wmKey, watermark);
    if (data.length < PULL_PAGE) break;
  }
}

// document_annotations pull needs its own cloud groundwork (server_updated_at
// — db/migrations/2026-08-15-sync-phase3-annotations.sql). Until it's applied
// the pull is a quiet no-op; pushes work regardless. Probed once per launch.
let docAnnCloudReady: boolean | null = null;

async function pullDocumentAnnotations(): Promise<void> {
  if (docAnnCloudReady === false) return;
  try {
    await pullTable('document_annotations', applyDocumentAnnotation);
    docAnnCloudReady = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/server_updated_at/.test(msg)) {
      docAnnCloudReady = false;
      return;
    }
    throw e;
  }
}

async function applyDocumentAnnotation(c: Row): Promise<void> {
  const db = getDb();
  const local = await db.getFirstAsync<{
    updated_at: number;
    saved_at: number | null;
    mirrored_at: number | null;
  }>(
    'SELECT updated_at, saved_at, mirrored_at FROM document_annotations WHERE document_id = ? AND page = ?;',
    c.document_id as string,
    c.page as number,
  );
  if (local) {
    // This device's unpushed strokes win until they've mirrored.
    const unmirrored =
      local.saved_at != null && local.saved_at > (local.mirrored_at ?? 0);
    if (unmirrored) return;
    if (!cloudWins(c, local.updated_at)) return;
  }
  await db.runAsync(
    `INSERT INTO document_annotations (document_id, page, annotation_data, annotation_image_uri, updated_at, saved_at, mirrored_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL)
     ON CONFLICT (document_id, page) DO UPDATE SET
       annotation_data = excluded.annotation_data,
       annotation_image_uri = excluded.annotation_image_uri,
       updated_at = excluded.updated_at,
       saved_at = NULL,
       mirrored_at = NULL;`,
    c.document_id as string,
    c.page as number,
    (c.annotation_data as string) ?? null,
    (c.annotation_image_uri as string) ?? null,
    (c.updated_at as number) ?? 0,
  );
}

// Newest-wins compare: apply the cloud row only when it's at least as new as
// what we have. `>=` (not `>`) so equal-timestamp content converges.
function cloudWins(cloud: Row, localUpdatedAt: number | null | undefined): boolean {
  return Number(cloud.updated_at ?? 0) >= Number(localUpdatedAt ?? 0);
}

async function applyFolder(c: Row): Promise<void> {
  const db = getDb();
  const local = await db.getFirstAsync<{ updated_at: number }>(
    'SELECT updated_at FROM folders WHERE id = ?;',
    c.id as string,
  );
  if (!local) {
    await db.runAsync(
      `INSERT INTO folders (id, name, parent_folder_id, sort_order, color, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      c.id as string, c.name as string, (c.parent_folder_id as string) ?? null,
      (c.sort_order as number) ?? 0, (c.color as string) ?? null,
      c.created_at as number, c.updated_at as number, (c.deleted_at as number) ?? null,
    );
  } else if (cloudWins(c, local.updated_at)) {
    await db.runAsync(
      `UPDATE folders SET name = ?, parent_folder_id = ?, sort_order = ?, color = ?, updated_at = ?, deleted_at = ? WHERE id = ?;`,
      c.name as string, (c.parent_folder_id as string) ?? null,
      (c.sort_order as number) ?? 0, (c.color as string) ?? null,
      c.updated_at as number, (c.deleted_at as number) ?? null, c.id as string,
    );
  }
}

// Documents + pieces: existing rows get catalog updates only (their asset
// columns stay local — the iPad's files are its source of truth). BRAND-NEW
// cloud rows are inserted whole, cloud https URLs included: screens render
// those directly, and opening the item downloads the files for offline
// (Phase 3 lazy assets).
async function applyDocument(c: Row): Promise<void> {
  const db = getDb();
  const local = await db.getFirstAsync<{ updated_at: number }>(
    'SELECT updated_at FROM documents WHERE id = ?;',
    c.id as string,
  );
  if (!local) {
    if (c.deleted_at) return; // never materialize already-deleted music
    await db.runAsync(
      `INSERT INTO documents (id, title, composer, source_kind, original_uri, page_count, pages_json, folder_id, sort_order, sections_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      c.id as string, c.title as string, (c.composer as string) ?? null,
      c.source_kind as string, (c.original_uri as string) ?? null,
      (c.page_count as number) ?? 0, (c.pages_json as string) ?? '[]',
      (c.folder_id as string) ?? null, (c.sort_order as number) ?? 0,
      (c.sections_json as string) ?? null, c.created_at as number,
      c.updated_at as number, null,
    );
    return;
  }
  if (!cloudWins(c, local.updated_at)) return;
  await db.runAsync(
    `UPDATE documents SET title = ?, composer = ?, folder_id = ?, sort_order = ?, sections_json = ?, updated_at = ?, deleted_at = ? WHERE id = ?;`,
    c.title as string, (c.composer as string) ?? null, (c.folder_id as string) ?? null,
    (c.sort_order as number) ?? 0, (c.sections_json as string) ?? null,
    c.updated_at as number, (c.deleted_at as number) ?? null, c.id as string,
  );
}

async function applyPiece(c: Row): Promise<void> {
  const db = getDb();
  const local = await db.getFirstAsync<{
    updated_at: number;
    annotation_saved_at: number | null;
    annotation_mirrored_at: number | null;
  }>(
    'SELECT updated_at, annotation_saved_at, annotation_mirrored_at FROM pieces WHERE id = ?;',
    c.id as string,
  );
  if (!local) {
    if (c.deleted_at) return; // never materialize already-deleted music
    await db.runAsync(
      `INSERT INTO pieces (id, title, composer, source_kind, source_uri, thumbnail_uri, original_uri, units_json, folder_id, sort_order, due_date, performance_tempo, document_id, regions_json, annotation_data, annotation_image_uri, annotation_saved_at, annotation_mirrored_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL);`,
      c.id as string, c.title as string, (c.composer as string) ?? null,
      (c.source_kind as string) ?? 'image', (c.source_uri as string) ?? '',
      (c.thumbnail_uri as string) ?? null, (c.original_uri as string) ?? null,
      (c.units_json as string) ?? null, (c.folder_id as string) ?? null,
      (c.sort_order as number) ?? 0, (c.due_date as number) ?? null,
      (c.performance_tempo as number) ?? null, (c.document_id as string) ?? null,
      (c.regions_json as string) ?? null, (c.annotation_data as string) ?? null,
      (c.annotation_image_uri as string) ?? null,
      c.created_at as number, c.updated_at as number,
    );
    return;
  }
  if (!cloudWins(c, local.updated_at)) return;
  // Asset URI columns deliberately untouched on updates: local files stay
  // the iPad's source of truth.
  await db.runAsync(
    `UPDATE pieces SET title = ?, composer = ?, units_json = ?, folder_id = ?, sort_order = ?, due_date = ?, performance_tempo = ?, document_id = ?, regions_json = ?, updated_at = ?, deleted_at = ? WHERE id = ?;`,
    c.title as string, (c.composer as string) ?? null, (c.units_json as string) ?? null,
    (c.folder_id as string) ?? null, (c.sort_order as number) ?? 0,
    (c.due_date as number) ?? null, (c.performance_tempo as number) ?? null,
    (c.document_id as string) ?? null, (c.regions_json as string) ?? null,
    c.updated_at as number, (c.deleted_at as number) ?? null, c.id as string,
  );
  // Adopt the cloud's pencil marks — unless this device holds strokes the
  // cloud hasn't seen yet (those push first; an offline drawing must never
  // be clobbered by an older web copy). Clearing saved/mirrored records that
  // the local copy now came FROM the cloud, so reads go cloud-first again.
  const unmirrored =
    local.annotation_saved_at != null &&
    local.annotation_saved_at > (local.annotation_mirrored_at ?? 0);
  if (!unmirrored) {
    await db.runAsync(
      `UPDATE pieces SET annotation_data = ?, annotation_image_uri = ?, annotation_saved_at = NULL, annotation_mirrored_at = NULL WHERE id = ?;`,
      (c.annotation_data as string) ?? null,
      (c.annotation_image_uri as string) ?? null,
      c.id as string,
    );
  }
}

async function applyExercise(c: Row): Promise<void> {
  const db = getDb();
  const local = await db.getFirstAsync<{ updated_at: number }>(
    'SELECT updated_at FROM exercises WHERE id = ?;',
    c.id as string,
  );
  if (!local) {
    await db.runAsync(
      `INSERT INTO exercises (id, piece_id, strategy, config_json, name, sort_order, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      c.id as string, c.piece_id as string, c.strategy as string,
      (c.config_json as string) ?? '{}', (c.name as string) ?? null,
      (c.sort_order as number) ?? 0, c.created_at as number,
      c.updated_at as number, (c.deleted_at as number) ?? null,
    );
  } else if (cloudWins(c, local.updated_at)) {
    await db.runAsync(
      `UPDATE exercises SET piece_id = ?, strategy = ?, config_json = ?, name = ?, sort_order = ?, updated_at = ?, deleted_at = ? WHERE id = ?;`,
      c.piece_id as string, c.strategy as string, (c.config_json as string) ?? '{}',
      (c.name as string) ?? null, (c.sort_order as number) ?? 0,
      c.updated_at as number, (c.deleted_at as number) ?? null, c.id as string,
    );
  }
}

async function applyTempoLadderProgress(c: Row): Promise<void> {
  const db = getDb();
  const local = await db.getFirstAsync<{ updated_at: number }>(
    'SELECT updated_at FROM tempo_ladder_progress WHERE exercise_id = ?;',
    c.exercise_id as string,
  );
  if (local && !cloudWins(c, local.updated_at)) return;
  await db.runAsync(
    `INSERT OR REPLACE INTO tempo_ladder_progress
       (exercise_id, mode, start_tempo, goal_tempo, increment, cluster_low, cluster_high, target_reps, goal_date, custom_pattern_id, custom_block_index, custom_rep_in_block, current_tempo, current_streak, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    c.exercise_id as string, c.mode as string, c.start_tempo as number,
    c.goal_tempo as number, (c.increment as number) ?? null,
    (c.cluster_low as number) ?? null, (c.cluster_high as number) ?? null,
    c.target_reps as number, (c.goal_date as number) ?? null,
    (c.custom_pattern_id as string) ?? null, (c.custom_block_index as number) ?? null,
    (c.custom_rep_in_block as number) ?? null, c.current_tempo as number,
    (c.current_streak as number) ?? 0, c.updated_at as number,
  );
}

async function applyClickUpProgress(c: Row): Promise<void> {
  const db = getDb();
  const local = await db.getFirstAsync<{ updated_at: number }>(
    'SELECT updated_at FROM click_up_progress WHERE exercise_id = ?;',
    c.exercise_id as string,
  );
  if (local && !cloudWins(c, local.updated_at)) return;
  await db.runAsync(
    `INSERT OR REPLACE INTO click_up_progress (exercise_id, current_index, updated_at) VALUES (?, ?, ?);`,
    c.exercise_id as string, (c.current_index as number) ?? 0, c.updated_at as number,
  );
}

async function applyStrategyLastUsed(c: Row): Promise<void> {
  const db = getDb();
  const local = await db.getFirstAsync<{ last_used_at: number }>(
    'SELECT last_used_at FROM strategy_last_used WHERE piece_id = ? AND strategy = ?;',
    c.piece_id as string,
    c.strategy as string,
  );
  if (local && Number(c.last_used_at ?? 0) < Number(local.last_used_at ?? 0)) return;
  await db.runAsync(
    `INSERT OR REPLACE INTO strategy_last_used (piece_id, strategy, last_used_at) VALUES (?, ?, ?);`,
    c.piece_id as string, c.strategy as string, c.last_used_at as number,
  );
}

async function applyPracticeLog(c: Row): Promise<void> {
  // Recording entries live cloud-side on both platforms and are merged into
  // the views at read time — materializing them locally would double them up.
  if (c.strategy === 'recording') return;
  const db = getDb();
  const syncId = (c.client_id as string) ?? `web_${c.id}`;
  const local = await db.getFirstAsync<{ id: number; updated_at: number | null }>(
    'SELECT id, updated_at FROM practice_log WHERE sync_id = ?;',
    syncId,
  );
  if (local) {
    if (!cloudWins(c, local.updated_at)) return;
    await db.runAsync(
      'UPDATE practice_log SET data_json = ?, updated_at = ?, deleted_at = ? WHERE sync_id = ?;',
      (c.data_json as string) ?? null,
      (c.updated_at as number) ?? (c.practiced_at as number),
      (c.deleted_at as number) ?? null,
      syncId,
    );
    return;
  }
  // Belt-and-braces against pre-reconcile duplicates: if a legacy cloud row
  // (no client_id) matches an existing local session exactly, bind instead
  // of inserting a twin.
  if (!c.client_id) {
    const twin = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM practice_log WHERE piece_id = ? AND strategy = ? AND practiced_at = ? AND sync_id NOT LIKE 'web_%';",
      c.piece_id as string, c.strategy as string, c.practiced_at as number,
    );
    if (twin) return;
  }
  if (c.deleted_at) return; // don't materialize already-deleted history
  await db.runAsync(
    `INSERT INTO practice_log (sync_id, piece_id, strategy, practiced_at, data_json, exercise_id, document_id, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    syncId, c.piece_id as string, c.strategy as string, c.practiced_at as number,
    (c.data_json as string) ?? null, (c.exercise_id as string) ?? null,
    (c.document_id as string) ?? null,
    (c.updated_at as number) ?? (c.practiced_at as number),
    (c.deleted_at as number) ?? null,
  );
}
