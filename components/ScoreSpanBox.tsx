// ICU "Boxed" view (2026-09-13, Ralph-queued after loving Macro-Chaining's
// chunk boxes): the whole passage photo stays on screen, lightly faded, and
// the ACTIVE SPAN — the stretch of units being played this step — sits in
// full contrast inside green boxes. A span crossing a line break gets one
// box per line (same slicing geometry as Macro-Chaining); as the climb adds
// units the boxes visibly GROW, which is the "something changed" cue.
//
// The fade is deliberately LIGHTER than Macro-Chaining's drilling veil
// (Ralph's call in the design discussion): ICU players glance ahead at
// what's coming, so the music behind must stay clearly readable.
//
// Pure RN Views + expo-image, no SVG — one file serves web and iPad.

import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import type { Marker } from '@/lib/db/repos/passages';
import { useStaffSystems } from '@/lib/image/useStaffSystems';
import { computeDrawnRect } from '@/lib/layout/containFit';
import { BOX_PAD_LEFT, chunkSlices, computeScoreGeometry } from '@/lib/strategies/macroSlices';

type Props = {
  uri: string;
  /** ALL unit marks (any order; geometry sorts by index). */
  marks: Marker[];
  /** Active span as marker `.index` values (1-based), start and end. */
  startIndex: number;
  endIndex: number;
  /** Box color — ICU's green, matching the arrows it replaces. */
  accent: string;
  /** Base-photo opacity outside the boxes. Lighter than Macro's 0.32. */
  dim?: number;
};

export function ScoreSpanBox({ uri, marks, startIndex, endIndex, accent, dim = 0.55 }: Props) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState<number | null>(null);
  // The photo's lines of music keep each box to the line its marks are on.
  const systems = useStaffSystems(uri);
  const geom = useMemo(() => computeScoreGeometry(marks, systems), [marks, systems]);

  const slices = useMemo(() => {
    const last = geom.marks.length - 1;
    const a = Math.max(0, Math.min(last, startIndex - 1));
    const b = Math.max(a, Math.min(last, endIndex - 1));
    if (last < 1 || b <= a) return [];
    // Tight left edge: these boxes are highlight rings over the intact
    // score (nothing is cut off), so they hug the span instead of carrying
    // Macro's cut-safety margin. Ralph's on-iPad call, 2026-09-13.
    return chunkSlices(geom, a, b, { padLeft: BOX_PAD_LEFT });
  }, [geom, startIndex, endIndex]);

  const drawn = computeDrawnRect(box.w, box.h, aspect);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== box.w || height !== box.h) setBox({ w: width, h: height });
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, { opacity: slices.length > 0 ? dim : 1 }]}
        contentFit="contain"
        onLoad={(e) => {
          const w = e.source?.width;
          const h = e.source?.height;
          if (w && h) setAspect(w / h);
        }}
      />
      {drawn.w > 0 &&
        slices.map((sl, i) => {
          const band = geom.bands[sl.row];
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: drawn.ox + sl.x0 * drawn.w,
                top: drawn.oy + band.top * drawn.h,
                width: (sl.x1 - sl.x0) * drawn.w,
                height: (band.bot - band.top) * drawn.h,
                borderWidth: 2.5,
                borderColor: accent,
                borderRadius: 8,
                overflow: 'hidden',
              }}>
              <Image
                source={{ uri }}
                contentFit="fill"
                style={{
                  position: 'absolute',
                  width: drawn.w,
                  height: drawn.h,
                  left: -(sl.x0 * drawn.w),
                  top: -(band.top * drawn.h),
                }}
              />
            </View>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    position: 'relative',
    backgroundColor: 'transparent',
  },
});
