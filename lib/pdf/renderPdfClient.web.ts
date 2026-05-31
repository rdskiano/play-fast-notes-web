// pdf.js on-device home (web). This module owns loading pdf.js and rendering
// PDF pages in the browser — no server, so big scanned PDFs that crashed the
// old pdf-render-page edge function (256 MB WORKER_RESOURCE_LIMIT) work fine.
//
// As of "Stage 2" we no longer pre-render every page to storage on upload.
// Instead:
//   - upload.ts calls getPdfPageSizes() to record each page's pixel
//     dimensions (the coordinate space regions_json boxes live in) WITHOUT
//     rasterizing — cheap, just reads each viewport.
//   - lib/pdf/pageImage.web.ts renders individual pages on demand via
//     renderPdfPageToBlob() when the viewer / picker / crop actually needs the
//     image, caching the results.
//
// pdf.js is loaded from a CDN via a <script> tag rather than bundled. The npm
// build uses `import.meta`, which Metro's web bundler can't transpile, and
// this mirrors how the app already loads abcjs (see AbcStaffView.web.tsx). It
// also isolates pdf.js from the app bundle — a CDN hiccup can only affect PDF
// rendering, nothing else.

// Pinned UMD build (exposes window.pdfjsLib). v3 ships a classic worker, which
// is simpler to load cross-origin than v4's module worker.
const PDFJS_VERSION = '3.11.174';
const PDFJS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

// pdf.js v3 API surface we use. Typed loosely since the lib is loaded at
// runtime from a script tag, not imported.
type PdfjsLib = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type PdfDocument = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PageSize = { index: number; w: number; h: number };
export type RenderedPage = { blob: Blob; w: number; h: number };

const DEFAULT_MAX_EDGE = 2000;
const DEFAULT_QUALITY = 0.72;

let pdfjsPromise: Promise<PdfjsLib> | null = null;

// Load pdf.js once (cached). Exported so the on-demand page renderer
// (pageImage.web.ts) shares this single CDN-script loader.
export function loadPdfjs(): Promise<PdfjsLib> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = new Promise<PdfjsLib>((resolve, reject) => {
    const w = window as unknown as { pdfjsLib?: PdfjsLib };
    const finish = () => {
      if (!w.pdfjsLib) {
        reject(new Error('pdf.js loaded but window.pdfjsLib is missing'));
        return;
      }
      w.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(w.pdfjsLib);
    };
    if (w.pdfjsLib) {
      finish();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-pdfjs]');
    if (existing) {
      existing.addEventListener('load', finish);
      existing.addEventListener('error', () => reject(new Error('pdf.js script failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = PDFJS_SRC;
    s.async = true;
    s.setAttribute('data-pdfjs', '1');
    s.onload = finish;
    s.onerror = () => reject(new Error('pdf.js script failed to load'));
    document.head.appendChild(s);
  });
  return pdfjsPromise;
}

// Open a PDF from raw bytes into a pdf.js document handle. Callers are
// responsible for `pdf.destroy()` when done (or keeping it alive in a cache).
export async function openPdf(data: ArrayBuffer): Promise<PdfDocument> {
  const pdfjsLib = await loadPdfjs();
  return pdfjsLib.getDocument({ data }).promise;
}

// The scale that maps a page's natural (scale-1) viewport to the reference
// render size, capping the long edge at maxEdge. This is the single source of
// truth for the coordinate space regions_json boxes live in — getPdfPageSizes
// (record-time) and renderPdfPageToBlob (display-time) must agree.
function scaleForViewport(baseWidth: number, baseHeight: number, maxEdge: number): number {
  return maxEdge / Math.max(baseWidth, baseHeight);
}

// Read each page's pixel dimensions at the reference scale WITHOUT rasterizing.
// Used at upload time so pages_json records w/h (the box coordinate space)
// while the actual page images are rendered on demand later.
export async function getPdfPageSizes(
  data: ArrayBuffer,
  opts: { maxEdge?: number } = {},
): Promise<PageSize[]> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const pdf = await openPdf(data);
  const total: number = pdf.numPages;
  const sizes: PageSize[] = [];
  try {
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      try {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: scaleForViewport(base.width, base.height, maxEdge) });
        sizes.push({ index: i, w: Math.round(viewport.width), h: Math.round(viewport.height) });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdf.destroy();
  }
  return sizes;
}

// Rasterize a single page of an already-open PDF document to a JPEG blob.
// Frees the canvas immediately so peak memory stays low. The rendered pixel
// dimensions match what getPdfPageSizes recorded for the same maxEdge, so a
// crop rect stored against those dimensions lands correctly.
export async function renderPdfPageToBlob(
  pdf: PdfDocument,
  index: number,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<RenderedPage> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  const page = await pdf.getPage(index);
  try {
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: scaleForViewport(base.width, base.height, maxEdge) });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('could not get 2d canvas context');
    // PDFs can be transparent; paint white so JPEG (no alpha) looks right.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
        'image/jpeg',
        quality,
      );
    });

    const w = canvas.width;
    const h = canvas.height;
    // Release this page's memory.
    canvas.width = 0;
    canvas.height = 0;
    return { blob, w, h };
  } finally {
    page.cleanup();
  }
}
