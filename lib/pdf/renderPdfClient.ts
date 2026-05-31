// Native sibling — PDF rasterization is web-only (uses pdf.js + a DOM canvas).
// Metro resolves this on iOS so pdfjs-dist never enters the native bundle.
// The web document-upload + on-demand page-render flow are the only callers.
// Signatures must match renderPdfClient.web.ts (TypeScript reads this .ts
// version by default).

export type PageSize = { index: number; w: number; h: number };
export type RenderedPage = { blob: Blob; w: number; h: number };

export function loadPdfjs(): Promise<unknown> {
  throw new Error('loadPdfjs is web-only');
}

export async function openPdf(_data: ArrayBuffer): Promise<unknown> {
  throw new Error('openPdf is web-only');
}

export async function getPdfPageSizes(
  _data: ArrayBuffer,
  _opts?: { maxEdge?: number },
): Promise<PageSize[]> {
  throw new Error('getPdfPageSizes is web-only');
}

export async function renderPdfPageToBlob(
  _pdf: unknown,
  _index: number,
  _opts?: { maxEdge?: number; quality?: number },
): Promise<RenderedPage> {
  throw new Error('renderPdfPageToBlob is web-only');
}
