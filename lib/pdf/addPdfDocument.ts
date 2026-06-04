// Add a PDF document on-device (native), local-first.
//
// 1. Copy the picked PDF into the app sandbox.
// 2. Read its page sizes with PDFKit (the pdf-render module).
// 3. Insert the document into local SQLite — the device's source of truth. The
//    viewer renders pages on demand from the sandbox PDF (lib/pdf/pageImage.ts).
// 4. If (and only if) the user is signed in, also upload the original PDF to
//    their Supabase account + insert the row there, so it appears on the web and
//    survives a wipe-and-reimport. Cloud sync is best-effort: a signed-out user
//    (or a sync failure) still gets a fully working local document.
//
// This is the iPad/iPhone counterpart to the web's lib/pdf/upload.ts. It is only
// imported by the native add screen (app/document-upload.tsx).

import { Directory, File, Paths } from 'expo-file-system';

import { insertDocument } from '@/lib/db/repos/documents';
import { supabase } from '@/lib/supabase/client';
import { getPdfPageSizes } from '@/modules/pdf-render';

const BUCKET = 'pieces';

function newDocId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export type AddPdfProgress = (line: string) => void;

export type AddPdfResult = { docId: string; synced: boolean };

export async function addPdfDocument(opts: {
  /** Local file:// URI from the document picker. */
  fileUri: string;
  title: string;
  composer?: string | null;
  folderId?: string | null;
  onProgress?: AddPdfProgress;
}): Promise<AddPdfResult> {
  const { fileUri, title, composer = null, folderId = null, onProgress } = opts;
  const cleanTitle = title.trim() || 'Untitled';
  const cleanComposer = composer && composer.trim() ? composer.trim() : null;
  const docId = newDocId();

  // 1. Copy the PDF into the sandbox: documents/<docId>/original.pdf
  onProgress?.('Saving PDF…');
  const docDir = new Directory(Paths.document, 'documents', docId);
  if (!docDir.exists) docDir.create({ intermediates: true });
  const localPdf = new File(docDir, 'original.pdf');
  if (localPdf.exists) localPdf.delete();
  new File(fileUri).copy(localPdf);

  // 2. Page sizes (PDFKit, no rasterize).
  onProgress?.('Reading pages…');
  const sizes = await getPdfPageSizes(localPdf.uri);
  if (!sizes || sizes.length === 0) {
    throw new Error('Could not read the PDF — it may be empty or corrupt.');
  }
  const pages = sizes.map((s) => ({ index: s.index, w: s.w, h: s.h }));

  // 3. Local SQLite — the device's source of truth. original_uri is the local
  //    file so the on-device renderer can rasterize pages.
  onProgress?.('Adding to your library…');
  await insertDocument({
    id: docId,
    title: cleanTitle,
    composer: cleanComposer,
    source_kind: 'pdf',
    original_uri: localPdf.uri,
    page_count: pages.length,
    pages,
    folder_id: folderId,
  });

  // 4. Best-effort cloud sync — only when signed in.
  let synced = false;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      onProgress?.('Saved on this device. (Sign in to sync to the web.)');
      return { docId, synced: false };
    }

    onProgress?.('Syncing to your account…');
    const userId = session.user.id;
    const pdfPath = `${userId}/documents/${docId}/original.pdf`;
    const bytes = await localPdf.bytes();
    const up = await supabase.storage.from(BUCKET).upload(pdfPath, bytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (up.error) throw up.error;

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(pdfPath).data.publicUrl;
    const now = Date.now();
    // Same docId on both sides, so a later wipe-and-reimport won't duplicate it.
    // user_id is omitted — the column defaults to auth.uid() under RLS.
    const { error } = await supabase.from('documents').insert({
      id: docId,
      title: cleanTitle,
      composer: cleanComposer,
      source_kind: 'pdf',
      original_uri: publicUrl,
      page_count: pages.length,
      pages_json: JSON.stringify(pages),
      folder_id: folderId,
      created_at: now,
      updated_at: now,
    });
    if (error) throw error;

    synced = true;
    onProgress?.('Synced to the web ✓');
  } catch (e) {
    // The local document already exists and works — don't fail the whole add.
    onProgress?.(`Saved on this device; cloud sync failed: ${(e as Error).message}`);
  }

  return { docId, synced };
}
