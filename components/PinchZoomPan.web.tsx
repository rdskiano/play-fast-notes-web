// Two-finger pinch-zoom + pan wrapper for the document "mark a passage" flow
// on web (phones especially).
//
// WHY THIS EXISTS. The web viewport sets `user-scalable=no`, so the browser's
// own pinch-zoom is off (a foot-pedal keystroke or stray pinch must never zoom
// the score mid-practice). That left the marking screen un-zoomable: on a phone
// the page photo is tiny and you can't place a passage box accurately. This
// wrapper adds our own zoom, scoped to marking mode only.
//
// GESTURE MODEL (chosen with Ralph): TWO fingers zoom + pan the page; ONE finger
// still draws / drags the box underneath. The two live side by side:
//   - We watch pointer events at the container level. A single pointer is left
//     entirely alone — it falls through to the drawer/resizer child, which owns
//     one-finger drawing. We never preventDefault it.
//   - The moment a SECOND pointer lands we flip into pinch mode, tell the parent
//     (onPinchingChange) so the child can cancel any half-drawn box, and drive a
//     CSS transform on the inner wrapper. Zoom is centered on the pinch midpoint;
//     moving both fingers pans.
//
// COORDINATE SAFETY. The transform lives on a wrapper *around* the page image,
// its box overlay, and the draw/resize surfaces — they're all children, so they
// scale together and stay visually aligned. The child gesture components read
// getBoundingClientRect (which already reflects the transform) for their final
// source-pixel math, and take the live `scale` (via onScaleChange → a `zoom`
// prop) only to keep their on-screen preview/drag-delta in step. See
// PassageRectDrawer.web.tsx / PassageRectResizer.web.tsx.

import { useCallback, useEffect, useRef, type ReactNode } from 'react';

type Props = {
  // Only active during marking (draw/resize) on web. When false the wrapper is
  // an inert pass-through at 1×.
  enabled?: boolean;
  maxScale?: number;
  // Bump to snap back to 1× (e.g. on page turn or mode change).
  resetSignal?: number;
  onScaleChange?: (scale: number) => void;
  onPinchingChange?: (pinching: boolean) => void;
  children: ReactNode;
};

type Pt = { x: number; y: number };

export function PinchZoomPan({
  enabled = true,
  maxScale = 4,
  resetSignal,
  onScaleChange,
  onPinchingChange,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  // Current transform, kept in a ref so pointer handlers don't need to re-bind.
  const tf = useRef({ scale: 1, tx: 0, ty: 0 });
  const pointers = useRef<Map<number, Pt>>(new Map());
  const pinch = useRef<{
    dist: number;
    scale: number;
    // Content-space point (top-left origin) that sits under the starting
    // midpoint — held fixed as the scale changes so zoom feels anchored.
    cx: number;
    cy: number;
  } | null>(null);

  const apply = useCallback(() => {
    const el = innerRef.current;
    if (el) {
      el.style.transform = `translate(${tf.current.tx}px, ${tf.current.ty}px) scale(${tf.current.scale})`;
    }
  }, []);

  const reset = useCallback(() => {
    tf.current = { scale: 1, tx: 0, ty: 0 };
    pinch.current = null;
    pointers.current.clear();
    apply();
    onScaleChange?.(1);
    onPinchingChange?.(false);
  }, [apply, onScaleChange, onPinchingChange]);

  // Snap back to 1× when asked (page turn) or when marking mode ends.
  useEffect(() => {
    reset();
  }, [resetSignal, reset]);
  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const size = () => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, left: r.left, top: r.top };
    };

    const clampPan = () => {
      const { w, h } = size();
      const s = tf.current.scale;
      // Inner is container-sized at 1×; scaled it spans w*s × h*s. Keep it
      // covering the container: tx ∈ [w(1-s), 0], ty ∈ [h(1-s), 0].
      tf.current.tx = Math.min(0, Math.max(w * (1 - s), tf.current.tx));
      tf.current.ty = Math.min(0, Math.max(h * (1 - s), tf.current.ty));
    };

    const midpoint = (): Pt => {
      const pts = [...pointers.current.values()];
      return {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
    };
    const distance = (): number => {
      const pts = [...pointers.current.values()];
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const startPinch = () => {
      const { left, top } = size();
      const mid = midpoint();
      const localX = mid.x - left;
      const localY = mid.y - top;
      pinch.current = {
        dist: distance(),
        scale: tf.current.scale,
        cx: (localX - tf.current.tx) / tf.current.scale,
        cy: (localY - tf.current.ty) / tf.current.scale,
      };
      onPinchingChange?.(true);
    };

    const onDown = (e: PointerEvent) => {
      // Only care about touch. Mouse/pen keep single-pointer draw behavior.
      if (e.pointerType === 'mouse') return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) startPinch();
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size < 2 || !pinch.current) return;
      // Two fingers down → pinch/pan. Take over from any one-finger draw.
      e.preventDefault();
      const { left, top } = size();
      const s = Math.min(
        maxScale,
        Math.max(1, (pinch.current.scale * distance()) / pinch.current.dist),
      );
      const mid = midpoint();
      tf.current.scale = s;
      tf.current.tx = mid.x - left - pinch.current.cx * s;
      tf.current.ty = mid.y - top - pinch.current.cy * s;
      clampPan();
      apply();
      onScaleChange?.(s);
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) {
        pinch.current = null;
        onPinchingChange?.(false);
        // Fully released and essentially un-zoomed → snap cleanly back to 1×
        // so a stray tiny zoom doesn't leave the page nudged off-center.
        if (pointers.current.size === 0 && tf.current.scale <= 1.02) {
          tf.current = { scale: 1, tx: 0, ty: 0 };
          apply();
          onScaleChange?.(1);
        }
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [enabled, maxScale, apply, onScaleChange, onPinchingChange]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        // While marking, the container owns touch so two-finger gestures don't
        // scroll the page; one-finger events still reach the child drawer.
        touchAction: enabled ? 'none' : undefined,
      }}>
      <div
        ref={innerRef}
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: '0 0',
        }}>
        {children}
      </div>
    </div>
  );
}
