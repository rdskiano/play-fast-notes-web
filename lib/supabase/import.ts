// Supabase → iPad one-shot import.
//
// Reverse direction of the web app's /import-seed route. The user signs in
// with their Supabase credentials, we fetch every row scoped by RLS, download
// every referenced file (piece images, document page renders, original PDFs)
// to the iPad's app sandbox, rewrite all URIs to local paths, and insert into
// SQLite within a transaction. After this runs, the iPad library shows the
// user's real data and practice flows work end-to-end.
//
// Caveats:
// - Self-Led Recording audio (Supabase recordings bucket) is NOT downloaded.
//   The iPad app has no Recording UI yet; recording strategy entries in
//   practice_log render without playback and that's fine for now.
// - Sessions table doesn't exist in the web schema, so it's skipped.
// - The whole thing is one-way. iPad edits don't propagate back to Supabase.
//   That sync is its own (deferred) project.

import { Directory, File, Paths } from 'expo-file-system';

import { supabase } from './client';
import { getDb } from '../db/client';

type Row = Record<string, unknown>;

// Parents before children. FKs in SQLite mean we must insert in this order.
const INSERT_ORDER = [
  'folders',
  'documents',
  'pieces',
  'exercises',
  'tempo_ladder_progress',
  'click_up_progress',
  'strategy_last_used',
  'practice_log',
  'settings',
] as const;

// Children before parents for the wipe step.
const WIPE_ORDER = [...INSERT_ORDER].reverse();

export type ImportProgress = (line: string) => void;

export type ImportOptions = {
  email: string;
  password: string;
  wipeFirst: boolean;
  onProgress: ImportProgress;
};

export type ImportResult = {
  ok: boolean;
  tables: Record<string, number>;
  filesDownloaded: number;
  filesFailed: number;
};

function isHttpUrl(s: unknown): s is string {
  return typeof s === 'string' && /^https?:\/\//.test(s);
}

function basenameFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.split('/').filter(Boolean);
    const last = path[path.length - 1] || fallback;
    // Strip cache-buster query params (Supabase URLs include `?v=<ts>`).
    return last;
  } catch {
    return fallback;
  }
}

function extFromUrl(url: string, defaultExt: string): string {
  const name = basenameFromUrl(url, '');
  const dot = name.lastIndexOf('.');
  if (dot < 0) return defaultExt;
  return name.slice(dot + 1).toLowerCase();
}

// Fetch a URL and write the bytes to `target`. Returns the file's URI on
// success. Throws on HTTP errors or write failures.
async function downloadToFile(url: string, target: File): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const ab = await res.arrayBuffer();
  // Base64 round-trip — expo-file-system File.write accepts base64 strings.
  // For large PDFs this uses ~33% more memory than the raw buffer; acceptable
  // for a one-time import on modern iPads.
  const bytes = new Uint8Array(ab);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  const b64 = btoa(binary);
  if (target.exists) target.delete();
  target.create();
  target.write(b64, { encoding: 'base64' });
  return target.uri;
}

// Strip Supabase-specific columns and any nulls that violate iPad NOT NULL
// constraints. Returns a row that can be INSERTed straight into SQLite.
function sanitizeRow(table: string, row: Row): Row {
  const out: Row = { ...row };
  // user_id is a Supabase RLS column; iPad SQLite doesn't have it.
  delete out.user_id;
  // documents.sort_order, sections_json may come back as null/undefined from
  // Supabase even though iPad's column is NOT NULL DEFAULT 0 — let SQLite
  // default rather than passing an explicit null.
  if (out.sort_order == null) delete out.sort_order;
  // practice_log.id is a bigserial in Supabase. Keep the value; iPad's INTEGER
  // PRIMARY KEY accepts explicit ids and AUTOINCREMENT advances past them.
  return out;
}

async function fetchTable(table: string, onProgress: ImportProgress): Promise<Row[]> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    onProgress(`  ${table}: ✗ ${error.message}`);
    return [];
  }
  onProgress(`  ${table}: fetched ${(data ?? []).length} rows`);
  return (data ?? []) as Row[];
}

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const { email, password, wipeFirst, onProgress } = opts;

  // 1. Sign in.
  onProgress(`Signing in as ${email.trim()}…`);
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (signInError || !signInData.session) {
    throw new Error(signInError?.message ?? 'Sign-in failed');
  }
  onProgress(`Signed in as ${signInData.session.user.email}.`);

  // 2. Fetch all tables.
  onProgress('Fetching tables…');
  const tables: Record<string, Row[]> = {};
  for (const t of INSERT_ORDER) {
    tables[t] = await fetchTable(t, onProgress);
  }

  // 3. Download files — pieces images, document originals, document pages.
  onProgress('Downloading files…');
  const piecesDir = new Directory(Paths.document, 'pieces');
  if (!piecesDir.exists) piecesDir.create({ intermediates: true });
  const documentsDir = new Directory(Paths.document, 'documents');
  if (!documentsDir.exists) documentsDir.create({ intermediates: true });

  let filesDownloaded = 0;
  let filesFailed = 0;

  // 3a. Piece source + thumbnail images.
  for (const p of tables.pieces) {
    for (const field of ['source_uri', 'thumbnail_uri'] as const) {
      const url = p[field];
      if (!isHttpUrl(url)) continue;
      try {
        const ext = extFromUrl(url, 'jpg');
        const target = new File(piecesDir, `${p.id}-${field === 'thumbnail_uri' ? 'thumb' : 'src'}.${ext}`);
        const localUri = await downloadToFile(url, target);
        p[field] = localUri;
        filesDownloaded++;
        onProgress(`    ↓ piece ${p.id} ${field}`);
      } catch (e) {
        filesFailed++;
        onProgress(`    ✗ piece ${p.id} ${field}: ${(e as Error).message}`);
        // Leave the URL in place; iPad will show broken-image but the row
        // imports successfully.
      }
    }
  }

  // 3b. Document originals + per-page renders.
  for (const d of tables.documents) {
    const docDir = new Directory(documentsDir, d.id as string);
    if (!docDir.exists) docDir.create({ intermediates: true });

    if (isHttpUrl(d.original_uri)) {
      try {
        const ext = extFromUrl(d.original_uri as string, 'pdf');
        const target = new File(docDir, `original.${ext}`);
        d.original_uri = await downloadToFile(d.original_uri as string, target);
        filesDownloaded++;
        onProgress(`    ↓ doc ${d.id} original`);
      } catch (e) {
        filesFailed++;
        onProgress(`    ✗ doc ${d.id} original: ${(e as Error).message}`);
      }
    }

    // Pages live in pages_json as [{index, image_uri, w, h}, ...]. Rewrite
    // each image_uri to a local path so the iPad viewer can render them.
    try {
      const pages = JSON.parse(d.pages_json as string) as { index: number; image_uri: string; w: number; h: number }[];
      for (const page of pages) {
        if (!isHttpUrl(page.image_uri)) continue;
        try {
          const ext = extFromUrl(page.image_uri, 'jpg');
          const target = new File(docDir, `page-${page.index}.${ext}`);
          page.image_uri = await downloadToFile(page.image_uri, target);
          filesDownloaded++;
        } catch (e) {
          filesFailed++;
          onProgress(`    ✗ doc ${d.id} page ${page.index}: ${(e as Error).message}`);
        }
      }
      d.pages_json = JSON.stringify(pages);
      onProgress(`    ↓ doc ${d.id} ${pages.length} pages`);
    } catch (e) {
      onProgress(`    ✗ doc ${d.id} pages_json malformed: ${(e as Error).message}`);
    }
  }

  // 4. Wipe + insert into SQLite.
  const db = getDb();
  if (wipeFirst) {
    onProgress('Wiping existing data…');
    await db.withTransactionAsync(async () => {
      for (const t of WIPE_ORDER) {
        await db.runAsync(`DELETE FROM ${t};`);
      }
    });
  }

  onProgress('Inserting rows…');
  const counts: Record<string, number> = {};
  await db.withTransactionAsync(async () => {
    for (const t of INSERT_ORDER) {
      const rows = tables[t] ?? [];
      let inserted = 0;
      for (const row of rows) {
        const r = sanitizeRow(t, row);
        const cols = Object.keys(r);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => '?').join(', ');
        const sql = `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders});`;
        const vals = cols.map((c) => r[c] as string | number | null);
        try {
          await db.runAsync(sql, ...vals);
          inserted++;
        } catch (e) {
          onProgress(`    ✗ ${t} row failed: ${(e as Error).message}`);
        }
      }
      counts[t] = inserted;
      onProgress(`  ${t}: inserted ${inserted}/${rows.length}`);
    }
  });

  onProgress('Done.');
  return {
    ok: filesFailed === 0,
    tables: counts,
    filesDownloaded,
    filesFailed,
  };
}
