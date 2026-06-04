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
  // Titles of documents skipped because they have no original PDF the device can
  // render (older/incompatible uploads). Surfaced so the user can re-upload them.
  incompatible: string[];
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

// A single file download that stalls would otherwise hang the whole import
// forever (no native cancel), so we race it against a timeout. On timeout the
// caller marks the file failed and moves on; an orphaned native download
// finishing late is harmless.
const DOWNLOAD_TIMEOUT_MS = 30000;

// Download a URL straight to `target` on disk. Uses the native streaming
// downloader (File.downloadFileAsync) rather than fetch → arrayBuffer →
// base64 → write: the old path pulled the whole file into JS memory and
// base64-encoded it on the main thread, which froze the UI for seconds per
// large PDF and looked like a hang. Native streaming writes off-thread.
async function downloadToFile(url: string, target: File): Promise<string> {
  if (target.exists) target.delete();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`)),
      DOWNLOAD_TIMEOUT_MS,
    ),
  );
  await Promise.race([File.downloadFileAsync(url, target), timeout]);
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
      // Print progress per page — multi-page PDFs are the slow part, and
      // without per-page lines the screen looks frozen while they download.
      let pageNum = 0;
      for (const page of pages) {
        pageNum++;
        if (!isHttpUrl(page.image_uri)) continue;
        try {
          const ext = extFromUrl(page.image_uri, 'jpg');
          const target = new File(docDir, `page-${page.index}.${ext}`);
          page.image_uri = await downloadToFile(page.image_uri, target);
          filesDownloaded++;
          onProgress(`    ↓ doc ${d.id} page ${pageNum}/${pages.length}`);
        } catch (e) {
          filesFailed++;
          onProgress(`    ✗ doc ${d.id} page ${pageNum}/${pages.length}: ${(e as Error).message}`);
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

  // Native renders pages from the original PDF, so a document with no original
  // PDF can't be shown on-device. Skip those (and the passages/log rows that
  // belong to them) and report their titles so the user can re-upload them.
  const incompatibleDocIds = new Set<string>();
  const incompatible: string[] = [];
  for (const d of tables.documents ?? []) {
    const orig = d.original_uri;
    if (!(typeof orig === 'string' && orig.trim() !== '')) {
      incompatibleDocIds.add(d.id as string);
      incompatible.push((d.title as string) || '(untitled)');
    }
  }
  if (incompatible.length > 0) {
    onProgress(`⚠ ${incompatible.length} document(s) have no PDF and were skipped — re-upload them.`);
  }

  onProgress('Inserting rows…');
  const counts: Record<string, number> = {};
  await db.withTransactionAsync(async () => {
    for (const t of INSERT_ORDER) {
      const rows = tables[t] ?? [];
      // The on-device table can have fewer columns than Supabase (the web
      // schema drifts ahead). Insert only columns that exist locally; dropping
      // the rest keeps one unknown column from failing the WHOLE table (which
      // is how passages + practice history silently vanished before). Lost
      // columns are reported so drift stays visible, not silent.
      const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t});`);
      const validCols = new Set(info.map((c) => c.name));
      const dropped = new Set<string>();
      let inserted = 0;
      for (const row of rows) {
        const r = sanitizeRow(t, row);
        // Drop incompatible documents and anything that belongs to them.
        if (t === 'documents' && incompatibleDocIds.has(r.id as string)) continue;
        if (
          (t === 'pieces' || t === 'practice_log') &&
          typeof r.document_id === 'string' &&
          incompatibleDocIds.has(r.document_id)
        ) {
          continue;
        }
        const cols = Object.keys(r).filter((c) => {
          if (validCols.has(c)) return true;
          dropped.add(c);
          return false;
        });
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
      if (dropped.size > 0) {
        onProgress(`    ⚠ ${t}: skipped unknown column(s): ${[...dropped].join(', ')}`);
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
    incompatible,
  };
}
