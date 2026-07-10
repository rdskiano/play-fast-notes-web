// Transient draw-rectangle component for marking a passage on a single page.
//
// iPad port of the web PassageRectDrawer. Same prop contract — pageIndex,
// sourceWidth/Height, slotWidth/Height, draftRegion, active, onDraftChange —
// so the parent's orchestration code is identical across platforms.
//
// Web uses DOM pointer events. iPad uses react-native-gesture-handler's Pan
// gesture with reanimated shared values for smooth UI-thread updates.

import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

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
  // Inactive pages still render the draft rectangle but don't catch gestures.
  active: boolean;
  // Web-only pinch-zoom coordination (see PassageRectDrawer.web.tsx). Accepted
  // and ignored on native, which has its own reading-mode zoom.
  zoom?: number;
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
  onDraftChange,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const imageRect = fitContain(slotWidth, slotHeight, sourceWidth, sourceHeight);

  // Live shared values updated on the UI thread for smooth drawing.
  const drawing = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const currentX = useSharedValue(0);
  const currentY = useSharedValue(0);

  function finalize(sx: number, sy: number, cx: number, cy: number) {
    if (imageRect.w <= 0) return;
    const x = clamp(Math.min(sx, cx), 0, imageRect.w);
    const y = clamp(Math.min(sy, cy), 0, imageRect.h);
    const w = clamp(Math.abs(cx - sx), 0, imageRect.w - x);
    const h = clamp(Math.abs(cy - sy), 0, imageRect.h - y);
    if (w < MIN_DRAG_DISPLAY_PX || h < MIN_DRAG_DISPLAY_PX) return;
    // Display → source-pixel conversion. Uniform k because aspect is preserved.
    const k = sourceWidth / imageRect.w;
    onDraftChange({
      x: Math.round(x * k),
      y: Math.round(y * k),
      w: Math.round(w * k),
      h: Math.round(h * k),
    });
  }

  const pan = Gesture.Pan()
    .enabled(active)
    .onBegin((e) => {
      startX.value = e.x;
      startY.value = e.y;
      currentX.value = e.x;
      currentY.value = e.y;
      drawing.value = true;
    })
    .onUpdate((e) => {
      currentX.value = e.x;
      currentY.value = e.y;
    })
    .onEnd(() => {
      const sx = startX.value;
      const sy = startY.value;
      const cx = currentX.value;
      const cy = currentY.value;
      drawing.value = false;
      runOnJS(finalize)(sx, sy, cx, cy);
    })
    .onFinalize(() => {
      drawing.value = false;
    });

  // Live rect during the drag (display pixels, relative to imageRect).
  const liveRectStyle = useAnimatedStyle(() => {
    if (!drawing.value) return { opacity: 0, width: 0, height: 0 } as const;
    const left = Math.min(startX.value, currentX.value);
    const top = Math.min(startY.value, currentY.value);
    const width = Math.abs(currentX.value - startX.value);
    const height = Math.abs(currentY.value - startY.value);
    return { opacity: 1, left, top, width, height } as const;
  });

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

  // Layout-race fallback — if imageRect dimensions haven't settled, mount a
  // full-slot capture surface so the user can still draw.
  if (imageRect.w <= 0 || imageRect.h <= 0) {
    if (!active) return null;
    return (
      <View pointerEvents="auto" style={[styles.layer, { left: 0, top: 0, right: 0, bottom: 0 }]}>
        <GestureDetector gesture={pan}>
          <Animated.View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      </View>
    );
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
        },
      ]}>
      {active && (
        <GestureDetector gesture={pan}>
          <Animated.View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      )}
      {/* Persisted draft (between drags / on other pages). */}
      {!drawing.value && displayDraft && (
        <View
          pointerEvents="none"
          style={[
            styles.rect,
            {
              left: displayDraft.x,
              top: displayDraft.y,
              width: displayDraft.w,
              height: displayDraft.h,
              borderColor: C.tint,
              backgroundColor: C.tint + '22',
            },
          ]}
        />
      )}
      {/* Live rect while dragging. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.rect,
          { borderColor: C.tint, backgroundColor: C.tint + '22' },
          liveRectStyle,
        ]}
      />
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
