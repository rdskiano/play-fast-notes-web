// Resize handles for an existing passage rectangle on a single page.
//
// 8 handles + a "move" body — same model as InlineCropper, generalized to
// edge handles (top, right, bottom, left). Drags update the rectangle in
// display pixels; the parent receives the result in source pixels via
// onRegionChange. Commits (re-crop + re-stitch + re-upload) live in the
// parent so this component can stay focused on the gesture math.

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Radii } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type Rect } from '@/lib/image/canvasCrop';

const HANDLE_SIZE = 28;
const MIN_RECT = 40; // source-pixel minimum

type Handle = 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l';

type Props = {
  pageIndex: number;
  sourceWidth: number;
  sourceHeight: number;
  slotWidth: number;
  slotHeight: number;
  region: Rect; // source pixels
  onRegionChange: (next: Rect) => void;
};

export function PassageRectResizer({
  pageIndex: _pageIndex,
  sourceWidth,
  sourceHeight,
  slotWidth,
  slotHeight,
  region,
  onRegionChange,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const imageRect = fitContain(slotWidth, slotHeight, sourceWidth, sourceHeight);
  if (imageRect.w <= 0 || imageRect.h <= 0) return null;

  // Display-pixel rect (relative to imageRect's top-left).
  const displayRect: Rect = {
    x: (region.x / sourceWidth) * imageRect.w,
    y: (region.y / sourceHeight) * imageRect.h,
    w: (region.w / sourceWidth) * imageRect.w,
    h: (region.h / sourceHeight) * imageRect.h,
  };

  function startDrag(e: React.PointerEvent<HTMLDivElement>, handle: Handle) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect: Rect = { ...displayRect };
    const bounds = imageRect;

    // Source-display ratio (uniform x/y because aspect is preserved).
    const k = sourceWidth / bounds.w;
    const minDisplay = MIN_RECT / k;

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const next: Rect = { ...startRect };

      if (handle === 'move') {
        next.x = clamp(startRect.x + dx, 0, bounds.w - startRect.w);
        next.y = clamp(startRect.y + dy, 0, bounds.h - startRect.h);
      } else if (handle === 'tl') {
        const nx = clamp(startRect.x + dx, 0, startRect.x + startRect.w - minDisplay);
        const ny = clamp(startRect.y + dy, 0, startRect.y + startRect.h - minDisplay);
        next.x = nx;
        next.y = ny;
        next.w = startRect.x + startRect.w - nx;
        next.h = startRect.y + startRect.h - ny;
      } else if (handle === 'tr') {
        const ny = clamp(startRect.y + dy, 0, startRect.y + startRect.h - minDisplay);
        const nw = clamp(startRect.w + dx, minDisplay, bounds.w - startRect.x);
        next.y = ny;
        next.w = nw;
        next.h = startRect.y + startRect.h - ny;
      } else if (handle === 'bl') {
        const nx = clamp(startRect.x + dx, 0, startRect.x + startRect.w - minDisplay);
        const nh = clamp(startRect.h + dy, minDisplay, bounds.h - startRect.y);
        next.x = nx;
        next.w = startRect.x + startRect.w - nx;
        next.h = nh;
      } else if (handle === 'br') {
        const nw = clamp(startRect.w + dx, minDisplay, bounds.w - startRect.x);
        const nh = clamp(startRect.h + dy, minDisplay, bounds.h - startRect.y);
        next.w = nw;
        next.h = nh;
      } else if (handle === 't') {
        const ny = clamp(startRect.y + dy, 0, startRect.y + startRect.h - minDisplay);
        next.y = ny;
        next.h = startRect.y + startRect.h - ny;
      } else if (handle === 'r') {
        next.w = clamp(startRect.w + dx, minDisplay, bounds.w - startRect.x);
      } else if (handle === 'b') {
        next.h = clamp(startRect.h + dy, minDisplay, bounds.h - startRect.y);
      } else if (handle === 'l') {
        const nx = clamp(startRect.x + dx, 0, startRect.x + startRect.w - minDisplay);
        next.x = nx;
        next.w = startRect.x + startRect.w - nx;
      }

      onRegionChange({
        x: Math.round(next.x * k),
        y: Math.round(next.y * k),
        w: Math.round(next.w * k),
        h: Math.round(next.h * k),
      });
    }

    function onUp() {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  // Each handle is a div (so we can listen for pointer events directly the
  // same way InlineCropper does). Wrapped in a non-event-propagating View so
  // the rect's "move" handler doesn't fire when you grab a corner.
  function handle(name: Handle, style: React.CSSProperties) {
    return (
      <div
        onPointerDown={(e) => startDrag(e, name)}
        style={{
          position: 'absolute',
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          background: C.tint,
          borderRadius: 999,
          border: '2px solid #fff',
          touchAction: 'none',
          userSelect: 'none',
          cursor: cursorFor(name),
          zIndex: 12,
          ...style,
        }}
      />
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { left: imageRect.x, top: imageRect.y, width: imageRect.w, height: imageRect.h }]}>
      <Pressable
        // Body of the rect — drag to move. Pressable is a fallback for the
        // accessibility label; the actual drag handler is on the inner div.
        accessibilityLabel="Drag to move passage box"
        style={{
          position: 'absolute',
          left: displayRect.x,
          top: displayRect.y,
          width: displayRect.w,
          height: displayRect.h,
        }}>
        <div
          onPointerDown={(e) => startDrag(e, 'move')}
          style={{
            position: 'absolute',
            inset: 0,
            background: C.tint + '33',
            border: `2px solid ${C.tint}`,
            borderRadius: 4,
            touchAction: 'none',
            userSelect: 'none',
            cursor: 'move',
          }}
        />
      </Pressable>
      {/* Corner handles — half outside the rect for visual clarity */}
      {handle('tl', { left: displayRect.x - HANDLE_SIZE / 2, top: displayRect.y - HANDLE_SIZE / 2 })}
      {handle('tr', { left: displayRect.x + displayRect.w - HANDLE_SIZE / 2, top: displayRect.y - HANDLE_SIZE / 2 })}
      {handle('bl', { left: displayRect.x - HANDLE_SIZE / 2, top: displayRect.y + displayRect.h - HANDLE_SIZE / 2 })}
      {handle('br', { left: displayRect.x + displayRect.w - HANDLE_SIZE / 2, top: displayRect.y + displayRect.h - HANDLE_SIZE / 2 })}
      {/* Edge handles — centered on each side */}
      {handle('t', { left: displayRect.x + displayRect.w / 2 - HANDLE_SIZE / 2, top: displayRect.y - HANDLE_SIZE / 2 })}
      {handle('r', { left: displayRect.x + displayRect.w - HANDLE_SIZE / 2, top: displayRect.y + displayRect.h / 2 - HANDLE_SIZE / 2 })}
      {handle('b', { left: displayRect.x + displayRect.w / 2 - HANDLE_SIZE / 2, top: displayRect.y + displayRect.h - HANDLE_SIZE / 2 })}
      {handle('l', { left: displayRect.x - HANDLE_SIZE / 2, top: displayRect.y + displayRect.h / 2 - HANDLE_SIZE / 2 })}
    </View>
  );
}

function cursorFor(h: Handle): string {
  switch (h) {
    case 'tl':
    case 'br':
      return 'nwse-resize';
    case 'tr':
    case 'bl':
      return 'nesw-resize';
    case 't':
    case 'b':
      return 'ns-resize';
    case 'l':
    case 'r':
      return 'ew-resize';
    default:
      return 'move';
  }
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
});
