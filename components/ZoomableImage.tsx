// A pinch-and-pan zoom container for score images. Wraps a single Image
// at a fixed aspect-ratio container and lets the user pinch to zoom in
// (up to 4×) OR out (down to 0.4×) and one-finger pan to move the
// transformed view around inside the wrapper. Double-tap resets to 1×.
//
// Why zoom OUT matters: a tightly-cropped passage on phone leaves no
// margin between the last notes and the floating ✓ / ✗ rep buttons that
// sit at the bottom corners of practice screens. Shrinking the score to
// ~0.6× pads empty space around it so the rep buttons no longer overlap
// the music. The user's per-passage zoom is remembered via persistKey,
// so they only need to set the breathing-room scale once per passage.
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
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// 0.4 leaves the score readable while opening up a real margin of
// empty space inside the wrap — enough for the rep buttons to sit
// clear. Anything tighter than that and the score becomes thumbnail-
// sized; anything looser and pinch-back-to-home requires too much
// effort. 4 stays as the zoom-in ceiling.
const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const HOME_SCALE = 1;
// Window around 1× that counts as "back to home." Pinching out and
// releasing inside this band snaps the transform cleanly back to
// identity (scale 1, no pan offset). Outside it, the user stays
// exactly where they aimed — including below 1×.
const HOME_SNAP_TOLERANCE = 0.05;

// Per-key zoom/pan cache. When a caller passes `persistKey`, the
// final transform of the outgoing key is captured and the incoming
// key's saved transform (if any) is restored — so Interleaved /
// Serial Practice can swap between passages and each one remembers
// the exact zoom + pan the user dialed in.
//
// Backed by localStorage (web) so the size you set on a passage STICKS
// across reloads / new sessions — not just within one session. The
// in-memory Map is the fast path; localStorage is the durable store.
type SavedTransform = { scale: number; tx: number; ty: number };
const transformCache = new Map<string, SavedTransform>();
const STORE_PREFIX = 'pfn:zoom:';

function loadSaved(key: string): SavedTransform | undefined {
  const cached = transformCache.get(key);
  if (cached) return cached;
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const raw = localStorage.getItem(STORE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SavedTransform;
    if (
      typeof parsed?.scale === 'number' &&
      typeof parsed?.tx === 'number' &&
      typeof parsed?.ty === 'number'
    ) {
      transformCache.set(key, parsed);
      return parsed;
    }
  } catch {
    // Corrupt / unavailable storage — fall back to no saved transform.
  }
  return undefined;
}

function saveTransform(key: string, t: SavedTransform): void {
  transformCache.set(key, t);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify(t));
    }
  } catch {
    // Storage full / disabled — the in-memory cache still works this session.
  }
}

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
  /** When false, pinch/pan/double-tap are disabled so a finger touch passes
   *  through to an interactive overlay (e.g. the Apple Pencil canvas while
   *  annotating). On a finger-only phone the pan gesture would otherwise
   *  swallow the drawing stroke. Defaults to true. */
  gesturesEnabled?: boolean;
  /** Fires (on the JS thread) when the zoom crosses in/out of ~1×. Lets a
   *  parent disable a surrounding horizontal pager while zoomed, so one-finger
   *  pan moves the image instead of flipping the page. */
  onZoomedChange?: (zoomed: boolean) => void;
};

export function ZoomableImage({
  uri,
  aspectRatio,
  style,
  overlay,
  children,
  persistKey,
  gesturesEnabled = true,
  onZoomedChange,
}: Props) {
  // Seed shared values from the cache so the first render already
  // shows the saved zoom — avoids a flicker at 1× before the effect
  // restores it.
  const initial = persistKey ? loadSaved(persistKey) : undefined;
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
      // Capture the outgoing key's final transform (durably).
      saveTransform(prev, {
        scale: scale.value,
        tx: tx.value,
        ty: ty.value,
      });
    }
    if (persistKey && persistKey !== prev) {
      // Load the incoming key's saved transform (default to identity).
      const saved = loadSaved(persistKey);
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
        saveTransform(prevKeyRef.current, {
          scale: scale.value,
          tx: tx.value,
          ty: ty.value,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tell the parent when we cross in/out of ~1× so it can lock a surrounding
  // horizontal pager while zoomed (otherwise a one-finger pan flips the page).
  useAnimatedReaction(
    () => scale.value > 1.02,
    (zoomed, prev) => {
      if (zoomed !== prev && onZoomedChange) {
        runOnJS(onZoomedChange)(zoomed);
      }
    },
  );

  function reset() {
    scale.value = withTiming(1, { duration: 180 });
    tx.value = withTiming(0, { duration: 180 });
    ty.value = withTiming(0, { duration: 180 });
  }

  const pinch = Gesture.Pinch()
    .enabled(gesturesEnabled)
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
      // Snap fully back when the pinch ends close to 1× so a casual
      // pinch-out-then-release resets cleanly. Below the window (e.g.
      // 0.6×) means the user actively wants the smaller scale —
      // don't yank them back home.
      if (Math.abs(scale.value - HOME_SCALE) <= HOME_SNAP_TOLERANCE) {
        scale.value = withTiming(HOME_SCALE, { duration: 120 });
        tx.value = withTiming(0, { duration: 120 });
        ty.value = withTiming(0, { duration: 120 });
      }
    });

  const pan = Gesture.Pan()
    .enabled(gesturesEnabled)
    .minDistance(2)
    .averageTouches(true)
    .onStart(() => {
      'worklet';
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      'worklet';
      // Pan whenever the score is not at its home scale — zoomed in,
      // OR zoomed out so the user can slide the smaller image around
      // inside the empty space (e.g. shift it up so the bottom-corner
      // rep buttons sit on background instead of notes). At exactly
      // 1×, panning would just push the home view sideways for no
      // reason, so it's gated off.
      if (Math.abs(scale.value - HOME_SCALE) < 0.02) return;
      tx.value = startTx.value + e.translationX;
      ty.value = startTy.value + e.translationY;
    });

  const doubleTap = Gesture.Tap()
    .enabled(gesturesEnabled)
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
    // Transparent so the score inherits its screen's background (the white
    // frame on iPad/laptop, the screen behind it on phone) — keeps the
    // letterbox margin consistent instead of a grey matte.
    backgroundColor: 'transparent',
  },
});
