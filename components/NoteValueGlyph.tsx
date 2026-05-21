// Small music-notation glyphs for the metronome's subdivision control —
// note heads, stems and beams drawn from plain Views. No WebView, no font
// dependency, so they render crisply and instantly at this size.

import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export type NoteValue =
  | 'quarter'
  | 'dottedQuarter'
  | 'eighth'
  | 'eighths2'
  | 'eighths3'
  | 'triplet'
  | 'sixteenths2'
  | 'sixteenths4';

type Spec = {
  notes: number;
  beams: number;
  dotted: boolean;
  triplet: boolean;
  flag?: boolean;
};

const SPECS: Record<NoteValue, Spec> = {
  quarter: { notes: 1, beams: 0, dotted: false, triplet: false },
  dottedQuarter: { notes: 1, beams: 0, dotted: true, triplet: false },
  eighth: { notes: 1, beams: 0, dotted: false, triplet: false, flag: true },
  eighths2: { notes: 2, beams: 1, dotted: false, triplet: false },
  eighths3: { notes: 3, beams: 1, dotted: false, triplet: false },
  triplet: { notes: 3, beams: 1, dotted: false, triplet: true },
  sixteenths2: { notes: 2, beams: 2, dotted: false, triplet: false },
  sixteenths4: { notes: 4, beams: 2, dotted: false, triplet: false },
};

const HEAD_W = 8;
const HEAD_H = 6;
const STEM_W = 2;
const STEM_H = 17;
const STEP = 11; // horizontal spacing between note heads
const BEAM_H = 3;
const BEAM_GAP = 5; // vertical gap between the two sixteenth beams
const HEIGHT = 30;

export function NoteValueGlyph({
  value,
  color,
}: {
  value: NoteValue;
  color: string;
}) {
  const { notes, beams, dotted, triplet, flag } = SPECS[value];
  const width =
    (notes - 1) * STEP + HEAD_W + (dotted ? 7 : 0) + (flag ? 8 : 0);

  const stemX = (i: number) => i * STEP + HEAD_W - STEM_W;
  const stemTop = HEAD_H / 2 + STEM_H; // measured from the box bottom
  const beamLeft = stemX(0);
  const beamWidth = stemX(notes - 1) + STEM_W - beamLeft;

  return (
    <View style={{ width, height: HEIGHT }}>
      {Array.from({ length: notes }).map((_, i) => (
        <Fragment key={i}>
          <View
            style={[
              styles.head,
              { backgroundColor: color, left: i * STEP, bottom: 0 },
            ]}
          />
          <View
            style={[
              styles.stem,
              { backgroundColor: color, left: stemX(i), bottom: HEAD_H / 2 },
            ]}
          />
        </Fragment>
      ))}

      {dotted && (
        <View
          style={[
            styles.dot,
            { backgroundColor: color, left: HEAD_W + 3, bottom: HEAD_H / 2 - 1 },
          ]}
        />
      )}

      {flag && (
        <View
          style={[
            styles.flag,
            { backgroundColor: color, left: stemX(0), bottom: stemTop - 9 },
          ]}
        />
      )}

      {beams >= 1 && (
        <View
          style={[
            styles.beam,
            {
              backgroundColor: color,
              left: beamLeft,
              width: beamWidth,
              bottom: stemTop - BEAM_H,
            },
          ]}
        />
      )}
      {beams >= 2 && (
        <View
          style={[
            styles.beam,
            {
              backgroundColor: color,
              left: beamLeft,
              width: beamWidth,
              bottom: stemTop - BEAM_H - BEAM_GAP,
            },
          ]}
        />
      )}

      {triplet && (
        <ThemedText
          style={[
            styles.three,
            { color, left: beamLeft, width: beamWidth },
          ]}>
          3
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    position: 'absolute',
    width: HEAD_W,
    height: HEAD_H,
    borderRadius: HEAD_H / 2,
    transform: [{ rotate: '-20deg' }],
  },
  stem: { position: 'absolute', width: STEM_W, height: STEM_H },
  dot: { position: 'absolute', width: 3.5, height: 3.5, borderRadius: 2 },
  beam: { position: 'absolute', height: BEAM_H, borderRadius: 1 },
  flag: {
    position: 'absolute',
    width: 10,
    height: 3.4,
    borderRadius: 1.7,
    transform: [{ rotate: '36deg' }],
  },
  three: {
    position: 'absolute',
    top: 0,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '800',
  },
});
