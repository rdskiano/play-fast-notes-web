// Document upload orchestrator (web).
//
// "User picked a PDF → give me a Document row with every page rendered to
// storage." Pages are rendered ON THE DEVICE with pdf.js (see
// lib/pdf/renderPdfClient.web.ts), not by the pdf-render-page edge function —
// the function's 256 MB ceiling crashed on big scanned PDFs
// (WORKER_RESOURCE_LIMIT). The browser uses the device's RAM, so any size
// works. Output (per-page JPEG + pixel dimensions) is identical in shape to
// what the function produced, so the document viewer / crop / overlay math is
// unchanged.
//
// Flow:
//   1. Upload the original PDF to <userId>/documents/<docId>/original.pdf.
//   2. Render every page on-device to a JPEG blob (sequential, low memory).
//   3. Upload the page JPEGs (bounded concurrency) → pages_json entries.
//   4. Insert the documents row with the populated pages_json.

import {
  insertDocument,
  type DocumentPage,
  type DocumentRow,
} from '@/lib/db/repos/documents';
import { supabase } from '@/lib/supabase/client';
import { uploadDocumentPageImage } from '@/lib/supabase/storage';
import { renderPdfToPages } from '@/lib/pdf/renderPdfClient';

const BUCKET = 'pieces';
// Long-edge pixel cap for rendered pages. ~2000 px is crisp for reading and
// cropping music while keeping each page light to render and store.
const MAX_EDGE = 2000;
const QUALITY = 0.72;
// Page-image uploads to run at once. These are lightweight storage PUTs (the
// heavy rendering already happened on-device), so a small pool is plenty.
const UPLOAD_CONCURRENCY = 5;

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
  const quality = params.quality ?? QUALITY;

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error('Not signed in');
  const userId = session.user.id;

  const docId = newDocId();
  const pdfPath = `${userId}/documents/${docId}/original.pdf`;

  // 1. Upload the original PDF (source of truth; kept for re-cropping).
  onProgress?.({ phase: 'uploading', pages_done: 0, pages_total: 0 });
  const upload = await supabase.storage.from(BUCKET).upload(pdfPath, file, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upload.error) throw upload.error;
  const originalUrl = supabase.storage.from(BUCKET).getPublicUrl(pdfPath).data.publicUrl;

  // 2. Render every page on-device. This is the slow phase; report progress.
  onProgress?.({ phase: 'init', pages_done: 0, pages_total: 0 });
  const bytes = await file.arrayBuffer();
  const rendered = await renderPdfToPages(bytes, {
    maxEdge,
    quality,
    onPage: (done, total) =>
      onProgress?.({ phase: 'rendering', pages_done: done, pages_total: total }),
  });
  const pageTotal = rendered.length;

  // 3. Upload the rendered page JPEGs (bounded concurrency).
  let uploaded = 0;
  onProgress?.({ phase: 'saving', pages_done: 0, pages_total: pageTotal });
  const pages = await runWithConcurrency(rendered, UPLOAD_CONCURRENCY, async (r) => {
    const image_uri = await uploadDocumentPageImage(userId, docId, r.index, r.blob);
    uploaded += 1;
    onProgress?.({ phase: 'saving', pages_done: uploaded, pages_total: pageTotal });
    const page: DocumentPage = { index: r.index, image_uri, w: r.w, h: r.h };
    return page;
  });
  pages.sort((a, b) => a.index - b.index);

  // 4. Insert the document row with the populated pages_json.
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

// Run `worker` over `items` with at most `limit` in flight at once, preserving
// input order in the returned array.
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function runner(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

function newDocId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
