// Canvas-based image manipulation helpers (web-only — relies on the DOM
// HTMLImageElement, HTMLCanvasElement, and createImageBitmap APIs).
//
// Used by:
//   - components/InlineCropper.tsx — single-rectangle crop
//   - app/multi-page.tsx — two-page passage composite
//   - app/document/[id].tsx (planned) — passage marking + multi-page passage composite
//
// All functions preserve aspect ratio precisely; output JPEGs are quality 0.9.

export type Rect = { x: number; y: number; w: number; h: number };

const STITCH_DEFAULT_WIDTH = 1600;
const JPEG_QUALITY = 0.9;

export async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = url;
  });
}

// Crop a region of a source image (by URL) to a JPEG blob. The rectangle's
// coordinates are in the source image's natural pixel space.
export async function cropToBlob(imageUrl: string, area: Rect): Promise<Blob> {
  const img = await loadImage(imageUrl);
  return cropImageToBlob(img, area);
}

// Crop a region of an already-loaded image. Useful when the caller has cached
// the image and is doing repeated crops (e.g. resize-mode commits).
export async function cropImageToBlob(img: HTMLImageElement, area: Rect): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.w);
  canvas.height = Math.round(area.h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(img, area.x, area.y, area.w, area.h, 0, 0, area.w, area.h);
  return canvasToJpegBlob(canvas);
}

// Stitch N JPEG blobs vertically into one composite.
//
// Two modes:
//
// - **Relative-scale mode** (when `srcWidths` is supplied): each input is
//   rendered at the same "pixels per source page" — `pageScale / srcWidths[i]`
//   — so a half-page crop is literally half the width of a full-page crop,
//   even if the two source images were captured at totally different
//   resolutions (phone photo vs. PDF screenshot). Narrower crops are centered
//   on a white background. This is what the multi-page passage flow uses to
//   keep music at the same scale across the two pages a user combines.
//
// - **Uniform mode** (default): every input is stretched to `fixedWidth`,
//   preserving aspect, heights stacked. Used by `stitchVerticallyUris` for
//   multi-page passages on a PDF — those crops already share a coordinate
//   system, so forcing the same canvas width matches.
export async function stitchVertically(
  blobs: Blob[],
  opts: {
    /** Natural pixel widths of the source page each input was cropped from.
     *  Length must match `blobs.length` to opt into relative-scale mode. */
    srcWidths?: number[];
    /** Pixels representing a "100%-wide source page" in relative-scale mode. */
    pageScale?: number;
    /** Composite width in uniform mode. */
    fixedWidth?: number;
  } = {},
): Promise<Blob> {
  if (blobs.length === 0) throw new Error('stitchVertically: empty input');
  if (blobs.length === 1) return blobs[0];

  const bitmaps = await Promise.all(blobs.map((b) => createImageBitmap(b)));

  const srcWidths = opts.srcWidths;
  if (srcWidths && srcWidths.length === blobs.length) {
    const pageScale = opts.pageScale ?? STITCH_DEFAULT_WIDTH;
    const destWidths = bitmaps.map((bm, i) =>
      Math.round(bm.width * (pageScale / Math.max(1, srcWidths[i]))),
    );
    const destHeights = bitmaps.map((bm, i) =>
      Math.round(bm.height * (pageScale / Math.max(1, srcWidths[i]))),
    );
    const canvasW = Math.max(...destWidths);
    const totalH = destHeights.reduce((a, b) => a + b, 0);

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvasW, totalH);

    let y = 0;
    for (let i = 0; i < bitmaps.length; i++) {
      const x = Math.round((canvasW - destWidths[i]) / 2);
      ctx.drawImage(bitmaps[i], x, y, destWidths[i], destHeights[i]);
      y += destHeights[i];
    }
    return canvasToJpegBlob(canvas);
  }

  const fixedWidth = opts.fixedWidth ?? STITCH_DEFAULT_WIDTH;
  const heights = bitmaps.map((bm) => Math.round((fixedWidth * bm.height) / bm.width));
  const totalH = heights.reduce((a, b) => a + b, 0);

  const canvas = document.createElement('canvas');
  canvas.width = fixedWidth;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, fixedWidth, totalH);

  let y = 0;
  for (let i = 0; i < bitmaps.length; i++) {
    ctx.drawImage(bitmaps[i], 0, y, fixedWidth, heights[i]);
    y += heights[i];
  }
  return canvasToJpegBlob(canvas);
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

// Convert a display-space rectangle (CSS pixels in the rendered viewport) to
// source-space (the natural pixel coordinates of the underlying image, which
// is what regions_json persists).
export function displayToSource(rect: Rect, displayW: number, sourceW: number): Rect {
  const k = sourceW / displayW;
  return {
    x: Math.round(rect.x * k),
    y: Math.round(rect.y * k),
    w: Math.round(rect.w * k),
    h: Math.round(rect.h * k),
  };
}

export function sourceToDisplay(rect: Rect, sourceW: number, displayW: number): Rect {
  const k = displayW / sourceW;
  return {
    x: rect.x * k,
    y: rect.y * k,
    w: rect.w * k,
    h: rect.h * k,
  };
}

// Unified cross-platform API. Returns a blob: URL pointing at the cropped JPEG.
// The native counterpart returns a file:// URI; callers treat the result as
// opaque and either pass to stitchVerticallyUris/persistPassageImage or
// upload it themselves.
export async function cropImage(uri: string, area: Rect): Promise<string> {
  const blob = await cropToBlob(uri, area);
  return URL.createObjectURL(blob);
}

export async function stitchVerticallyUris(uris: string[]): Promise<string> {
  if (uris.length === 0) throw new Error('stitchVerticallyUris: empty input');
  if (uris.length === 1) return uris[0];
  const blobs = await Promise.all(
    uris.map(async (u) => {
      const res = await fetch(u);
      return res.blob();
    }),
  );
  const stitched = await stitchVertically(blobs);
  return URL.createObjectURL(stitched);
}
