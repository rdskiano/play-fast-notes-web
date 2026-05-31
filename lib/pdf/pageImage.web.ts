// On-demand document-page image resolver (web).
//
// "Stage 2": new PDF uploads store only the original PDF, not a rendered JPEG
// per page. This module turns a document page into a displayable / croppable
// image URI on demand:
//   - If the page already has image_uri (older docs, or source_kind='images'
//     multi-image sets), return it directly — no work, no PDF fetch.
//   - Otherwise fetch the document's original PDF once, render the requested
//     page in the browser, and return a blob: object URL.
//
// Both the parsed PDF handle and each rendered page URL are cached per document
// for the session, keyed by docId, so flipping back and forth between pages
// (or re-opening the same doc) doesn't re-fetch or re-render. Pages render
// lazily — only the ones actually viewed occupy memory. (No eviction yet; a
// session views one document at a time and the JPEGs are small. If memory ever
// bites, add an LRU here.)

import { openPdf, renderPdfPageToBlob } from '@/lib/pdf/renderPdfClient';

type PdfDocument = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ResolvableDoc = { id: string; original_uri: string | null };
export type ResolvablePage = { index: number; image_uri?: string; w: number; h: number };

// docId → parsed PDF handle (kept alive for the session so all its pages share
// one decode). The promise is cached so concurrent page requests share a fetch.
const pdfByDoc = new Map<string, Promise<PdfDocument>>();
// `${docId}:${pageIndex}` → rendered blob object URL.
const urlByPage = new Map<string, Promise<string>>();

function loadPdfForDoc(doc: ResolvableDoc): Promise<PdfDocument> {
  const existing = pdfByDoc.get(doc.id);
  if (existing) return existing;
  if (!doc.original_uri) {
    return Promise.reject(new Error(`document ${doc.id} has no original PDF to render`));
  }
  const url = doc.original_uri;
  const p = (async () => {
    // Supabase public objects send ACAO:* — an explicit cors fetch returns a
    // readable body we can hand to pdf.js. (The PWA service worker cache-firsts
    // this path, so it's fetched at most once across the session.)
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`failed to fetch PDF (${res.status})`);
    const bytes = await res.arrayBuffer();
    return openPdf(bytes);
  })().catch((err) => {
    // Don't poison the cache on a transient failure — allow a later retry.
    pdfByDoc.delete(doc.id);
    throw err;
  });
  pdfByDoc.set(doc.id, p);
  return p;
}

/**
 * Resolve a document page to a displayable / croppable image URI.
 * Returns the stored image_uri when present, otherwise renders the page from
 * the document's original PDF on demand (cached).
 */
export async function resolvePageImageUri(
  doc: ResolvableDoc,
  page: ResolvablePage,
): Promise<string> {
  if (page.image_uri) return page.image_uri;

  const key = `${doc.id}:${page.index}`;
  const existing = urlByPage.get(key);
  if (existing) return existing;

  const p = (async () => {
    const pdf = await loadPdfForDoc(doc);
    const { blob } = await renderPdfPageToBlob(pdf, page.index);
    return URL.createObjectURL(blob);
  })().catch((err) => {
    urlByPage.delete(key);
    throw err;
  });
  urlByPage.set(key, p);
  return p;
}
