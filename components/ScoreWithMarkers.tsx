import { Image, type ImageLoadEventData } from 'expo-image';
import { useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Borders, Radii, Status, Type } from '@/constants/tokens';
import { computeDrawnRect } from '@/lib/layout/containFit';
import type { Marker } from '@/lib/db/repos/passages';

type Props = {
  uri: string;
  markers: Marker[];
  mode: 'place' | 'play';
  activePair?: [number, number] | null;
  onTap?: (point: { x: number; y: number }) => void;
  onRemoveMarker?: (index: number) => void;
  // When false, the component stops capturing touches itself — used when it
  // sits inside a ZoomableImage that owns the tap gesture and feeds normalized
  // points back via onTapPoint. Defaults to true so existing callers (the
  // non-zoom marking path) keep their tap-to-place / tap-to-remove behavior.
  captureTaps?: boolean;
  // Smaller marks + arrows for note-level marking (Micro-Chaining), where the
  // links sit close together and the standard beat/measure markers (sized for
  // Click-Up) overlap and bury each other. Defaults to the standard size.
  compact?: boolean;
  // Place-mode only: indices drawn in the highlight color (orange) instead of
  // the default green — used to show the two chosen notes of a problem span.
  highlightIndices?: number[];
  // Play-mode only: shrink the ▼ arrows further for phone screens, where the
  // standard chain arrows crowd the small viewport. Non-phone keeps the normal
  // size. Only the chaining screens (Micro / Macro) pass this.
  phoneArrows?: boolean;
  // Place-mode only: how far (px, pre-zoom) the numbered badge floats ABOVE the
  // tapped point. The default sits the badge right on top of the tap; a larger
  // value lets the user tap directly ON a note and have the number register
  // clearly above it (experiment, Click-Up). Falls back to the compact/standard
  // default when unset.
  placeLiftPx?: number;
  // Play-mode only: how far (px, pre-zoom) the ▼ arrow floats above the note.
  // Pass the same value as placeLiftPx so a unit's cue sits at the same height
  // on the marking and playing screens. Falls back to the default when unset.
  playLiftPx?: number;
};

const MARKER_HIT_RADIUS = 24;

// Shared vertical lift (px, pre-zoom) for the numbered marking badges (place)
// and the ▼ play arrows, used by EVERY strategy that marks the score (Click-Up,
// Micro-Chaining, Macro-Chaining). One consistent gesture everywhere: the user
// taps RIGHT ON the note and the cue registers clearly above it. Pass this as
// both placeLiftPx and playLiftPx so a mark sits at the same height on the
// marking and playing screens. Bumped 58 → 70 so a mark clears the note with a
// little more room at normal (un-zoomed) scale — at home zoom the old value sat
// too close to the notehead, especially noticeable after zooming back out.
export const SCORE_MARK_LIFT = 70;

export function ScoreWithMarkers({
  uri,
  markers,
  mode,
  onTap,
  onRemoveMarker,
  captureTaps = true,
  compact = false,
  highlightIndices,
  phoneArrows = false,
  placeLiftPx,
  playLiftPx,
}: Props) {
  const highlightSet = new Set(highlightIndices ?? []);
  // Marker geometry — compact for note-level chains, standard for beats.
  const mSize = compact ? 18 : 28;
  const mHalf = mSize / 2;
  const mLift = placeLiftPx ?? (compact ? 22 : 28); // px the circle sits above the tapped point
  const mFont = compact ? 10 : 12;
  // Play-mode ▼ arrows: standard 20 for chaining screens (28 for beat-level
  // Click-Up/Rhythmic), shrunk to 14 only on phones that opt in via phoneArrows.
  const arrowFont = phoneArrows ? 14 : compact ? 20 : 28;
  const arrowLift = playLiftPx ?? (phoneArrows ? 18 : compact ? 26 : 34);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState<number | null>(null);

  const drawn = computeDrawnRect(containerSize.w, containerSize.h, aspect);

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== containerSize.w || height !== containerSize.h) {
      setContainerSize({ w: width, h: height });
    }
  }

  function handleLoad(e: ImageLoadEventData) {
    const w = e.source?.width;
    const h = e.source?.height;
    if (w && h) setAspect(w / h);
  }

  function handleRelease(e: GestureResponderEvent) {
    if (mode !== 'place' || !onTap) return;
    const { locationX, locationY } = e.nativeEvent;
    if (drawn.w === 0 || drawn.h === 0) return;
    const lx = locationX - drawn.ox;
    const ly = locationY - drawn.oy;
    if (lx < 0 || ly < 0 || lx > drawn.w || ly > drawn.h) return;
    const x = lx / drawn.w;
    const y = ly / drawn.h;

    const hitIdx = nearestMarkerIndex(markers, x, y, drawn.w, drawn.h);
    if (hitIdx != null && onRemoveMarker) {
      onRemoveMarker(hitIdx);
      return;
    }
    onTap({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
  }

  return (
    <View
      style={styles.container}
      onLayout={handleLayout}
      onStartShouldSetResponder={() => captureTaps && mode === 'place'}
      onResponderRelease={handleRelease}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        onLoad={handleLoad}
      />
      {markers.map((m) => {
        if (mode === 'play') {
          return (
            <ThemedText
              key={m.index}
              style={[
                styles.arrow,
                {
                  fontSize: arrowFont,
                  left: drawn.ox + m.x * drawn.w - arrowFont / 2,
                  top: Math.max(2, drawn.oy + m.y * drawn.h - arrowLift),
                  pointerEvents: 'none',
                },
              ]}>
              ▼
            </ThemedText>
          );
        }
        const isHi = highlightSet.has(m.index);
        return (
          <View
            key={m.index}
            style={[
              styles.marker,
              {
                width: mSize,
                height: mSize,
                borderRadius: mHalf,
                borderWidth: compact ? Borders.medium : Borders.thick,
                left: drawn.ox + m.x * drawn.w - mHalf,
                // Clamp so a mark near the top of a tightly-cropped passage
                // rides at the top edge instead of being clipped off-screen.
                top: Math.max(2, drawn.oy + m.y * drawn.h - mLift),
                pointerEvents: 'none',
              },
              isHi && styles.markerHighlight,
            ]}>
            <ThemedText style={[styles.markerText, { fontSize: mFont }]}>
              {m.index}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

function nearestMarkerIndex(
  markers: Marker[],
  x: number,
  y: number,
  w: number,
  h: number,
): number | null {
  let best: { idx: number; d2: number } | null = null;
  for (const m of markers) {
    const dx = (m.x - x) * w;
    const dy = (m.y - y) * h;
    const d2 = dx * dx + dy * dy;
    if (d2 < MARKER_HIT_RADIUS * MARKER_HIT_RADIUS) {
      if (best === null || d2 < best.d2) best = { idx: m.index, d2 };
    }
  }
  return best?.idx ?? null;
}

// Finger-sized tap tolerance in normalized image units. Guarantees the hit
// circle is at least `px` screen pixels on the unzoomed score (the dominant
// case on phones, where a fixed 0.04–0.05 fraction of a ~350 px-wide image
// is smaller than a fingertip), while keeping the old fraction as the floor
// on wide screens. The divide-by-scale keeps the on-screen radius constant
// while zoomed — same contract callers already relied on.
export function markerTapRadius(
  containerWidth: number,
  scale: number,
  minNorm = 0.04,
  px = 28,
): number {
  return Math.max(minNorm, px / Math.max(1, containerWidth)) / scale;
}

// Hit-test in normalized [0,1] image space, for callers that own the tap
// gesture (a ZoomableImage marking surface). `radius` is the catch distance
// in normalized image units — pass a value that shrinks with zoom (e.g.
// 0.04 / scale) so closely-spaced note marks stay individually tappable when
// the user pinches in. Returns the index of the nearest mark within range, or
// null to place a new one.
export function nearestMarkerNormalized(
  markers: Marker[],
  point: { x: number; y: number },
  radius: number,
): number | null {
  let best: { idx: number; d2: number } | null = null;
  const r2 = radius * radius;
  for (const m of markers) {
    const dx = m.x - point.x;
    const dy = m.y - point.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < r2 && (best === null || d2 < best.d2)) best = { idx: m.index, d2 };
  }
  return best?.idx ?? null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    // Transparent so the score sits on the practice screen's frame color
    // (SCORE_FRAME_BG) rather than its own grey matte — keeps the letterbox
    // bands consistent with the side margins on every screen.
    backgroundColor: 'transparent',
    position: 'relative',
  },
  marker: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: Radii.xl,
    borderWidth: Borders.thick,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Status.success,
    borderColor: '#145a32',
  },
  markerHighlight: { backgroundColor: '#e67e22', borderColor: '#a04000' },
  markerText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 12 },
  arrow: {
    position: 'absolute',
    color: Status.success,
    fontSize: 28,
    fontWeight: Type.weight.black,
  },
});
