// The Macro-Chaining run screen's score area (2026-09-13 redesign, built from
// the mock-up Ralph approved on his real Polovtsian Dances passages).
//
// Two switchable views, both driven by lib/strategies/macroSlices.ts:
//
//  - 'overlay' (default): the passage photo stays WHOLE so the musical line
//    stays readable. Isolate steps veil everything except the drilled chunk
//    (dimmed base photo + full-contrast windows outlined in the strategy
//    color). Chain steps float the rests over the score: a single-line
//    passage gets a rest badge above every chunk boundary; a multi-line
//    passage gets ONE rest banner above the photo plus a small ▼ marker at
//    each boundary, so nothing covers notes (Ralph's call — per-boundary
//    badges buried the music on a 4-line passage).
//
//  - 'sliced': the photo is physically cut at the beat marks. Isolate steps
//    show a dimmed minimap plus the chunk blown up; chain steps lay the chunk
//    strips in a wrapping row with quarter-rest slots between them. A chunk
//    that crosses a line break renders as one seamless strip (its two photo
//    pieces butted together, no separator — Ralph's call).
//
// Cross-platform on purpose: plain Views + expo-image only, no SVG, so the
// exact same file serves web and iPad. Phone sizes are scaled down and the
// chain strips scroll (Ralph: "we may have to limit the size on a phone").

import { Image } from 'expo-image';
import { useMemo, useState, type ReactNode } from 'react';
import {
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ZoomableImage } from '@/components/ZoomableImage';
import { Palette } from '@/constants/palette';
import { Type } from '@/constants/tokens';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import type { Marker } from '@/lib/db/repos/passages';
import { useStaffSystems } from '@/lib/image/useStaffSystems';
import { computeDrawnRect } from '@/lib/layout/containFit';
import type { MacroStep } from '@/lib/strategies/macroChain';
import {
  type ChunkSlice,
  type ScoreGeometry,
  chainBoundaries,
  chunkSlices,
  computeScoreGeometry,
  isolateRange,
  overlayUsesBadges,
} from '@/lib/strategies/macroSlices';

const REST_Q = require('@/assets/images/rests/rest-q.png');

type Props = {
  uri: string;
  /** The passage photo's natural aspect ratio (w/h); null until known. */
  aspect: number | null;
  /** The stored beat marks (any order; geometry sorts by index). */
  marks: Marker[];
  step: MacroStep | undefined;
  view: 'overlay' | 'sliced';
  /** Macro-Chaining's strategy color (plum by default, user-overridable). */
  accent: string;
  isPhone: boolean;
  /** Zoom memory key for the overlay score (ZoomableImage persistKey). */
  zoomPersistKey?: string;
  /** Pencil canvas — rendered over the whole-score photo in overlay mode. */
  annotationOverlay?: ReactNode;
};

export function MacroScoreView({
  uri,
  aspect,
  marks,
  step,
  view,
  accent,
  isPhone,
  zoomPersistKey,
  annotationOverlay,
}: Props) {
  const isTouch = useIsTouchDevice();
  const systems = useStaffSystems(uri);
  const geom = useMemo(() => computeScoreGeometry(marks, systems), [marks, systems]);
  const soft = accent + '20';

  // Whole-passage finale (or no step yet): the plain photo, both views.
  const wholePassage = !step || (step.kind === 'isolate' && step.chunkCount === 1);

  if (wholePassage || view === 'overlay') {
    const overlay = (
      <OverlayScore
        uri={uri}
        geom={geom}
        step={wholePassage ? undefined : step}
        accent={accent}
        soft={soft}
        isPhone={isPhone}
        annotationOverlay={annotationOverlay}
      />
    );
    const banner =
      !wholePassage &&
      step!.kind === 'chain' &&
      !overlayUsesBadges(geom, step!.chunkSize) ? (
        <RestBanner restBeats={step!.restBeats} accent={accent} soft={soft} isPhone={isPhone} />
      ) : null;
    return (
      <View style={styles.column}>
        {banner}
        <View style={{ flex: 1, width: '100%' }}>
          {isTouch ? (
            <ZoomableImage style={StyleSheet.absoluteFill} persistKey={zoomPersistKey}>
              {overlay}
            </ZoomableImage>
          ) : (
            overlay
          )}
        </View>
      </View>
    );
  }

  // ── sliced view ─────────────────────────────────────────────
  if (step.kind === 'isolate') {
    const { a, b } = isolateRange(geom, step.chunkSize, step.chunkIndex);
    const slices = chunkSlices(geom, a, b);
    return (
      <View style={[styles.column, { gap: isPhone ? 10 : 18, justifyContent: 'center' }]}>
        <MiniMap uri={uri} aspect={aspect} slices={slices} geom={geom} accent={accent} isPhone={isPhone} />
        <View style={styles.stripRowCenter}>
          <StripCard
            uri={uri}
            aspect={aspect}
            slices={slices}
            geom={geom}
            height={isPhone ? 84 : 116}
            caption={beatsCaption(a, b)}
          />
        </View>
      </View>
    );
  }

  // sliced chain: strips + rest slots, wrapping; scrolls when tall.
  const chunks: { a: number; b: number }[] = [];
  for (let a = 0; a < geom.beatCount; a += step.chunkSize) {
    chunks.push({ a, b: Math.min(a + step.chunkSize, geom.beatCount) });
  }
  const stripH = isPhone ? 44 : step.chunkSize >= 4 ? 72 : 58;
  return (
    <ScrollView
      style={{ flex: 1, width: '100%' }}
      contentContainerStyle={styles.chainScroll}>
      <View style={[styles.chainRow, { rowGap: isPhone ? 26 : 34 }]}>
        {chunks.map(({ a, b }, i) => (
          <View key={a} style={styles.chunkPair}>
            <StripCard
              uri={uri}
              aspect={aspect}
              slices={chunkSlices(geom, a, b)}
              geom={geom}
              height={stripH}
              caption={beatsCaption(a, b)}
            />
            {i < chunks.length - 1 && (
              <RestSlot restBeats={step.restBeats} accent={accent} soft={soft} isPhone={isPhone} />
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function beatsCaption(a: number, b: number): string {
  return b - a === 1 ? `beat ${a + 1}` : `beats ${a + 1}–${b}`;
}

// ── overlay: whole photo + veil windows / badges / boundary marks ──
function OverlayScore({
  uri,
  geom,
  step,
  accent,
  soft,
  isPhone,
  annotationOverlay,
}: {
  uri: string;
  geom: ScoreGeometry;
  step: MacroStep | undefined;
  accent: string;
  soft: string;
  isPhone: boolean;
  annotationOverlay?: ReactNode;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const drawn = computeDrawnRect(box.w, box.h, imgAspect);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== box.w || height !== box.h) setBox({ w: width, h: height });
  }

  const isolating = step?.kind === 'isolate';
  const slices =
    step?.kind === 'isolate'
      ? (() => {
          const { a, b } = isolateRange(geom, step.chunkSize, step.chunkIndex);
          return chunkSlices(geom, a, b);
        })()
      : [];
  const boundaries = step?.kind === 'chain' ? chainBoundaries(geom, step.chunkSize) : [];
  const useBadges = step?.kind === 'chain' && overlayUsesBadges(geom, step.chunkSize);

  return (
    <View style={styles.overlayBox} onLayout={onLayout}>
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, { opacity: isolating ? 0.32 : 1 }]}
        contentFit="contain"
        onLoad={(e) => {
          const w = e.source?.width;
          const h = e.source?.height;
          if (w && h) setImgAspect(w / h);
        }}
      />
      {drawn.w > 0 &&
        isolating &&
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
      {drawn.w > 0 &&
        !useBadges &&
        boundaries.map((m) => (
          <View
            key={m.index}
            style={[
              styles.tick,
              {
                borderTopColor: accent,
                left: drawn.ox + m.x * drawn.w - 7,
                top: Math.max(0, drawn.oy + m.y * drawn.h - 12),
              },
            ]}
          />
        ))}
      {drawn.w > 0 &&
        useBadges &&
        boundaries.map((m) => (
          <RestBadge
            key={m.index}
            restBeats={(step as Extract<MacroStep, { kind: 'chain' }>).restBeats}
            accent={accent}
            soft={soft}
            isPhone={isPhone}
            x={drawn.ox + m.x * drawn.w}
            y={drawn.oy + m.y * drawn.h}
          />
        ))}
      {annotationOverlay}
    </View>
  );
}

// A rest badge anchored above one chunk boundary (single-line passages).
function RestBadge({
  restBeats,
  accent,
  soft,
  isPhone,
  x,
  y,
}: {
  restBeats: number;
  accent: string;
  soft: string;
  isPhone: boolean;
  x: number;
  y: number;
}) {
  const gw = isPhone ? 10 : 13;
  const gh = isPhone ? 20 : 26;
  const n = Math.max(1, restBeats);
  const width = restBeats === 0 ? 34 : 18 + n * gw + (n - 1) * 3;
  const height = gh + (isPhone ? 12 : 14) + 8;
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: restBeats === 0 ? '#FFFFFFD9' : soft,
          borderColor: accent,
          borderStyle: restBeats === 0 ? 'dotted' : 'dashed',
          left: x - width / 2,
          top: Math.max(2, y - height - 9),
          width,
        },
      ]}>
      <RestGlyphs restBeats={restBeats} accent={accent} glyphW={gw} glyphH={gh} />
      <ThemedText style={[styles.badgeLbl, { color: accent }]}>
        {restBeats === 0 ? 'breath' : restBeats === 1 ? '1 beat' : `${restBeats} beats`}
      </ThemedText>
      <View style={[styles.badgeTail, { borderTopColor: accent }]} />
    </View>
  );
}

// One banner above a multi-line score: the rests + where they go.
function RestBanner({
  restBeats,
  accent,
  soft,
  isPhone,
}: {
  restBeats: number;
  accent: string;
  soft: string;
  isPhone: boolean;
}) {
  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: restBeats === 0 ? 'transparent' : soft,
          borderColor: accent,
          borderStyle: restBeats === 0 ? 'dotted' : 'dashed',
          paddingVertical: isPhone ? 4 : 7,
        },
      ]}>
      <RestGlyphs
        restBeats={restBeats}
        accent={accent}
        glyphW={isPhone ? 11 : 14}
        glyphH={isPhone ? 22 : 30}
      />
      <ThemedText
        style={{
          color: accent,
          fontWeight: Type.weight.heavy,
          fontSize: isPhone ? 12 : 14,
        }}>
        {restBeats === 0
          ? 'Just a breath at every ▼'
          : `Rest ${restBeats === 1 ? '1 beat' : `${restBeats} beats`} at every ▼`}
      </ThemedText>
    </View>
  );
}

// The rest symbols themselves: quarter-rest PNGs (unicode rests render as
// tofu on some browsers — the Rhythm Builder lesson), breath = comma text.
function RestGlyphs({
  restBeats,
  accent,
  glyphW,
  glyphH,
}: {
  restBeats: number;
  accent: string;
  glyphW: number;
  glyphH: number;
}) {
  if (restBeats === 0) {
    return (
      <ThemedText
        style={{
          color: accent,
          fontWeight: Type.weight.black,
          fontSize: glyphH,
          lineHeight: glyphH + 2,
          includeFontPadding: false,
        }}>
        ’
      </ThemedText>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: restBeats }).map((_, i) => (
        <Image
          key={i}
          source={REST_Q}
          style={{ width: glyphW, height: glyphH, tintColor: accent }}
          contentFit="contain"
        />
      ))}
    </View>
  );
}

// A rest slot BETWEEN two chunk strips (sliced chain view).
function RestSlot({
  restBeats,
  accent,
  soft,
  isPhone,
}: {
  restBeats: number;
  accent: string;
  soft: string;
  isPhone: boolean;
}) {
  return (
    <View
      style={[
        styles.slot,
        {
          backgroundColor: restBeats === 0 ? 'transparent' : soft,
          borderColor: accent,
          borderStyle: restBeats === 0 ? 'dotted' : 'dashed',
        },
      ]}>
      <RestGlyphs
        restBeats={restBeats}
        accent={accent}
        glyphW={isPhone ? 10 : 13}
        glyphH={isPhone ? 22 : 30}
      />
      <ThemedText style={[styles.badgeLbl, { color: accent }]}>
        {restBeats === 0 ? 'breath' : restBeats === 1 ? '1 beat' : `${restBeats} beats`}
      </ThemedText>
    </View>
  );
}

// One chunk as a single physical strip: its photo slices butted together
// seamlessly (a line-crossing chunk reads like a hyphenated word rejoined).
function StripCard({
  uri,
  aspect,
  slices,
  geom,
  height,
  caption,
}: {
  uri: string;
  aspect: number | null;
  slices: ChunkSlice[];
  geom: ScoreGeometry;
  height: number;
  caption?: string;
}) {
  if (!aspect) return null;
  return (
    <View style={styles.stripWrap}>
      <View style={styles.stripCard}>
        {slices.map((sl, i) => {
          const band = geom.bands[sl.row];
          const fb = Math.max(0.02, band.bot - band.top);
          const imgH = height / fb;
          const imgW = imgH * aspect;
          return (
            <View
              key={i}
              style={{ width: (sl.x1 - sl.x0) * imgW, height, overflow: 'hidden' }}>
              <Image
                source={{ uri }}
                contentFit="fill"
                style={{
                  position: 'absolute',
                  width: imgW,
                  height: imgH,
                  left: -(sl.x0 * imgW),
                  top: -(band.top * imgH),
                }}
              />
            </View>
          );
        })}
      </View>
      {caption != null && <ThemedText style={styles.stripCaption}>{caption}</ThemedText>}
    </View>
  );
}

// Sliced-isolate context map: the whole photo dimmed, chunk outlined.
function MiniMap({
  uri,
  aspect,
  slices,
  geom,
  accent,
  isPhone,
}: {
  uri: string;
  aspect: number | null;
  slices: ChunkSlice[];
  geom: ScoreGeometry;
  accent: string;
  isPhone: boolean;
}) {
  const [w, setW] = useState(0);
  if (!aspect) return null;
  const maxH = isPhone ? 96 : 170;
  const boxW = w > 0 ? Math.min(w, maxH * aspect) : 0;
  const boxH = boxW / aspect;
  return (
    <View
      style={{ width: '100%', alignItems: 'center' }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {boxW > 0 && (
        <View style={{ width: boxW, height: boxH }}>
          <Image
            source={{ uri }}
            style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
            contentFit="fill"
          />
          {slices.map((sl, i) => {
            const band = geom.bands[sl.row];
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: sl.x0 * boxW,
                  top: band.top * boxH,
                  width: (sl.x1 - sl.x0) * boxW,
                  height: (band.bot - band.top) * boxH,
                  borderWidth: 2,
                  borderColor: accent,
                  borderRadius: 5,
                  backgroundColor: accent + '18',
                }}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, width: '100%', alignItems: 'center', gap: 8 },
  overlayBox: { flex: 1, width: '100%', position: 'relative' },
  tick: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingTop: 3,
    paddingBottom: 2,
    paddingHorizontal: 4,
  },
  badgeLbl: {
    fontSize: 9,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  badgeTail: {
    position: 'absolute',
    bottom: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  slot: {
    alignItems: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
  },
  chainScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  chainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 10,
  },
  chunkPair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stripRowCenter: { flexDirection: 'row', justifyContent: 'center' },
  stripWrap: { alignItems: 'flex-start' },
  stripCard: {
    flexDirection: 'row',
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.borderStrong,
    borderRadius: 3,
    padding: 4,
    shadowColor: '#15191A',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stripCaption: {
    fontSize: 10,
    fontWeight: Type.weight.bold,
    letterSpacing: 0.4,
    color: Palette.textMuted,
    marginTop: 3,
    marginLeft: 2,
  },
});
