// A pinch-and-pan zoom container for the rhythm builder's reference
// score on phone. Wraps a single Image at a fixed aspect-ratio container
// and lets the user pinch to zoom in (up to 4×) and one-finger pan to
// move the zoomed view. Double-tap resets to 1×.
//
// Uses react-native-gesture-handler + reanimated, mirroring the
// composable pinch + pan pattern already used by ToolDock. The whole
// transform stays inside the wrapper, so the rest of the screen is
// unaffected and the page-level `user-scalable=no` viewport stays in
// effect — practice screens keep their existing pinch-to-resize tool
// cards.

import { Image } from 'expo-image';
import { type ReactNode, useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 4;

// Per-key zoom/pan cache. When a caller passes `persistKey`, the
// final transform of the outgoing key is captured and the incoming
// key's saved transform (if any) is restored — so Interleaved /
// Serial Practice can swap between passages and each one remembers
// the exact zoom + pan the user dialed in. In-memory only: lost on
// app reload, which is fine for a practice session.
type SavedTransform = { scale: number; tx: number; ty: number };
const transformCache = new Map<string, SavedTransform>();

type Props = {
  /** Source image URI. Required unless `children` is provided. */
  uri?: string;
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  /** Optional content overlaid on top of the image at the same transform
   *  (e.g. selection rectangles). Rendered inside the zoomed wrapper. */
  overlay?: ReactNode;
  /** When provided, replaces the built-in <Image> render entirely. The
   *  children sit inside the zoomed transform so any markers / arrows /
   *  annotation overlays positioned in the same coordinate space scale
   *  with the image. Used by Click-Up to make ScoreWithMarkers
   *  pinch-zoomable while keeping its ▼ markers in sync. */
  children?: ReactNode;
  /** Optional stable id (typically a passage id). When set, the user's
   *  zoom + pan is captured per key, so swapping between passages in
   *  the same session restores each one's last-used transform instead
   *  of inheriting the previous passage's zoom. */
  persistKey?: string;
};

export function ZoomableImage({
  uri,
  aspectRatio,
  style,
  overlay,
  children,
  persistKey,
}: Props) {
  // Seed shared values from the cache so the first render already
  // shows the saved zoom — avoids a flicker at 1× before the effect
  // restores it.
  const initial = persistKey ? transformCache.get(persistKey) : undefined;
  const scale = useSharedValue(initial?.scale ?? 1);
  const tx = useSharedValue(initial?.tx ?? 0);
  const ty = useSharedValue(initial?.ty ?? 0);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  // Track the previously-active key so when persistKey changes we can
  // save the OUTGOING key's transform before loading the new one.
  const prevKeyRef = useRef<string | undefined>(persistKey);

  useEffect(() => {
    const prev = prevKeyRef.current;
    if (prev && prev !== persistKey) {
      // Capture the outgoing key's final transform.
      transformCache.set(prev, {
        scale: scale.value,
        tx: tx.value,
        ty: ty.value,
      });
    }
    if (persistKey && persistKey !== prev) {
      // Load the incoming key's saved transform (default to identity).
      const saved = transformCache.get(persistKey);
      scale.value = saved?.scale ?? 1;
      tx.value = saved?.tx ?? 0;
      ty.value = saved?.ty ?? 0;
    }
    prevKeyRef.current = persistKey;
    // shared values are stable; only react to key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // On unmount, save the current key's transform too — so
  // navigating away and back also restores the zoom.
  useEffect(() => {
    return () => {
      if (prevKeyRef.current) {
        transformCache.set(prevKeyRef.current, {
          scale: scale.value,
          tx: tx.value,
          ty: ty.value,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    scale.value = withTiming(1, { duration: 180 });
    tx.value = withTiming(0, { duration: 180 });
    ty.value = withTiming(0, { duration: 180 });
  }

  const pinch = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, startScale.value * e.scale),
      );
      scale.value = next;
    })
    .onEnd(() => {
      'worklet';
      // Snap fully back when pinch ends at or below 1× so a casual
      // pinch-out then release resets cleanly.
      if (scale.value <= MIN_SCALE + 0.02) {
        scale.value = withTiming(1, { duration: 120 });
        tx.value = withTiming(0, { duration: 120 });
        ty.value = withTiming(0, { duration: 120 });
      }
    });

  const pan = Gesture.Pan()
    .minDistance(2)
    .averageTouches(true)
    .onStart(() => {
      'worklet';
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      'worklet';
      // Only pan when zoomed in — otherwise a swipe would just push the
      // unscaled image around for no reason.
      if (scale.value <= MIN_SCALE) return;
      tx.value = startTx.value + e.translationX;
      ty.value = startTy.value + e.translationY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      runOnJS(reset)();
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={[styles.wrap, aspectRatio ? { aspectRatio } : null, style]}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
          {children ?? (
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              // `contain` so the full passage is always visible at 1× —
              // the user pinches IN from there. `cover` would crop the
              // image to fill the container, hiding edges on first
              // load.
              contentFit="contain"
            />
          )}
          {overlay}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#0001',
  },
});
