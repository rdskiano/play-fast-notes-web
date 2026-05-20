import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Options = {
  cardWidth: number;
  expandedHeight: number;
  collapsedHeight: number;
  initialX?: number;
  initialY?: number;
  initialCollapsed?: boolean;
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  /**
   * Extra pixels to keep clear at the top of the screen, beyond the safe-area
   * inset. Use this to stop the card from sliding behind a navigation header.
   * Defaults to 56 — roughly the default Stack header height.
   */
  topInset?: number;
};

/**
 * Shared drag / pinch / clamp / collapse logic for the floating session
 * cards (Tempo Ladder, Interleaved Click-Up, Rhythm pattern card).
 *
 * Returns a composed gesture (Pan + Pinch), an animated style with the
 * current translate + scale, and collapse state management. The card's
 * position is clamped to the visible area so it can never slide behind
 * the navigation header or off-screen.
 */
export function useDraggableCard({
  cardWidth,
  expandedHeight,
  collapsedHeight,
  initialX = 16,
  initialY = 160,
  initialCollapsed = false,
  initialScale = 1,
  minScale = 0.6,
  maxScale = 1.6,
  topInset = 56,
}: Options) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const tx = useSharedValue(initialX);
  const ty = useSharedValue(initialY);
  const startX = useSharedValue(initialX);
  const startY = useSharedValue(initialY);
  const scale = useSharedValue(initialScale);
  const startScale = useSharedValue(initialScale);

  const minXSv = useSharedValue(8);
  const minYSv = useSharedValue(insets.top + topInset);
  const maxXSv = useSharedValue(winW - cardWidth);
  const maxYSv = useSharedValue(winH - expandedHeight);

  useEffect(() => {
    const height = collapsed ? collapsedHeight : expandedHeight;
    const topBound = insets.top + topInset;
    minXSv.value = 8;
    minYSv.value = topBound;
    maxXSv.value = Math.max(8, winW - cardWidth * scale.value);
    maxYSv.value = Math.max(topBound, winH - height * scale.value - 12);
    if (tx.value < minXSv.value) tx.value = minXSv.value;
    if (tx.value > maxXSv.value) tx.value = maxXSv.value;
    if (ty.value < minYSv.value) ty.value = minYSv.value;
    if (ty.value > maxYSv.value) ty.value = maxYSv.value;
  }, [
    winW,
    winH,
    insets.top,
    collapsed,
    cardWidth,
    expandedHeight,
    collapsedHeight,
    topInset,
    minXSv,
    minYSv,
    maxXSv,
    maxYSv,
    tx,
    ty,
    scale,
  ]);

  const clampX = useDerivedValue(() => ({ lo: minXSv.value, hi: maxXSv.value }));
  const clampY = useDerivedValue(() => ({ lo: minYSv.value, hi: maxYSv.value }));

  const pan = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startX.value = tx.value;
      startY.value = ty.value;
    })
    .onUpdate((e) => {
      'worklet';
      const nx = startX.value + e.translationX;
      const ny = startY.value + e.translationY;
      tx.value = Math.max(clampX.value.lo, Math.min(clampX.value.hi, nx));
      ty.value = Math.max(clampY.value.lo, Math.min(clampY.value.hi, ny));
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      'worklet';
      const ns = startScale.value * e.scale;
      scale.value = Math.max(minScale, Math.min(maxScale, ns));
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return {
    collapsed,
    toggleCollapsed: () => setCollapsed((c) => !c),
    gesture,
    animatedStyle,
    scale: scale as SharedValue<number>,
  };
}
