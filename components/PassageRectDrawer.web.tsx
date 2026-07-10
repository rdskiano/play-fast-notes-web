// Transient draw-rectangle component for marking a passage on a single page.
//
// Positions a pointer-event overlay over the rendered page image, lets the
// user drag a rectangle, and reports the result in source-pixel coordinates.
// One drawer mounts per page in draw mode; the parent decides which page is
// active. Inactive pages render the existing draftRegion (if any) but don't
// accept new drags.

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Radii } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type Rect } from '@/lib/image/canvasCrop';

const MIN_DRAG_DISPLAY_PX = 12; // ignore dragging less than this in screen px

type Props = {
  // 1-indexed page number this drawer covers.
  pageIndex: number;
  // Source-pixel dimensions of the rendered page JPG.
  sourceWidth: number;
  sourceHeight: number;
  // Rendered dimensions of the page slot on screen.
  slotWidth: number;
  slotHeight: number;
  // Current draft rectangle for this page (in source pixels), if any.
  draftRegion: Rect | null;
  // Whether this page's drawer is the one accepting new drags right now.
  // Inactive pages still render the draft rectangle but don't catch pointer events.
  active: boolean;
  // Current pinch-zoom scale of the wrapping PinchZoomPan (1 = un-zoomed). The
  // final source-pixel region comes out right at any scale (getBoundingClientRect
  // already reflects the CSS transform), but the live on-screen preview rect is
  // rendered as a child of the scaled wrapper, so we draw it in un-scaled local
  // pixels — hence the division by `zoom` below.
  zoom?: number;
  // True while a two-finger pinch owns the gesture. New one-finger drags are
  // ignored and any in-flight drag is cancelled, so a pinch never leaves a
  // half-drawn box behind.
  suspended?: boolean;
  // Fires when the user finishes a drag (or starts a new one and replaces).
  onDraftChange: (region: Rect | null) => void;
};

export function PassageRectDrawer({
  pageIndex: _pageIndex,
  sourceWidth,
  sourceHeight,
  slotWidth,
  slotHeight,
  draftRegion,
  active,
  zoom = 1,
  suspended = false,
  onDraftChange,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Live rectangle in un-scaled local pixels (relative to the image rect's
  // top-left). Rendered as a child of the pinch-scaled wrapper.
  const [liveRect, setLiveRect] = useState<Rect | null>(null);
  // Teardown for the in-flight drag, so a two-finger pinch can cancel it.
  const dragRef = useRef<(() => void) | null>(null);

  // When a pinch takes over, abort any drag in progress and drop the preview.
  useEffect(() => {
    if (suspended && dragRef.current) {
      dragRef.current();
      dragRef.current = null;
      setLiveRect(null);
    }
  }, [suspended]);

  const imageRect = fitContain(slotWidth, slotHeight, sourceWidth, sourceHeight);
  // Fallback: when slot dimensions haven't been measured yet (iPad Safari
  // sometimes races the onLayout callback), fall through to a full-pageSlot
  // hit area so the user can still draw. The source-coord conversion at
  // pointerup uses getBoundingClientRect, so the rectangle stays accurate.
  if (imageRect.w <= 0 || imageRect.h <= 0) {
    if (!active) return null;
    return (
      <View
        pointerEvents="auto"
        style={[styles.layer, { left: 0, top: 0, right: 0, bottom: 0 }]}>
        <div
          ref={containerRef}
          onPointerDown={onPointerDown}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            cursor: 'crosshair',
            touchAction: 'none',
            userSelect: 'none',
            zIndex: 9999,
          }}
        />
      </View>
    );
  }

  // Convert the persisted source-pixel draft into display coords for rendering.
  const displayDraft: Rect | null =
    draftRegion && imageRect.w > 0
      ? {
          x: (draftRegion.x / sourceWidth) * imageRect.w,
          y: (draftRegion.y / sourceHeight) * imageRect.h,
          w: (draftRegion.w / sourceWidth) * imageRect.w,
          h: (draftRegion.h / sourceHeight) * imageRect.h,
        }
      : null;

  const renderRect = liveRect ?? displayDraft;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Ignore while a pinch owns the gesture, and never start a second drag
    // (e.g. the pinch's second finger landing on this surface).
    if (!active || suspended || dragRef.current) return;
    const s = zoom || 1;
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    // getBoundingClientRect reflects the pinch transform, so its size is in
    // scaled screen pixels; divide by `s` to work in the un-scaled local space
    // the preview rect is rendered into.
    const rect = target.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / s;
    const startY = (e.clientY - rect.top) / s;
    setLiveRect({ x: startX, y: startY, w: 0, h: 0 });

    function localPoint(ev: PointerEvent) {
      const r = target.getBoundingClientRect();
      const localW = r.width / s;
      const localH = r.height / s;
      const cx = clamp((ev.clientX - r.left) / s, 0, localW);
      const cy = clamp((ev.clientY - r.top) / s, 0, localH);
      return { cx, cy, localW };
    }

    function onMove(ev: PointerEvent) {
      const { cx, cy } = localPoint(ev);
      setLiveRect({
        x: Math.min(startX, cx),
        y: Math.min(startY, cy),
        w: Math.abs(cx - startX),
        h: Math.abs(cy - startY),
      });
    }

    function cleanup() {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    }

    function onUp(ev: PointerEvent) {
      cleanup();
      dragRef.current = null;
      target.releasePointerCapture?.(ev.pointerId);

      const { cx, cy, localW } = localPoint(ev);
      const x = Math.min(startX, cx);
      const y = Math.min(startY, cy);
      const w = Math.abs(cx - startX);
      const h = Math.abs(cy - startY);

      // Reject tiny drags (treat as accidental tap). Threshold is in on-screen
      // pixels, so scale the local size back up by `s`.
      if (w * s < MIN_DRAG_DISPLAY_PX || h * s < MIN_DRAG_DISPLAY_PX) {
        setLiveRect(null);
        return;
      }

      // local → source pixels. localW is the un-scaled rendered width, so this
      // ratio is independent of the pinch zoom.
      const k = sourceWidth / localW;
      const finalRegion: Rect = {
        x: Math.round(x * k),
        y: Math.round(y * k),
        w: Math.round(w * k),
        h: Math.round(h * k),
      };
      setLiveRect(null);
      onDraftChange(finalRegion);
    }

    dragRef.current = cleanup;
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  return (
    <View
      pointerEvents={active ? 'auto' : 'box-none'}
      style={[
        styles.layer,
        {
          left: imageRect.x,
          top: imageRect.y,
          width: imageRect.w,
          height: imageRect.h,
          zIndex: 9999,
        },
      ]}>
      {/* Pointer-capture surface: only mounts when active so inactive pages
          don't intercept page-swipe gestures from a parent. */}
      {active && (
        <div
          ref={containerRef}
          onPointerDown={onPointerDown}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            cursor: 'crosshair',
            touchAction: 'none',
            userSelect: 'none',
            zIndex: 9999,
          }}
        />
      )}
      {renderRect && (
        <View
          pointerEvents="none"
          style={[
            styles.rect,
            {
              left: renderRect.x,
              top: renderRect.y,
              width: renderRect.w,
              height: renderRect.h,
              borderColor: C.tint,
              backgroundColor: C.tint + '22',
            },
          ]}
        />
      )}
    </View>
  );
}

function fitContain(slotW: number, slotH: number, sourceW: number, sourceH: number) {
  const slotAspect = slotW / slotH;
  const sourceAspect = sourceW / sourceH;
  if (sourceAspect > slotAspect) {
    const w = slotW;
    const h = w / sourceAspect;
    return { x: 0, y: (slotH - h) / 2, w, h };
  }
  const h = slotH;
  const w = h * sourceAspect;
  return { x: (slotW - w) / 2, y: 0, w, h };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
  },
  rect: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: Radii.sm,
  },
});
