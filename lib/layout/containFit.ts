// Letterbox math for an image rendered with contentFit="contain" inside a
// container. Shared by the marking surface (ScoreWithMarkers, ZoomableImage)
// so the rect that positions the marks and the rect that interprets taps are
// computed identically — otherwise a tap lands a few pixels off the note.

export type DrawnRect = { w: number; h: number; ox: number; oy: number };

export function computeDrawnRect(
  containerW: number,
  containerH: number,
  aspect: number | null,
): DrawnRect {
  if (!aspect || !containerW || !containerH) {
    return { w: containerW, h: containerH, ox: 0, oy: 0 };
  }
  const containerAspect = containerW / containerH;
  if (aspect > containerAspect) {
    const w = containerW;
    const h = w / aspect;
    return { w, h, ox: 0, oy: (containerH - h) / 2 };
  }
  const h = containerH;
  const w = h * aspect;
  return { w, h, ox: (containerW - w) / 2, oy: 0 };
}
