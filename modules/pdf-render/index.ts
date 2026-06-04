// Local Expo module — renders a page of a PDF to a JPEG file on-device, using
// Apple's PDFKit. Built on the Expo Modules API, so it works under the New
// Architecture. iOS-only; on web/Android the native module is absent and the
// helpers degrade (renderPdfPage returns null).
//
// Why this exists: new PDF uploads store only the original PDF, not a rendered
// image per page (the web viewer rasterizes pages in-browser with pdf.js).
// Native can't run pdf.js, so the document viewer renders pages here instead.
// See lib/pdf/pageImage.ts.

import { requireNativeModule } from 'expo';

export type PdfPageSize = { index: number; w: number; h: number };

type PdfRenderNative = {
  // pageNumber is 1-based (matches pdf.js / pages_json index). maxEdge caps the
  // long side in px. Writes a JPEG to outputUri and returns its file:// URI.
  renderPage(
    pdfUri: string,
    pageNumber: number,
    maxEdge: number,
    outputUri: string,
  ): Promise<string>;
  // Per-page dimensions (1-based index) without rasterizing — for building
  // pages_json when adding a PDF on-device.
  getPageSizes(pdfUri: string): Promise<PdfPageSize[]>;
};

let native: PdfRenderNative | null = null;
try {
  native = requireNativeModule<PdfRenderNative>('PdfRender');
} catch {
  // Running a build that predates the module (or web/Android) — callers degrade.
  native = null;
}

export const isPdfRenderAvailable = (): boolean => native !== null;

/**
 * Render a 1-based PDF page to a JPEG at `outputUri`. Returns the written
 * file URI, or `null` when the native module isn't available (older build,
 * web, Android). Rejects if the PDF can't be opened or the page is out of range.
 */
export async function renderPdfPage(
  pdfUri: string,
  pageNumber: number,
  maxEdge: number,
  outputUri: string,
): Promise<string | null> {
  if (!native) return null;
  return native.renderPage(pdfUri, pageNumber, maxEdge, outputUri);
}

/**
 * Read each page's dimensions (1-based index, cropBox points) without
 * rasterizing. Returns `null` when the native module isn't available.
 */
export async function getPdfPageSizes(pdfUri: string): Promise<PdfPageSize[] | null> {
  if (!native) return null;
  return native.getPageSizes(pdfUri);
}
