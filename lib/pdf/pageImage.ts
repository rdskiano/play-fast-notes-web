// Native on-demand PDF page resolver.
//
// New PDF uploads store only the original PDF, not a rendered JPEG per page
// ("Stage 2"). The web viewer rasterizes each page in-browser with pdf.js;
// native can't, so here we render the page on-device with PDFKit (the local
// `pdf-render` module) and cache the result as a JPEG in the cache directory.
// Pages that already carry a stored image_uri (older docs imported with per-page
// renders, or image-set passages) are returned directly. Signature must match
// pageImage.web.ts (TypeScript reads this .ts version by default).

import { Directory, File, Paths } from 'expo-file-system';

import { renderPdfPage } from '@/modules/pdf-render';

export type ResolvableDoc = { id: string; original_uri: string | null };
export type ResolvablePage = { index: number; image_uri?: string; w: number; h: number };

// Long-edge cap for rendered pages (px). Close enough to the web reference
// render scale that crop/box coordinates (stored against page w/h) line up.
const MAX_EDGE = 2000;

export async function resolvePageImageUri(
  doc: ResolvableDoc,
  page: ResolvablePage,
): Promise<string> {
  // Stored render (older docs / image sets) — use it directly, no work.
  if (page.image_uri) return page.image_uri;
  // Nothing to render from.
  if (!doc.original_uri) return '';

  try {
    const dir = new Directory(Paths.cache, 'pdf-pages', doc.id);
    if (!dir.exists) dir.create({ intermediates: true });

    // Cache: render each page once, reuse forever (cleared only with the cache).
    // The "-s1" version tag invalidates earlier renders that were written at the
    // Retina screen scale (2x) before the scale-1 fix — those broke passage crops.
    const out = new File(dir, `p${page.index}-s1.jpg`);
    if (out.exists) return out.uri;

    // The renderer needs a local PDF. After /import-supabase the original PDF is
    // already in the app sandbox; guard the case where original_uri is still an
    // http URL (un-downloaded) by fetching it once into the cache.
    let pdfUri = doc.original_uri;
    if (pdfUri.startsWith('http')) {
      const localPdf = new File(dir, 'original.pdf');
      if (!localPdf.exists) await File.downloadFileAsync(pdfUri, localPdf);
      pdfUri = localPdf.uri;
    }

    const rendered = await renderPdfPage(pdfUri, page.index, MAX_EDGE, out.uri);
    return rendered ?? '';
  } catch {
    // Don't crash the viewer over one unreadable page — leave it blank.
    // DocumentPageImage retries on a later activation.
    return '';
  }
}
