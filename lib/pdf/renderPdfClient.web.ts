// On-device PDF page rasterizer (web). Replaces the server-side pdf-render-page
// edge function: the device's browser draws each page with pdf.js, so there's
// no 256 MB serverless memory ceiling — big scanned PDFs that crashed the
// function (WORKER_RESOURCE_LIMIT) render fine here using the device's RAM.
//
// Pages render sequentially, freeing each canvas before the next, so peak
// memory stays low even on huge scans. Output matches what the edge function
// produced: a JPEG blob per page plus its rendered pixel dimensions, so the
// document viewer / crop / overlay coordinate math is unchanged.
//
// pdf.js is loaded from a CDN via a <script> tag rather than bundled. The npm
// build uses `import.meta`, which Metro's web bundler can't transpile, and
// this mirrors how the app already loads abcjs (see AbcStaffView.web.tsx). It
// also isolates pdf.js from the app bundle — a CDN hiccup can only affect PDF
// rendering, nothing else.

export type RenderedPage = { index: number; blob: Blob; w: number; h: number };

// Pinned UMD build (exposes window.pdfjsLib). v3 ships a classic worker, which
// is simpler to load cross-origin than v4's module worker.
const PDFJS_VERSION = '3.11.174';
const PDFJS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

// pdf.js v3 API surface we use. Typed loosely since the lib is loaded at
// runtime from a script tag, not imported.
type PdfjsLib = any; // eslint-disable-line @typescript-eslint/no-explicit-any

let pdfjsPromise: Promise<PdfjsLib> | null = null;

function loadPdfjs(): Promise<PdfjsLib> {
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

export async function renderPdfToPages(
  data: ArrayBuffer,
  opts: {
    maxEdge?: number;
    quality?: number;
    onPage?: (done: number, total: number) => void;
  } = {},
): Promise<RenderedPage[]> {
  const maxEdge = opts.maxEdge ?? 2000;
  const quality = opts.quality ?? 0.72;

  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const total: number = pdf.numPages;
  const pages: RenderedPage[] = [];

  try {
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = maxEdge / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale });

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

        pages.push({ index: i, blob, w: canvas.width, h: canvas.height });

        // Release this page's memory before rendering the next.
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        page.cleanup();
      }
      opts.onPage?.(i, total);
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}
