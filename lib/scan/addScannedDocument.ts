// Add a scanned document on-device (native), local-first.
//
// The camera scan itself (auto edge-detect + crop) happens in the UI via
// react-native-document-scanner-plugin, which hands back cropped page images.
// Here we enhance each page to a clean B&W document look (pdf-render.enhanceScan
// = grayscale + contrast), save them as an IMAGE-based document, and — when
// signed in — upload the pages + insert the row in Supabase so it appears on the
// web too. Signed-out (or sync failure) still yields a working local document.
//
// Counterpart to addPdfDocument.ts (PDF path). Image-based docs carry a per-page
// image_uri and no original PDF; resolvePageImageUri + the import gate already
// handle that shape.

import { Directory, File, Paths } from 'expo-file-system';

import { insertDocument } from '@/lib/db/repos/documents';
import { supabase } from '@/lib/supabase/client';
import { enhanceScan } from '@/modules/pdf-render';

const BUCKET = 'pieces';

function newDocId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export type ScanProgress = (line: string) => void;

export type AddScanResult = { docId: string; synced: boolean; pageCount: number };

export async function addScannedDocument(opts: {
  /** Cropped page image URIs from the document scanner. */
  imageUris: string[];
  title: string;
  composer?: string | null;
  folderId?: string | null;
  onProgress?: ScanProgress;
}): Promise<AddScanResult> {
  const { imageUris, title, composer = null, folderId = null, onProgress } = opts;
  if (imageUris.length === 0) throw new Error('No scanned pages.');
  const cleanTitle = title.trim() || 'Scanned music';
  const cleanComposer = composer && composer.trim() ? composer.trim() : null;
  const docId = newDocId();

  const docDir = new Directory(Paths.document, 'documents', docId);
  if (!docDir.exists) docDir.create({ intermediates: true });

  // 1. Enhance each scanned page to B&W and save it into the sandbox.
  const pages: { index: number; image_uri: string; w: number; h: number }[] = [];
  for (let i = 0; i < imageUris.length; i++) {
    onProgress?.(`Cleaning up page ${i + 1}/${imageUris.length}…`);
    const out = new File(docDir, `page-${i + 1}.jpg`);
    if (out.exists) out.delete();
    const dims = await enhanceScan(imageUris[i], out.uri);
    if (!dims) throw new Error('On-device image processing is unavailable in this build.');
    pages.push({ index: i + 1, image_uri: out.uri, w: dims.width, h: dims.height });
  }

  // 2. Local SQLite — the device's source of truth (image-based doc, no PDF).
  onProgress?.('Adding to your library…');
  await insertDocument({
    id: docId,
    title: cleanTitle,
    composer: cleanComposer,
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
      composer: cleanComposer,
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
