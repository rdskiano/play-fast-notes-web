import { Directory, File, Paths } from 'expo-file-system';

import seedData from '@/assets/seeds/initial-seed.json';
import { getDb } from './client';

const SEED_VERSION = 1;

type Row = Record<string, unknown>;

type SeedFile = {
  version: number;
  exported_at: number;
  tables: Record<string, Row[]>;
  files: Record<string, string>;
};

// Insertion order matters for foreign-key constraints.
const TABLE_ORDER = [
  'folders',
  'pieces',
  'exercises',
  'sessions',
  'tempo_ladder_progress',
  'click_up_progress',
  'strategy_last_used',
  'settings',
  'practice_log',
] as const;

function basename(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const parts = uri.split('/');
  return parts[parts.length - 1] || null;
}

export async function exportSeed(): Promise<string> {
  const db = getDb();

  const tables: Record<string, Row[]> = {};
  for (const t of TABLE_ORDER) {
    tables[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t};`);
  }

  // iOS rewrites the app container UUID on every reinstall, so absolute
  // source_uri values from previous builds become dead links even though
  // the actual files still live in Documents/pieces/. When the stored URI
  // does not resolve, fall back to looking up the basename in the current
  // piecesDir.
  const piecesDir = new Directory(Paths.document, 'pieces');
  const files: Record<string, string> = {};
  let included = 0;
  let missing = 0;
  for (const p of tables.pieces) {
    for (const field of ['source_uri', 'thumbnail_uri'] as const) {
      const uri = p[field] as string | null;
      const name = basename(uri);
      if (!uri || !name) continue;
      try {
        let f = new File(uri);
        if (!f.exists) {
          if (!piecesDir.exists) {
            missing++;
            continue;
          }
          f = new File(piecesDir, name);
          if (!f.exists) {
            missing++;
            continue;
          }
        }
        files[name] = await f.base64();
        p[field] = name;
        included++;
      } catch (e) {
        console.warn(`[seed] Failed to read ${field} for piece`, p.id, e);
        missing++;
      }
    }
  }
  console.log(
    `[seed] Export: ${tables.pieces.length} pieces, ${included} files included, ${missing} files missing.`,
  );

  const seed: SeedFile = {
    version: SEED_VERSION,
    exported_at: Date.now(),
    tables,
    files,
  };

  const out = new File(Paths.document, 'seed-export.json');
  if (out.exists) out.delete();
  out.create();
  out.write(JSON.stringify(seed));
  return out.uri;
}

async function isDbEmpty(): Promise<boolean> {
  const db = getDb();
  const pieces = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM pieces;');
  const folders = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM folders;');
  return (pieces?.c ?? 0) === 0 && (folders?.c ?? 0) === 0;
}

export async function seedIfEmpty(): Promise<void> {
  const seed = seedData as Partial<SeedFile>;
  if (!seed?.tables || !seed.version) return;
  if (!(await isDbEmpty())) return;

  console.log('[seed] Empty DB detected, importing seed...');

  const piecesDir = new Directory(Paths.document, 'pieces');
  if (!piecesDir.exists) piecesDir.create({ intermediates: true });

  const writtenPaths: Record<string, string> = {};
  for (const [name, b64] of Object.entries(seed.files ?? {})) {
    const f = new File(piecesDir, name);
    if (f.exists) f.delete();
    f.create();
    f.write(b64, { encoding: 'base64' });
    writtenPaths[name] = f.uri;
  }

  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const t of TABLE_ORDER) {
      const rows = seed.tables![t] ?? [];
      for (const row of rows) {
        const r: Row = { ...row };
        if (t === 'pieces') {
          const src = r.source_uri;
          const thumb = r.thumbnail_uri;
          if (typeof src === 'string' && writtenPaths[src]) r.source_uri = writtenPaths[src];
          if (typeof thumb === 'string' && writtenPaths[thumb]) r.thumbnail_uri = writtenPaths[thumb];
        }
        const cols = Object.keys(r);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => '?').join(', ');
        const sql = `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders});`;
        const vals = cols.map((c) => r[c] as string | number | null);
        await db.runAsync(sql, ...vals);
      }
    }
  });

  console.log('[seed] Imported successfully');
}
