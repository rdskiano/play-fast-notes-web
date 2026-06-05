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
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// Per-key zoom/pan persistence (see the block comment below). Web uses
// localStorage; native uses a filesystem-backed store — same API on both.
import { hydrateZoom, loadZoom, saveZoom } from '@/lib/storage/zoomStore';

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

// Per-key zoom/pan persistence. When a caller passes `persistKey`, the
// final transform of the outgoing key is captured and the incoming
// key's saved transform (if any) is restored — so Interleaved /
// Rep Rotator can swap between passages and each one remembers the
// exact zoom + pan the user dialed in.
//
// The size you set on a passage STICKS across reloads / new sessions on
// BOTH platforms: web uses localStorage, native uses a filesystem-backed
// store (see lib/storage/zoomStore.{ts,web.ts}). `loadZoom` is the sync
// fast path for the first render; `hydrateZoom` covers native's async
// cold-start read.

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
  /** Draw mode (phone, finger drawing): turn OFF all zoom/pan gestures so the
   *  finger reaches the drawing canvas and the stroke isn't chopped by the
   *  gesture recognizer (which made strokes dotted/faint). The zoom transform
   *  persists, so the flow is: position with zoom/pan (pencil off), then draw
   *  (pencil on). Two-finger-zoom-while-drawing was tried and reverted — the
   *  pinch recognizer fought PencilKit for the touch. */
  drawMode?: boolean;
  /** Fires (on the JS thread) when the zoom crosses in/out of ~1×. Lets a
   *  parent disable a surrounding horizontal pager while zoomed, so one-finger
   *  pan moves the image instead of flipping the page. */
  onZoomedChange?: (zoomed: boolean) => void;
  /** Bump this number to snap the zoom/pan back to 1×. The PDF viewer uses it
   *  to reset a page's zoom on every page-turn, so a page left zoomed-in can't
   *  block the next turn. The initial value is ignored; only changes reset. */
  resetSignal?: number;
};

export function ZoomableImage({
  uri,
  aspectRatio,
  style,
  overlay,
  children,
  persistKey,
  gesturesEnabled = true,
  drawMode = false,
  onZoomedChange,
  resetSignal,
}: Props) {
  // Seed shared values from the cache so the first render already
  // shows the saved zoom — avoids a flicker at 1× before the effect
  // restores it.
  const initial = persistKey ? loadZoom(persistKey) : undefined;
  const scale = useSharedValue(initial?.scale ?? 1);
  const tx = useSharedValue(initial?.tx ?? 0);
  const ty = useSharedValue(initial?.ty ?? 0);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  // Track the previously-active key so when persistKey changes we can
  // save the OUTGOING key's transform before loading the new one.
  const prevKeyRef = useRef<string | undefined>(persistKey);

  // Whether the score is currently zoomed away from 1× (in OR out). Used to
  // gate the PAN gesture: at exactly 1× pan is turned OFF so a one-finger
  // swipe falls through to whatever sits behind us — most importantly the
  // PDF viewer's horizontal page-turning ScrollView. Leaving pan enabled at
  // 1× captured the swipe (even though it visually no-ops there) and killed
  // swipe-to-turn-page. Once zoomed, pan re-enables to move the score around.
  const [offHome, setOffHome] = useState(
    initial ? Math.abs((initial.scale ?? 1) - 1) > 0.02 : false,
  );
  useAnimatedReaction(
    () => Math.abs(scale.value - 1) > 0.02,
    (off, prev) => {
      if (off !== prev) runOnJS(setOffHome)(off);
    },
  );

  useEffect(() => {
    const prev = prevKeyRef.current;
    if (prev && prev !== persistKey) {
      // Capture the outgoing key's final transform (durably).
      saveZoom(prev, {
        scale: scale.value,
        tx: tx.value,
        ty: ty.value,
      });
    }
    if (persistKey && persistKey !== prev) {
      // Load the incoming key's saved transform (default to identity).
      const saved = loadZoom(persistKey);
      scale.value = saved?.scale ?? 1;
      tx.value = saved?.tx ?? 0;
      ty.value = saved?.ty ?? 0;
    }
    prevKeyRef.current = persistKey;
    // shared values are stable; only react to key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // Native cold-start: the filesystem store loads asynchronously, so the sync
  // `loadZoom` seed above misses on the very first read after app launch. Once
  // the on-disk map is in memory, apply the saved transform for this key. On
  // web the store is synchronous, so this resolves immediately and just re-sets
  // the same values — harmless.
  useEffect(() => {
    if (!persistKey) return;
    let cancelled = false;
    hydrateZoom(persistKey, (t) => {
      if (cancelled) return;
      scale.value = t.scale;
      tx.value = t.tx;
      ty.value = t.ty;
      setOffHome(Math.abs(t.scale - 1) > 0.02);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // On unmount, save the current key's transform too — so
  // navigating away and back also restores the zoom.
  useEffect(() => {
    return () => {
      if (prevKeyRef.current) {
        saveZoom(prevKeyRef.current, {
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

  // External reset trigger (PDF page-turn). Skip the initial value so we don't
  // animate on mount; only an actual change snaps the page back to full size.
  const resetSignalRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === resetSignalRef.current) return;
    resetSignalRef.current = resetSignal;
    reset();
    setOffHome(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const pinch = Gesture.Pinch()
    .enabled(gesturesEnabled && !drawMode)
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
    // Only while zoomed (off 1×). At home scale, leave pan OFF so a one-finger
    // swipe passes through to a surrounding horizontal pager (page-turn).
    .enabled(gesturesEnabled && !drawMode && offHome)
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
    .enabled(gesturesEnabled && !drawMode)
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
