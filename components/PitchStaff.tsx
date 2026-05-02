import { useMemo } from 'react';

import { AbcStaffView } from '@/components/AbcStaffView';
import {
  pitchName,
  type Clef,
  type KeySignature,
  type Pitch,
} from '@/lib/music/pitch';
import { buildPitchAbc } from '@/lib/notation/buildPitchAbc';

type Props = {
  pitches: Pitch[];
  keySignature: KeySignature;
  clef: Clef;
  width: number;
  height?: number;
  onNoteTap?: (index: number) => void;
  activeNoteIndex?: number | null;
  /** How many measures to fit per line before wrapping. Defaults to 4. */
  preferredMeasuresPerLine?: number;
};

export function PitchStaff({
  pitches,
  keySignature,
  clef,
  width,
  height = 120,
  onNoteTap,
  activeNoteIndex,
  preferredMeasuresPerLine = 4,
}: Props) {
  const abc = useMemo(
    () => buildPitchAbc(pitches, keySignature, clef),
    [pitches, keySignature, clef],
  );

  const fallback =
    pitches.length === 0 ? '(no notes yet)' : pitches.map(pitchName).join('  ');

  return (
    <AbcStaffView
      abc={abc}
      width={width}
      height={height}
      wrap
      preferredMeasuresPerLine={preferredMeasuresPerLine}
      fallbackText={fallback}
      onNoteTap={onNoteTap}
      activeNoteIndex={activeNoteIndex}
    />
  );
}
