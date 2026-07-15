// Append pages to an EXISTING document on-device (native), local-first.
//
// The missing half of B-009: once a scan (or any document) was saved, the iPad
// had no way to add pages — "+ Add page" was web-only. This mirrors the create
// paths: scans are cleaned to B&W like lib/scan/addScannedDocument.ts, photos
// are re-encoded at the reference scale like lib/photo/addPhotoDocument.ts
// (a photo of a score should stay a photo). New pages always carry their own
// image_uri, so this works whether the document started as a scan, photos, or
// a PDF (resolvePageImageUri prefers a stored image over rendering the PDF).
//
// Local SQLite is written first and is the source of truth; the cloud copy is
// updated in the background, best-effort, exactly like the create paths.

import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

import type { DocumentPage } from '@/lib/db/repos/documents';
import { getDocument, parsePages, replaceDocumentPages } from '@/lib/db/repos/documents';
import { supabase } from '@/lib/supabase/client';
import { enhanceScan } from '@/modules/pdf-render';

const BUCKET = 'pieces';
const MAX_PAGE_EDGE = 2000;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (e) => reject(e instanceof Error ? e : new Error('Could not read that photo.')),
    );
  });
}

/** Re-encode a picked photo to a JPEG page at the reference scale (same as
 *  addPhotoDocument's persistPageImage). */
async function persistPhotoPage(
  docDir: Directory,
  pageIndex: number,
  sourceUri: string,
): Promise<DocumentPage> {
  const { width, height } = await getImageSize(sourceUri);
  const scale = Math.min(1, MAX_PAGE_EDGE / Math.max(width, height));
  const actions: ImageManipulator.Action[] =
    scale < 1 ? [{ resize: { width: Math.round(width * scale) } }] : [];
  const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const out = new File(docDir, `page-${pageIndex}.jpg`);
  if (out.exists) out.delete();
  new File(result.uri).copy(out);
  return { index: pageIndex, image_uri: out.uri, w: result.width, h: result.height };
}

/** Clean a scanned page to B&W and save it (same as addScannedDocument). */
async function persistScanPage(
  docDir: Directory,
  pageIndex: number,
  sourceUri: string,
): Promise<DocumentPage> {
  const out = new File(docDir, `page-${pageIndex}.jpg`);
  if (out.exists) out.delete();
  const dims = await enhanceScan(sourceUri, out.uri);
  if (!dims) throw new Error('On-device image processing is unavailable in this build.');
  return { index: pageIndex, image_uri: out.uri, w: dims.width, h: dims.height };
}

/**
 * Append pages to a document. Reads the current page list from SQLite (the
 * device's source of truth), persists each new image into the document's
 * sandbox dir, writes the new page list, kicks off background cloud sync, and
 * returns the full new page list for the viewer.
 */
export async function appendDocumentPages(opts: {
  documentId: string;
  /** Local URIs, in the order they should be appended. */
  imageUris: string[];
  /** 'scan' gets the B&W document cleanup; 'photo' stays a photo. */
  kind: 'scan' | 'photo';
}): Promise<DocumentPage[]> {
  const { documentId, imageUris, kind } = opts;
  if (imageUris.length === 0) throw new Error('No pages to add.');

  const doc = await getDocument(documentId);
  if (!doc) throw new Error('Document not found.');
  const current = parsePages(doc.pages_json);

  const docDir = new Directory(Paths.document, 'documents', documentId);
  if (!docDir.exists) docDir.create({ intermediates: true });

  // Existing indices never change (regions_json / sections point at them), so
  // new pages continue from the highest index.
  let nextIndex = current.reduce((max, p) => Math.max(max, p.index), 0);
  const added: DocumentPage[] = [];
  for (const uri of imageUris) {
    nextIndex += 1;
    added.push(
      kind === 'scan'
        ? await persistScanPage(docDir, nextIndex, uri)
        : await persistPhotoPage(docDir, nextIndex, uri),
    );
  }

  const next = [...current, ...added];
  await replaceDocumentPages(documentId, next);

  // Fire-and-forget — the local document is already usable.
  void syncAppendedPagesToCloud(documentId, added);

  return next;
}

// Upload each new page image and append it to the CLOUD row's pages_json (the
// remote list carries remote URLs, so it's read-modify-written here rather than
// copied from the local list). Never throws to its caller — a failure leaves
// the new pages local-only, same best-effort contract as the create paths.
async function syncAppendedPagesToCloud(
  documentId: string,
  added: DocumentPage[],
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return; // signed out — local-only, nothing to sync

    const userId = session.user.id;
    const { data: row, error: readErr } = await supabase
      .from('documents')
      .select('pages_json')
      .eq('id', documentId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!row) return; // doc never made it to the cloud — stay local-only

    const remotePages: DocumentPage[] = JSON.parse(row.pages_json ?? '[]');
    for (const p of added) {
      const path = `${userId}/documents/${documentId}/p${p.index}.jpg`;
      const bytes = await new File(p.image_uri!).bytes();
      const up = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (up.error) throw up.error;
      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      remotePages.push({ index: p.index, image_uri: publicUrl, w: p.w, h: p.h });
    }

    const { error } = await supabase
      .from('documents')
      .update({
        pages_json: JSON.stringify(remotePages),
        page_count: remotePages.length,
        updated_at: Date.now(),
      })
      .eq('id', documentId);
    if (error) throw error;
  } catch (e) {
    console.warn('[add-page] background cloud sync failed', e);
  }
}
