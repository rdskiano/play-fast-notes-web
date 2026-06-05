// Resize handles for an existing passage rectangle on a single page.
//
// iPad port of the web PassageRectResizer. Same 8-handle model (corners +
// edges) plus a center "move" body. Same prop contract — pageIndex,
// sourceWidth/Height, slotWidth/Height, region, onRegionChange — so the
// parent code ports unchanged.
//
// Web uses DOM pointer events with setPointerCapture; iPad uses a Pan
// gesture per handle (each Pressable wraps its own GestureDetector).

import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS } from 'react-native-reanimated';

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

  // Source-display ratio (uniform x/y because aspect is preserved).
  const k = sourceWidth / imageRect.w;
  const minDisplay = MIN_RECT / k;
  const bounds = imageRect;
  // The rect at the moment a drag BEGINS — captured once per gesture (onBegin),
  // not per render. applyDrag calls onRegionChange, which re-renders with a
  // moved rect; if we derived the start from each render while the gesture's
  // translation keeps accumulating from the original touch, every update would
  // compound and the box would explode to the edges. A fixed start + cumulative
  // translation tracks the finger correctly.
  const startRef = useRef<Rect>(displayRect);
  function captureStart(r: Rect) {
    startRef.current = r;
  }

  function applyDragJS(handle: Handle, dx: number, dy: number) {
    const startRect = startRef.current;
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

  function makeHandleGesture(name: Handle) {
    // Snapshot of the rect at this render; onBegin pins it as the gesture's
    // fixed start so re-renders mid-drag can't shift it.
    const snapshot: Rect = { ...displayRect };
    return Gesture.Pan()
      .onBegin(() => {
        runOnJS(captureStart)(snapshot);
      })
      .onUpdate((e) => {
        runOnJS(applyDragJS)(name, e.translationX, e.translationY);
      });
  }

  function renderHandle(name: Handle, left: number, top: number) {
    return (
      <GestureDetector key={name} gesture={makeHandleGesture(name)}>
        <Animated.View
          style={[
            styles.handle,
            {
              left,
              top,
              backgroundColor: C.tint,
            },
          ]}
        />
      </GestureDetector>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { left: imageRect.x, top: imageRect.y, width: imageRect.w, height: imageRect.h }]}>
      {/* Body — drag to move the whole rectangle. */}
      <GestureDetector gesture={makeHandleGesture('move')}>
        <Animated.View
          style={[
            styles.body,
            {
              left: displayRect.x,
              top: displayRect.y,
              width: displayRect.w,
              height: displayRect.h,
              borderColor: C.tint,
              backgroundColor: C.tint + '33',
            },
          ]}
        />
      </GestureDetector>
      {/* Corner handles — half outside the rect for visual clarity. */}
      {renderHandle('tl', displayRect.x - HANDLE_SIZE / 2, displayRect.y - HANDLE_SIZE / 2)}
      {renderHandle('tr', displayRect.x + displayRect.w - HANDLE_SIZE / 2, displayRect.y - HANDLE_SIZE / 2)}
      {renderHandle('bl', displayRect.x - HANDLE_SIZE / 2, displayRect.y + displayRect.h - HANDLE_SIZE / 2)}
      {renderHandle('br', displayRect.x + displayRect.w - HANDLE_SIZE / 2, displayRect.y + displayRect.h - HANDLE_SIZE / 2)}
      {/* Edge handles — centered on each side. */}
      {renderHandle('t', displayRect.x + displayRect.w / 2 - HANDLE_SIZE / 2, displayRect.y - HANDLE_SIZE / 2)}
      {renderHandle('r', displayRect.x + displayRect.w - HANDLE_SIZE / 2, displayRect.y + displayRect.h / 2 - HANDLE_SIZE / 2)}
      {renderHandle('b', displayRect.x + displayRect.w / 2 - HANDLE_SIZE / 2, displayRect.y + displayRect.h - HANDLE_SIZE / 2)}
      {renderHandle('l', displayRect.x - HANDLE_SIZE / 2, displayRect.y + displayRect.h / 2 - HANDLE_SIZE / 2)}
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
  body: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: Radii.sm,
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 2,
    borderColor: '#fff',
  },
});
