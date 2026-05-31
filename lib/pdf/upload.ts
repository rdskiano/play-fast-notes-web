// Document upload orchestrator (web).
//
// "User picked a PDF → give me a Document row." As of "Stage 2" we store ONLY
// the original PDF, not a rendered JPEG per page. The viewer / picker / crop
// flow render each page from the PDF on demand in the browser (see
// lib/pdf/pageImage.web.ts). This drops the bulk of per-document storage: a
// 52-page scan used to also store 52 large page JPEGs.
//
// At upload time we still need each page's pixel dimensions — that's the
// coordinate space passage boxes (regions_json) live in — but we read them
// from the PDF WITHOUT rasterizing (getPdfPageSizes), which is cheap.
//
// Flow:
//   1. Upload the original PDF to <userId>/documents/<docId>/original.pdf.
//   2. Read each page's reference-scale dimensions on-device (no rasterize).
//   3. Insert the documents row with pages_json = [{ index, w, h }] (no image_uri).

import {
  insertDocument,
  type DocumentPage,
  type DocumentRow,
} from '@/lib/db/repos/documents';
import { supabase } from '@/lib/supabase/client';
import { getPdfPageSizes } from '@/lib/pdf/renderPdfClient';

const BUCKET = 'pieces';
// Long-edge pixel cap for the reference dimensions / on-demand renders. ~2000
// px is crisp for reading and cropping music. Must match the maxEdge the
// on-demand renderer uses so crop rects stored against these dimensions line up.
const MAX_EDGE = 2000;

export type UploadProgress = {
  phase: 'uploading' | 'init' | 'rendering' | 'saving' | 'done';
  pages_done: number;
  pages_total: number;
};

export type UploadPdfDocumentParams = {
  file: File;
  title: string;
  composer?: string | null;
  folder_id?: string | null;
  maxEdge?: number;
  quality?: number;
  onProgress?: (p: UploadProgress) => void;
};

export async function uploadPdfDocument(params: UploadPdfDocumentParams): Promise<DocumentRow> {
  const { file, title, composer, folder_id, onProgress } = params;
  const maxEdge = params.maxEdge ?? MAX_EDGE;

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error('Not signed in');
  const userId = session.user.id;

  const docId = newDocId();
  const pdfPath = `${userId}/documents/${docId}/original.pdf`;

  // 1. Upload the original PDF (the only thing we store; pages render from it).
  onProgress?.({ phase: 'uploading', pages_done: 0, pages_total: 0 });
  const upload = await supabase.storage.from(BUCKET).upload(pdfPath, file, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upload.error) throw upload.error;
  const originalUrl = supabase.storage.from(BUCKET).getPublicUrl(pdfPath).data.publicUrl;

  // 2. Read each page's reference-scale dimensions on-device (no rasterize).
  onProgress?.({ phase: 'init', pages_done: 0, pages_total: 0 });
  const bytes = await file.arrayBuffer();
  const sizes = await getPdfPageSizes(bytes, { maxEdge });
  const pages: DocumentPage[] = sizes.map((s) => ({ index: s.index, w: s.w, h: s.h }));
  const pageTotal = pages.length;

  // 3. Insert the document row. No per-page image_uri — resolved on demand.
  const document = await insertDocument({
    id: docId,
    title,
    composer: composer ?? null,
    source_kind: 'pdf',
    original_uri: originalUrl,
    page_count: pageTotal,
    pages,
    folder_id: folder_id ?? null,
  });

  onProgress?.({ phase: 'done', pages_done: pageTotal, pages_total: pageTotal });
  return { ...document, pages_json: JSON.stringify(pages) };
}

function newDocId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
