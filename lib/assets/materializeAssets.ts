// Lazy asset download (SYNC_PLAN Phase 3) — NATIVE side.
//
// The sync engine inserts brand-new cloud pieces/documents with their cloud
// https URLs so they appear in the library immediately (screens render remote
// URLs fine while online). The first time such an item is OPENED, this module
// downloads its files into the app sandbox and rewrites the row to the local
// paths — after that the music works in a dead-wifi practice room, same as
// anything created on the device.
//
// File layout matches /import-supabase so the two paths share a cache:
//   Documents/pieces/<id>-src.<ext>  /  <id>-thumb.<ext>  /  <id>-orig.<ext>
//   Documents/documents/<docId>/original.<ext>  /  page-<N>.<ext>
//
// Row rewrites go through withSyncApplying and do NOT bump updated_at: the
// swap from a cloud URL to a local copy of the same bytes is not an edit, and
// it must neither echo into the outbox nor beat a real edit at newest-wins.
// (The engine never pushes file:// paths to the cloud anyway.)
//
// Web sibling (materializeAssets.web.ts) is a no-op — web is cloud-native.

import { Directory, File, Paths } from 'expo-file-system';

import { getDb } from '@/lib/db/client';
import { withSyncApplying } from '@/lib/sync/engine';

function isHttpUrl(s: unknown): s is string {
  return typeof s === 'string' && /^https?:\/\//.test(s);
}

function extFromUrl(url: string, defaultExt: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').filter(Boolean).pop() ?? '';
    const dot = last.lastIndexOf('.');
    return dot < 0 ? defaultExt : last.slice(dot + 1).toLowerCase();
  } catch {
    return defaultExt;
  }
}

// A stalled download must not wedge the screen's fire-and-forget effect
// forever (no native cancel) — race a timeout; a late finish is harmless.
const DOWNLOAD_TIMEOUT_MS = 30000;

async function downloadToFile(url: string, target: File): Promise<string> {
  if (target.exists) target.delete();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`)),
      DOWNLOAD_TIMEOUT_MS,
    ),
  );
  await Promise.race([File.downloadFileAsync(url, target), timeout]);
  if (target.size <= 0) throw new Error('downloaded file is empty');
  return target.uri;
}

// One materialization per item at a time — screens fire these on focus, and a
// re-focus mid-download must not start a second copy of the same files.
const inFlight = new Set<string>();

/**
 * Download a passage's remote images into the sandbox and point its row at
 * them. Resolves true when the row changed (caller should re-read it),
 * false when there was nothing remote, it's already being fetched, or the
 * network said no (screens keep rendering the https URLs; retried next open).
 */
export async function materializePassageAssets(
  passageId: string,
): Promise<boolean> {
  const key = `piece:${passageId}`;
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  try {
    const db = getDb();
    const row = await db.getFirstAsync<{
      source_uri: string;
      thumbnail_uri: string | null;
      original_uri: string | null;
    }>(
      'SELECT source_uri, thumbnail_uri, original_uri FROM pieces WHERE id = ? AND deleted_at IS NULL;',
      passageId,
    );
    if (!row) return false;
    if (
      !isHttpUrl(row.source_uri) &&
      !isHttpUrl(row.thumbnail_uri) &&
      !isHttpUrl(row.original_uri)
    ) {
      return false;
    }

    const dir = new Directory(Paths.document, 'pieces');
    if (!dir.exists) dir.create({ intermediates: true });

    let { source_uri, thumbnail_uri, original_uri } = row;
    if (isHttpUrl(source_uri)) {
      const ext = extFromUrl(source_uri, 'jpg');
      source_uri = await downloadToFile(
        source_uri,
        new File(dir, `${passageId}-src.${ext}`),
      );
    }
    if (isHttpUrl(thumbnail_uri)) {
      const ext = extFromUrl(thumbnail_uri, 'jpg');
      thumbnail_uri = await downloadToFile(
        thumbnail_uri,
        new File(dir, `${passageId}-thumb.${ext}`),
      );
    }
    if (isHttpUrl(original_uri)) {
      const ext = extFromUrl(original_uri, 'jpg');
      original_uri = await downloadToFile(
        original_uri,
        new File(dir, `${passageId}-orig.${ext}`),
      );
    }

    await withSyncApplying(() =>
      getDb().runAsync(
        'UPDATE pieces SET source_uri = ?, thumbnail_uri = ?, original_uri = ? WHERE id = ?;',
        source_uri,
        thumbnail_uri,
        original_uri,
        passageId,
      ),
    );
    return true;
  } catch (e) {
    console.warn('[assets] passage materialize deferred', passageId, e);
    return false;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Download a document's remote files into the sandbox: the original PDF for
 * pdf docs (pages render on-device from it), every page image for image docs.
 * Resolves true when the row changed.
 */
export async function materializeDocumentAssets(
  documentId: string,
): Promise<boolean> {
  const key = `doc:${documentId}`;
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  try {
    const db = getDb();
    const row = await db.getFirstAsync<{
      source_kind: string;
      original_uri: string | null;
      pages_json: string;
    }>(
      'SELECT source_kind, original_uri, pages_json FROM documents WHERE id = ? AND deleted_at IS NULL;',
      documentId,
    );
    if (!row) return false;

    const pages = JSON.parse(row.pages_json || '[]') as {
      index: number;
      image_uri?: string;
      w: number;
      h: number;
    }[];
    const needsOriginal = isHttpUrl(row.original_uri);
    const needsPages =
      row.source_kind === 'images' && pages.some((p) => isHttpUrl(p.image_uri));
    if (!needsOriginal && !needsPages) return false;

    const dir = new Directory(Paths.document, 'documents', documentId);
    if (!dir.exists) dir.create({ intermediates: true });

    let originalUri = row.original_uri;
    if (isHttpUrl(originalUri)) {
      const ext = extFromUrl(originalUri, row.source_kind === 'pdf' ? 'pdf' : 'jpg');
      originalUri = await downloadToFile(
        originalUri,
        new File(dir, `original.${ext}`),
      );
    }

    let pagesJson = row.pages_json;
    if (needsPages) {
      for (const page of pages) {
        if (!isHttpUrl(page.image_uri)) continue;
        const ext = extFromUrl(page.image_uri, 'jpg');
        page.image_uri = await downloadToFile(
          page.image_uri,
          new File(dir, `page-${page.index}.${ext}`),
        );
      }
      pagesJson = JSON.stringify(pages);
    }

    await withSyncApplying(() =>
      getDb().runAsync(
        'UPDATE documents SET original_uri = ?, pages_json = ? WHERE id = ?;',
        originalUri,
        pagesJson,
        documentId,
      ),
    );
    return true;
  } catch (e) {
    console.warn('[assets] document materialize deferred', documentId, e);
    return false;
  } finally {
    inFlight.delete(key);
  }
}
