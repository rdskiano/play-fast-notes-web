import { useMemo } from 'react';

import { AbcStaffView } from '@/components/AbcStaffView';
import {
  pitchName,
  type Clef,
  type KeySignature,
  type Pitch,
} from '@/lib/music/pitch';
import { buildEntrySequenceAbc } from '@/lib/notation/buildPitchAbc';

type Props = {
  pitches: Pitch[];
  keySignature: KeySignature;
  clef: Clef;
  width: number;
  height?: number;
  /** Slots per generated measure — sets the beam grouping of the staff. */
  grouping?: number;
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
  grouping = 4,
  onNoteTap,
  activeNoteIndex,
  preferredMeasuresPerLine = 4,
}: Props) {
  // The entry staff renders at slot resolution: notes as running sixteenths
  // beamed per grouping chunk, consecutive rest placeholders merged into one
  // printed rest at their combined value (so the 8th-rest palette key reads
  // back as one 8th rest). itemStartChars / elementIndexOfItem translate
  // between sequence indices and what abcjs actually draws.
  const { abc, itemStartChars, elementIndexOfItem } = useMemo(
    () => buildEntrySequenceAbc(pitches, keySignature, clef, grouping),
    [pitches, keySignature, clef, grouping],
  );

  const fallback =
    pitches.length === 0
      ? '(no notes yet)'
      : pitches.map((p) => (p.rest ? 'rest' : pitchName(p))).join('  ');

  return (
    <AbcStaffView
      abc={abc}
      width={width}
      height={height}
      wrap
      preferredMeasuresPerLine={preferredMeasuresPerLine}
      fallbackText={fallback}
      onNoteTap={onNoteTap}
      noteStartChars={onNoteTap ? itemStartChars : undefined}
      // The staff highlights by RENDERED element ordinal; a merged rest run
      // is one element, so translate the item index before passing down.
      activeNoteIndex={
        activeNoteIndex != null
          ? (elementIndexOfItem[activeNoteIndex] ?? null)
          : null
      }
    />
  );
}
