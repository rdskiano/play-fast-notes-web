// Document upload orchestrator (web).
//
// Coordinates the multi-step "user picked a PDF, give me a Document row with all
// pages rendered to storage" flow:
//   1. Upload PDF to <userId>/documents/<docId>/original.pdf (pieces bucket).
//   2. Call pdf-doc-init for page count + per-page sizes.
//   3. Insert the documents row with an empty pages_json placeholder.
//   4. Fan out N parallel pdf-render-page calls; each writes one JPG to storage.
//   5. Collect results, build pages_json, replaceDocumentPages.
//   6. Return the populated DocumentRow.
//
// On render failure, the function attempts a single retry per failing page
// before throwing. The caller can softDeleteDocument to clean up if it gives
// up entirely.

import { supabase } from '@/lib/supabase/client';
import {
  insertDocument,
  replaceDocumentPages,
  type DocumentPage,
  type DocumentRow,
} from '@/lib/db/repos/documents';

const BUCKET = 'pieces';
const SCALE = 2;
const QUALITY = 85;

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
  scale?: number;
  quality?: number;
  onProgress?: (p: UploadProgress) => void;
};

export async function uploadPdfDocument(params: UploadPdfDocumentParams): Promise<DocumentRow> {
  const { file, title, composer, folder_id, onProgress } = params;
  const scale = params.scale ?? SCALE;
  const quality = params.quality ?? QUALITY;

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error('Not signed in');
  const userId = session.user.id;

  const docId = newDocId();
  const pdfPath = `${userId}/documents/${docId}/original.pdf`;

  onProgress?.({ phase: 'uploading', pages_done: 0, pages_total: 0 });
  const upload = await supabase.storage.from(BUCKET).upload(pdfPath, file, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upload.error) throw upload.error;
  const originalUrl = supabase.storage.from(BUCKET).getPublicUrl(pdfPath).data.publicUrl;

  onProgress?.({ phase: 'init', pages_done: 0, pages_total: 0 });
  const init = await callDocInit(docId, session.access_token);

  const pageTotal = init.page_count;
  onProgress?.({ phase: 'rendering', pages_done: 0, pages_total: pageTotal });

  const document = await insertDocument({
    id: docId,
    title,
    composer: composer ?? null,
    source_kind: 'pdf',
    original_uri: originalUrl,
    page_count: pageTotal,
    pages: [],
    folder_id: folder_id ?? null,
  });

  let pagesDone = 0;
  const renderTasks = Array.from({ length: pageTotal }, (_, i) => {
    const page = i + 1;
    return renderPageWithRetry(docId, page, scale, quality, session.access_token).then((result) => {
      pagesDone += 1;
      onProgress?.({ phase: 'rendering', pages_done: pagesDone, pages_total: pageTotal });
      return result;
    });
  });

  const renderResults = await Promise.all(renderTasks);
  const pages: DocumentPage[] = renderResults
    .map((r) => ({ index: r.page, image_uri: r.image_uri, w: r.width, h: r.height }))
    .sort((a, b) => a.index - b.index);

  onProgress?.({ phase: 'saving', pages_done: pageTotal, pages_total: pageTotal });
  await replaceDocumentPages(docId, pages);

  onProgress?.({ phase: 'done', pages_done: pageTotal, pages_total: pageTotal });
  return { ...document, pages_json: JSON.stringify(pages) };
}

async function callDocInit(docId: string, accessToken: string): Promise<{ page_count: number; page_sizes: { width: number; height: number }[] }> {
  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/pdf-doc-init`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ docId }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`pdf-doc-init ${res.status}: ${body}`);
  }
  return res.json();
}

async function renderPage(docId: string, page: number, scale: number, quality: number, accessToken: string): Promise<{ image_uri: string; width: number; height: number; page: number }> {
  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/pdf-render-page`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ docId, page, scale, quality }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`pdf-render-page page=${page} ${res.status}: ${body}`);
  }
  return res.json();
}

async function renderPageWithRetry(
  docId: string,
  page: number,
  scale: number,
  quality: number,
  accessToken: string,
): Promise<{ image_uri: string; width: number; height: number; page: number }> {
  try {
    return await renderPage(docId, page, scale, quality, accessToken);
  } catch (err) {
    return await renderPage(docId, page, scale, quality, accessToken);
  }
}

function newDocId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
