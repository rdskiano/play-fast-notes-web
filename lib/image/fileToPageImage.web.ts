// Encode a picked image File into a document page image at the reference scale.
//
// Shared by the initial upload flow (app/upload.web.tsx) and "Add page"
// (components/AddPageButton.web.tsx) so a page added later is encoded exactly
// like the pages added at upload time — same max edge, same JPEG quality, so
// the passage-box coordinate space (page.w × page.h) is consistent.

// Document reference scale — the long edge every stored page image is fit to.
// Matches the PDF render scale so photo pages and PDF pages share a coordinate
// space. Also incidentally normalizes HEIC and huge phone photos.
export const MAX_PAGE_EDGE = 2000;

// Detect HEIC/HEIF. iOS sometimes reports an empty file.type for HEIC, so the
// filename extension is the reliable signal.
export function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

// Chrome and Firefox have no HEIC codec, so new Image()/canvas can't decode an
// iPhone HEIC at all — re-encoding can't help because the DECODE itself fails.
// Convert HEIC to JPEG first with the libheif WASM decoder, lazily imported so
// its ~1.5 MB only loads when a HEIC is actually picked. (Safari decodes HEIC
// natively, so this branch is for everyone else.)
async function toDisplayableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  const heic2any = (await import('heic2any')).default;
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

// Produce a JPEG page image at the document reference scale, and read its
// dimensions in the same pass. HEIC is decoded to JPEG first (above); then the
// browser-decodable blob is drawn to a canvas so the stored page renders
// everywhere.
export async function fileToPageImage(
  file: File,
): Promise<{ blob: Blob; w: number; h: number }> {
  const displayable = await toDisplayableBlob(file);
  const url = URL.createObjectURL(displayable);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new window.Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Could not read that image.'));
      im.src = url;
    });
    const natW = img.naturalWidth || 1;
    const natH = img.naturalHeight || 1;
    const scale = Math.min(1, MAX_PAGE_EDGE / Math.max(natW, natH));
    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available.');
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))),
        'image/jpeg',
        0.9,
      ),
    );
    return { blob, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
