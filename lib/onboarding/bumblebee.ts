// ── Onboarding starter pack: Flight of the Bumblebee ────────────────────────
//
// The value-first onboarding (app/onboarding.tsx) lets a brand-new user feel
// the rhythm-variation strategy on a famous "fast notes" phrase BEFORE asking
// for any of their own music — the one strategy you can experience with empty
// hands. A new user has no library content, so the sample can't live in the
// database: it's baked here as a static pack the screen reads and plays via
// the existing metronome `playPitchRhythm` (the same engine the Rhythm Builder
// uses), so there is no new audio or notation code.
//
// SOURCE: the phrase was authored once by Ralph in the in-app Rhythm Builder
// (exercise e_1782264297711_jhj6hq, "In C", concert/C/treble, grouping 4). The
// numbered variations are GENERATED on the fly from the rhythm-pattern library
// by note count — they are not stored, so every transposition bucket below
// auto-generates the identical set once it has the transposed notes. Per-bucket
// work is therefore just: transpose the 17 notes + pick clef/key + place the
// octave so it reads cleanly.

import {
  CLEFS,
  INSTRUMENTS,
  KEY_SIGNATURES,
  makePitchForKey,
  midiToFrequency,
  concertToWritten,
  writtenToConcert,
  type Clef,
  type Instrument,
  type KeySignature,
  type Pitch,
} from '@/lib/music/pitch';
import {
  parseBeatDenominator,
  patternsByGrouping,
  TOKEN_QUARTER_FRACTIONS,
  type RhythmPattern,
  type RhythmToken,
} from '@/lib/strategies/rhythmPatterns';

/**
 * The opening Flight of the Bumblebee figure, as CONCERT MIDI (17 notes,
 * grouping of 4). Lifted verbatim from Ralph's authored exercise. Accidentals
 * are re-derived per bucket from the bucket's key, so only the pitch numbers
 * live here.
 */
export const BASE_CONCERT_MIDI: number[] = [
  76, 75, 74, 73, 72, 77, 76, 75, 76, 75, 74, 73, 72, 73, 74, 75, 76,
];

/** How many notes per pattern (matches the authored exercise's grouping). */
export const STARTER_GROUPING = 4 as const;

/**
 * Playback tempo for every variation, in beats-of-the-denominator per minute.
 * Ralph's call: first 8 variations, all at 160.
 */
export const STARTER_TEMPO = 160;

/**
 * The first 8 rhythm variations the engine produces for a 4-note grouping —
 * the set Ralph chose to show. `patternsByGrouping` returns them in catalog
 * order; "first 8" is literally the first 8 of that list (all 3/8).
 */
export const VARIATION_PATTERNS: RhythmPattern[] = patternsByGrouping(
  STARTER_GROUPING,
).slice(0, 8);

/**
 * One bucket per written-transposition + clef combination. The written
 * notation differs per bucket (that's why each looks different on the page);
 * the audio is then correct for any instrument in the bucket because playback
 * transposes back to concert.
 *
 * `octaveShift` (in semitones, multiples of 12) places the run where it reads
 * cleanly on that clef — raw transposition can land it in a ledger-line mess.
 * These are sensible starting values; eyeball each against Ralph's hand-made
 * reference images and nudge. They also shift the SOUND, which is correct: a
 * cello/tuba genuinely sounds low, an alto sax in its own octave, etc.
 */
export type BumblebeeBucket = {
  id: string;
  /** Short human label for the written version. */
  label: string;
  /** INSTRUMENTS id — drives the playback transposition (written → concert). */
  instrumentId: string;
  /** KEY_SIGNATURES id — the written key for this transposition. */
  keyId: string;
  /** CLEFS id. */
  clefId: string;
  /** Octave placement for readability (and sounding octave), in semitones. */
  octaveShift: number;
};

export const BUMBLEBEE_BUCKETS: BumblebeeBucket[] = [
  // C concert, treble — flute / oboe / violin. The authored original.
  { id: 'c_treble', label: 'C treble', instrumentId: 'concert', keyId: 'C', clefId: 'treble', octaveShift: 0 },
  // B♭ — clarinet / trumpet. Written up a major 2nd → D major (2♯).
  { id: 'bb_treble', label: 'B♭ treble', instrumentId: 'bb_clarinet', keyId: 'D', clefId: 'treble', octaveShift: 0 },
  // E♭ — alto sax. Written up a major 6th → A major (3♯); drop an octave so it
  // doesn't sit way above the staff.
  { id: 'eb_treble', label: 'E♭ treble', instrumentId: 'eb_alto_sax', keyId: 'A', clefId: 'treble', octaveShift: -12 },
  // F — French horn. Written up a perfect 5th → G major (1♯); drop an octave.
  { id: 'f_treble', label: 'F treble', instrumentId: 'f_horn', keyId: 'G', clefId: 'treble', octaveShift: -12 },
  // Bass clef — cello / bassoon / trombone / tuba. Concert pitch, two octaves
  // down so it sits inside the bass staff.
  { id: 'c_bass', label: 'Bass clef', instrumentId: 'concert', keyId: 'C', clefId: 'bass', octaveShift: -24 },
  // Alto clef — viola. Concert pitch, one octave down to centre on the staff.
  { id: 'c_alto', label: 'Alto clef', instrumentId: 'concert', keyId: 'C', clefId: 'alto', octaveShift: -12 },
];

/**
 * The instrument picker shown on the welcome screen. Only instruments we have
 * an authored bucket for are offered (Ralph's call — everything shown is
 * exactly correct). Each maps to its written-transposition bucket. `group`
 * drives the section headers.
 */
export type OnboardingInstrument = {
  name: string;
  group: string;
  bucketId: string;
  /** General-MIDI soundfont instrument name for sampled playback (smplr). */
  gm: string;
  /**
   * Extra octaves (in semitones) applied to PLAYBACK only — not the notation.
   * Needed when an instrument shares a bucket's written part but sounds in a
   * different octave: tenor sax sounds an octave below the B♭ clarinet/trumpet
   * it's grouped with, and bari sax an octave below the alto sax.
   */
  soundOctaveShift?: number;
};

export const ONBOARDING_INSTRUMENTS: OnboardingInstrument[] = [
  { group: 'Concert pitch', name: 'Flute', bucketId: 'c_treble', gm: 'flute' },
  { group: 'Concert pitch', name: 'Oboe', bucketId: 'c_treble', gm: 'oboe' },
  { group: 'Concert pitch', name: 'Violin', bucketId: 'c_treble', gm: 'violin' },
  { group: 'B♭ instruments', name: 'Clarinet', bucketId: 'bb_treble', gm: 'clarinet' },
  { group: 'B♭ instruments', name: 'Trumpet', bucketId: 'bb_treble', gm: 'trumpet' },
  { group: 'B♭ instruments', name: 'Tenor saxophone', bucketId: 'bb_treble', gm: 'tenor_sax', soundOctaveShift: -12 },
  { group: 'E♭ instruments', name: 'Alto saxophone', bucketId: 'eb_treble', gm: 'alto_sax' },
  { group: 'E♭ instruments', name: 'Baritone saxophone', bucketId: 'eb_treble', gm: 'baritone_sax', soundOctaveShift: -12 },
  { group: 'F instruments', name: 'French horn', bucketId: 'f_treble', gm: 'french_horn' },
  { group: 'Bass clef', name: 'Cello', bucketId: 'c_bass', gm: 'cello' },
  { group: 'Bass clef', name: 'Bassoon', bucketId: 'c_bass', gm: 'bassoon' },
  { group: 'Bass clef', name: 'Trombone', bucketId: 'c_bass', gm: 'trombone' },
  { group: 'Bass clef', name: 'Tuba', bucketId: 'c_bass', gm: 'tuba' },
  { group: 'Alto clef', name: 'Viola', bucketId: 'c_alto', gm: 'viola' },
];

// ── Resolvers ────────────────────────────────────────────────────────────────

function instrumentById(id: string): Instrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

export function keySignatureFor(bucket: BumblebeeBucket): KeySignature {
  return KEY_SIGNATURES.find((k) => k.id === bucket.keyId) ?? KEY_SIGNATURES[7];
}

export function clefFor(bucket: BumblebeeBucket): Clef {
  return CLEFS.find((c) => c.id === bucket.clefId) ?? CLEFS[0];
}

export function bucketById(id: string): BumblebeeBucket {
  return BUMBLEBEE_BUCKETS.find((b) => b.id === id) ?? BUMBLEBEE_BUCKETS[0];
}

export function bucketForInstrument(name: string): BumblebeeBucket {
  const entry = ONBOARDING_INSTRUMENTS.find((i) => i.name === name);
  return bucketById(entry?.bucketId ?? 'c_treble');
}

/**
 * A representative instrument NAME for a bucket — the first picker entry that
 * maps to it (e.g. c_treble → Flute, c_bass → Cello). Used to backfill the
 * onboarding instrument for users who onboarded before we started saving it:
 * the seeded Bumblebee piece records the bucket, so we recover their clef even
 * though the exact instrument sound is gone.
 */
export function representativeInstrumentForBucket(bucketId: string): string {
  return ONBOARDING_INSTRUMENTS.find((i) => i.bucketId === bucketId)?.name ?? 'Flute';
}

/** The General-MIDI soundfont voice for an onboarding instrument choice. */
export function gmForInstrument(name: string): string {
  return ONBOARDING_INSTRUMENTS.find((i) => i.name === name)?.gm ?? 'flute';
}

/** Playback-only octave shift (semitones) for an instrument; 0 for most. */
export function soundShiftForInstrument(name: string): number {
  return ONBOARDING_INSTRUMENTS.find((i) => i.name === name)?.soundOctaveShift ?? 0;
}

/**
 * The phrase as WRITTEN pitches for a bucket: transpose concert → written for
 * the instrument, apply the bucket's octave placement, and spell black keys as
 * sharps (every onboarding key is a sharp key, matching the reference images).
 */
export function bucketWrittenPitches(bucket: BumblebeeBucket): Pitch[] {
  const inst = instrumentById(bucket.instrumentId);
  return BASE_CONCERT_MIDI.map((concert) => {
    const written = concertToWritten(concert, inst) + bucket.octaveShift;
    return makePitchForKey(written, true);
  });
}

/** Concert-sounding frequencies for the straight run (the "hear it" hook). */
export function bucketRunFreqs(bucket: BumblebeeBucket): number[] {
  const inst = instrumentById(bucket.instrumentId);
  return bucketWrittenPitches(bucket).map((p) =>
    midiToFrequency(writtenToConcert(p.midi, inst)),
  );
}

/**
 * Build the parallel (freqs, tokens) lists for one variation pattern — the
 * exact shape `metronome.playPitchRhythm` wants. Mirrors the Rhythm Builder's
 * `playPattern`: cycle the pattern's rhythm tokens over the pitches by grouping.
 */
export function bucketPatternPlayback(
  bucket: BumblebeeBucket,
  pattern: RhythmPattern,
): { freqs: number[]; tokens: RhythmToken[]; beatDenom: number } {
  const inst = instrumentById(bucket.instrumentId);
  const written = bucketWrittenPitches(bucket);
  const freqs: number[] = [];
  const tokens: RhythmToken[] = [];
  const G = pattern.grouping;
  let idx = 0;
  while (idx < written.length) {
    const end = Math.min(idx + G, written.length);
    for (let k = 0; k < end - idx; k++) {
      freqs.push(midiToFrequency(writtenToConcert(written[idx + k].midi, inst)));
      tokens.push(pattern.notes[k]);
    }
    idx = end;
  }
  return { freqs, tokens, beatDenom: parseBeatDenominator(pattern.timeSig) };
}

// ── Sampled-playback schedules (smplr) ───────────────────────────────────────
// The sample player wants concert-sounding MIDI note numbers plus a start
// offset + duration (seconds). These mirror the oscillator helpers above but
// emit a note schedule instead of a frequency list.

export type MelodyNote = { midi: number; time: number; duration: number };

/** Concert-sounding MIDI for the phrase as a bucket would play it. */
export function bucketConcertMidi(bucket: BumblebeeBucket): number[] {
  const inst = instrumentById(bucket.instrumentId);
  return bucketWrittenPitches(bucket).map((p) => writtenToConcert(p.midi, inst));
}

/** The straight run, evenly spaced — the "hear it at speed" hook. */
export function bucketRunSchedule(
  bucket: BumblebeeBucket,
  secondsPerNote = 0.13,
  soundShift = 0,
): MelodyNote[] {
  return bucketConcertMidi(bucket).map((midi, i) => ({
    midi: midi + soundShift,
    time: i * secondsPerNote,
    duration: secondsPerNote * 0.95,
  }));
}

/** One variation, with each note's onset + length from the rhythm pattern. */
export function bucketPatternSchedule(
  bucket: BumblebeeBucket,
  pattern: RhythmPattern,
  bpm: number,
  soundShift = 0,
): MelodyNote[] {
  const inst = instrumentById(bucket.instrumentId);
  const written = bucketWrittenPitches(bucket);
  const beatDenom = parseBeatDenominator(pattern.timeSig);
  const secondsPerQuarter = (60 / bpm) * (beatDenom / 4);
  const out: MelodyNote[] = [];
  const G = pattern.grouping;
  let t = 0;
  let idx = 0;
  while (idx < written.length) {
    const end = Math.min(idx + G, written.length);
    for (let k = 0; k < end - idx; k++) {
      const dur = TOKEN_QUARTER_FRACTIONS[pattern.notes[k]] * secondsPerQuarter;
      out.push({
        midi: writtenToConcert(written[idx + k].midi, inst) + soundShift,
        time: t,
        duration: dur * 0.95,
      });
      t += dur;
    }
    idx = end;
  }
  return out;
}
