// Native sibling — PDF rasterization is web-only (uses pdf.js + a DOM canvas).
// Metro resolves this on iOS so pdfjs-dist never enters the native bundle.
// The web document-upload flow is the only caller. Signature must match
// renderPdfClient.web.ts (TypeScript reads this .ts version by default).

export type RenderedPage = { index: number; blob: Blob; w: number; h: number };

export async function renderPdfToPages(
  _data: ArrayBuffer,
  _opts?: {
    maxEdge?: number;
    quality?: number;
    onPage?: (done: number, total: number) => void;
  },
): Promise<RenderedPage[]> {
  throw new Error('renderPdfToPages is web-only');
}
