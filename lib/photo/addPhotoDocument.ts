// Add a photo-based DOCUMENT on-device (native), local-first.
//
// This is the native sibling of web's upload.web.tsx `saveDocument`: photos
// become a page-and-boxes image-document (source_kind 'images') that the user
// marks multiple passage boxes on in the document viewer — the post-Izumi
// model that replaced one-passage-per-photo (2026-06-16 on web; ported to
// native 2026-07-04). Plumbing mirrors lib/scan/addScannedDocument.ts, minus
// the B&W enhanceScan step: a photo of a score should stay a photo.
//
// Each page is re-encoded to JPEG at the document reference scale (maxEdge
// 2000 — same as web's MAX_PAGE_EDGE and the PDF render scale) so
// regions_json boxes live in the same pixel space as every other document.

import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

import { insertDocument } from '@/lib/db/repos/documents';
import { supabase } from '@/lib/supabase/client';

const BUCKET = 'pieces';
const MAX_PAGE_EDGE = 2000;

function newDocId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (e) => reject(e instanceof Error ? e : new Error('Could not read that photo.')),
    );
  });
}

/** Re-encode a picked photo to a JPEG page at the reference scale, saved into
 *  the document's sandbox dir. Returns the stored page descriptor. */
async function persistPageImage(
  docDir: Directory,
  pageIndex: number,
  sourceUri: string,
): Promise<{ index: number; image_uri: string; w: number; h: number }> {
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

export type AddPhotoDocResult = { docId: string; synced: boolean; pageCount: number };

export async function addPhotoDocument(opts: {
  /** Local file:// URIs of the chosen / captured photos, in page order. */
  imageUris: string[];
  title: string;
  folderId?: string | null;
  onProgress?: (line: string) => void;
}): Promise<AddPhotoDocResult> {
  const { imageUris, title, folderId = null, onProgress } = opts;
  if (imageUris.length === 0) throw new Error('No photos to save.');
  const cleanTitle = title.trim() || 'Untitled photo';
  const docId = newDocId();

  const docDir = new Directory(Paths.document, 'documents', docId);
  if (!docDir.exists) docDir.create({ intermediates: true });

  // 1. Re-encode each photo to a reference-scale page in the sandbox.
  const pages: { index: number; image_uri: string; w: number; h: number }[] = [];
  for (let i = 0; i < imageUris.length; i++) {
    onProgress?.(`Preparing page ${i + 1}/${imageUris.length}…`);
    pages.push(await persistPageImage(docDir, i + 1, imageUris[i]));
  }

  // 2. Local SQLite — the device's source of truth (image-based doc, no PDF).
  onProgress?.('Adding to your library…');
  await insertDocument({
    id: docId,
    title: cleanTitle,
    composer: null,
    source_kind: 'images',
    original_uri: null,
    page_count: pages.length,
    pages,
    folder_id: folderId,
  });

  // 3. Best-effort cloud sync — upload each page image + the doc row.
  let synced = false;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      onProgress?.('Saved on this device. (Sign in to sync to the web.)');
      return { docId, synced: false, pageCount: pages.length };
    }

    onProgress?.('Syncing to your account…');
    const userId = session.user.id;
    const remotePages: { index: number; image_uri: string; w: number; h: number }[] = [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const path = `${userId}/documents/${docId}/p${p.index}.jpg`;
      const bytes = await new File(p.image_uri).bytes();
      const up = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (up.error) throw up.error;
      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      remotePages.push({ index: p.index, image_uri: publicUrl, w: p.w, h: p.h });
      onProgress?.(`Uploaded page ${i + 1}/${pages.length}`);
    }

    const now = Date.now();
    // Same docId on both sides so a later wipe-reimport won't duplicate it.
    // user_id omitted — defaults to auth.uid() under RLS.
    const { error } = await supabase.from('documents').insert({
      id: docId,
      title: cleanTitle,
      composer: null,
      source_kind: 'images',
      original_uri: null,
      page_count: pages.length,
      pages_json: JSON.stringify(remotePages),
      folder_id: folderId,
      created_at: now,
      updated_at: now,
    });
    if (error) throw error;

    synced = true;
    onProgress?.('Synced to the web ✓');
  } catch (e) {
    onProgress?.(`Saved on this device; cloud sync failed: ${(e as Error).message}`);
  }

  return { docId, synced, pageCount: pages.length };
}
