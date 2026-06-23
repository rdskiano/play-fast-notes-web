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

// Sharp long edge for display renders (px). Crop callers override this with the
// page's stored size (see resolvePageImageUri opts / the web sibling's note):
// display wants a crisp image, crops need pixels in the page.w × page.h space.
const DISPLAY_MAX_EDGE = 2000;

export async function resolvePageImageUri(
  doc: ResolvableDoc,
  page: ResolvablePage,
  opts: { maxEdge?: number } = {},
): Promise<string> {
  // Fast path: a stored per-page image — but only if it's actually usable. A
  // remote URL loads over the network; a local file is used if it exists. A
  // local path that's GONE (an import that didn't finish pulling images for a
  // big doc, or files lost across an app reinstall) falls through to rendering
  // from the original PDF instead of showing blank.
  if (page.image_uri) {
    if (page.image_uri.startsWith('http')) return page.image_uri;
    try {
      if (new File(page.image_uri).exists) return page.image_uri;
    } catch {
      // unreadable path — fall through to render
    }
  }
  // No usable stored image and nothing to render from.
  if (!doc.original_uri) return page.image_uri ?? '';

  try {
    const dir = new Directory(Paths.cache, 'pdf-pages', doc.id);
    if (!dir.exists) dir.create({ intermediates: true });

    // Render a generous long edge so both the full-page view and the cropped
    // passage stay sharp even when pages_json was recorded small. The edge is
    // part of the cache filename so renders at different sizes don't alias.
    const longEdge = Math.max(page.w, page.h) || 0;
    const renderEdge = opts.maxEdge ?? (Math.max(DISPLAY_MAX_EDGE, longEdge) || DISPLAY_MAX_EDGE);

    // Cache: render each page/size once, reuse forever (cleared only with the
    // cache). The "-s2" version tag invalidates earlier renders written at the
    // wrong scale (2x Retina, or a fixed maxEdge that didn't match pages_json).
    const out = new File(dir, `p${page.index}-s2-e${Math.round(renderEdge)}.jpg`);
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

    const rendered = await renderPdfPage(pdfUri, page.index, renderEdge, out.uri);
    return rendered ?? '';
  } catch {
    // Don't crash the viewer over one unreadable page — leave it blank.
    // DocumentPageImage retries on a later activation.
    return '';
  }
}

/**
 * Resolve a page for cropping a passage out of it. Mirrors the web sibling:
 * passage rects are stored in page.w × page.h space, but we render the page at
 * the sharp display edge (an upscale for small stored pages) so the cropped
 * passage stays crisp in practice, and return the `scale` to multiply the rect
 * by. A stored per-page image is already at page.w × page.h → scale 1.
 */
export async function resolvePageForCrop(
  doc: ResolvableDoc,
  page: ResolvablePage,
): Promise<{ uri: string; scale: number }> {
  const longEdge = Math.max(page.w, page.h) || DISPLAY_MAX_EDGE;
  if (page.image_uri) {
    if (page.image_uri.startsWith('http')) return { uri: page.image_uri, scale: 1 };
    try {
      if (new File(page.image_uri).exists) return { uri: page.image_uri, scale: 1 };
    } catch {
      // unreadable stored image — fall through to a rendered crop
    }
  }
  const cropEdge = Math.max(DISPLAY_MAX_EDGE, longEdge);
  const uri = await resolvePageImageUri(doc, page, { maxEdge: cropEdge });
  return { uri, scale: cropEdge / longEdge };
}
