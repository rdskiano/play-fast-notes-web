// ── Pitch model ─────────────────────────────────────────────────────────────

/**
 * A pitch is a MIDI note plus a preferred enharmonic spelling. Storage
 * uses *written* pitch for the current instrument; playback converts to
 * concert pitch via the instrument's transposition interval.
 */
export type Accidental =
  | 'natural'
  | 'sharp'
  | 'flat'
  | 'doubleSharp'
  | 'doubleFlat';

export type Pitch = {
  /** MIDI note number (A4 = 69). Always the written pitch. */
  midi: number;
  /** Preferred accidental spelling. Some values are only legal on certain letters. */
  accidental: Accidental;
  /**
   * If true, notation renderers should draw this note's accidental even
   * when the key signature or a prior in-bar accidental would otherwise
   * make it implicit. Used for courtesy / cautionary accidentals.
   */
  courtesy?: boolean;
};

// ── Note name conversion ────────────────────────────────────────────────────

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
type Letter = (typeof LETTERS)[number];

/** Base chromatic offset of each letter within an octave (C=0, D=2, E=4, F=5, G=7, A=9, B=11). */
const LETTER_OFFSET: Record<Letter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const ACCIDENTAL_OFFSET: Record<Accidental, number> = {
  natural: 0,
  sharp: 1,
  flat: -1,
  doubleSharp: 2,
  doubleFlat: -2,
};

const ACCIDENTAL_SYMBOL: Record<Accidental, string> = {
  natural: '',
  sharp: '♯',
  flat: '♭',
  doubleSharp: '𝄪',
  doubleFlat: '𝄫',
};

/** Preferred default spelling for each chromatic class (0–11) — mostly sharps. */
const DEFAULT_SPELLING: { letter: Letter; accidental: Accidental }[] = [
  { letter: 'C', accidental: 'natural' }, // 0
  { letter: 'C', accidental: 'sharp' }, // 1
  { letter: 'D', accidental: 'natural' }, // 2
  { letter: 'D', accidental: 'sharp' }, // 3
  { letter: 'E', accidental: 'natural' }, // 4
  { letter: 'F', accidental: 'natural' }, // 5
  { letter: 'F', accidental: 'sharp' }, // 6
  { letter: 'G', accidental: 'natural' }, // 7
  { letter: 'G', accidental: 'sharp' }, // 8
  { letter: 'A', accidental: 'natural' }, // 9
  { letter: 'A', accidental: 'sharp' }, // 10
  { letter: 'B', accidental: 'natural' }, // 11
];

/** Pick a default (letter, accidental) spelling for a MIDI note. */
export function defaultSpelling(midi: number): {
  letter: Letter;
  accidental: Accidental;
} {
  const pc = ((midi % 12) + 12) % 12;
  return DEFAULT_SPELLING[pc];
}

/** Compute the (letter, octave) pair consistent with a pitch's accidental. */
export function pitchLetter(p: Pitch): { letter: Letter; octave: number } {
  const pc = ((p.midi % 12) + 12) % 12;
  const offset = ACCIDENTAL_OFFSET[p.accidental];
  const letterPc = ((pc - offset) % 12 + 12) % 12;
  const letter =
    (LETTERS.find((l) => LETTER_OFFSET[l] === letterPc) ?? DEFAULT_SPELLING[pc].letter) as Letter;
  // Compute octave so that (letter, octave, accidental) sounds as p.midi.
  // MIDI = 12 * (octave + 1) + LETTER_OFFSET[letter] + accidentalOffset
  // Handles edge cases like B♯3 (midi 60) and C♭5 (midi 71).
  const octave = Math.round((p.midi - LETTER_OFFSET[letter] - offset) / 12) - 1;
  return { letter, octave };
}

/** Human-readable name like "C♯4". */
export function pitchName(p: Pitch): string {
  const { letter, octave } = pitchLetter(p);
  return `${letter}${ACCIDENTAL_SYMBOL[p.accidental]}${octave}`;
}

/** MIDI → Hz. A4 (MIDI 69) = 440 Hz. */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Build a Pitch with default (sharp-biased) spelling for a MIDI note. */
export function makePitch(midi: number): Pitch {
  return { midi, accidental: defaultSpelling(midi).accidental };
}

/**
 * Build a Pitch, biasing the spelling of black keys toward sharps or flats.
 * Naturals (pc 0, 2, 4, 5, 7, 9, 11) are always spelled natural.
 */
export function makePitchForKey(midi: number, preferSharps: boolean): Pitch {
  const pc = ((midi % 12) + 12) % 12;
  const isBlack = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
  if (!isBlack) return { midi, accidental: 'natural' };
  return { midi, accidental: preferSharps ? 'sharp' : 'flat' };
}

/**
 * Spell a pressed MIDI note using the *current key signature* whenever
 * possible — the Sibelius / Finale step-entry convention. This keeps
 * notation clean when the user plays in-key by matching each note to
 * the key signature's letter / accidental pair and only falling back to
 * `preferSharps` when no clean spelling exists.
 *
 * The returned pitch's `midi` equals the pressed midi exactly, so
 * playback tracks what the user physically played — we only adjust the
 * (letter, accidental) spelling, not the sounding pitch.
 */
export function spellForKey(
  midi: number,
  keySignature: KeySignature,
  preferSharps: boolean,
): Pitch {
  const keyAcc = keySignatureLetterAccidentals(keySignature);
  for (const spelling of enharmonicSpellings(midi)) {
    if (keyAcc[spelling.letter] === spelling.accidental) {
      return { midi, accidental: spelling.accidental };
    }
  }
  return makePitchForKey(midi, preferSharps);
}

/**
 * All reasonable enharmonic spellings for a MIDI pitch — one entry per
 * letter that can express the pitch using at most a double-accidental.
 * The returned list is ordered by "nearness" to the standard spelling:
 * natural/single accidentals come before double accidentals.
 */
export function enharmonicSpellings(
  midi: number,
): { letter: Letter; accidental: Accidental; label: string }[] {
  const pc = ((midi % 12) + 12) % 12;
  const raw: { letter: Letter; accidental: Accidental; rank: number }[] = [];
  for (const letter of LETTERS) {
    const diff = (pc - LETTER_OFFSET[letter] + 12) % 12;
    let acc: Accidental | null = null;
    let rank = 99;
    if (diff === 0) {
      acc = 'natural';
      rank = 0;
    } else if (diff === 1) {
      acc = 'sharp';
      rank = 1;
    } else if (diff === 11) {
      acc = 'flat';
      rank = 1;
    } else if (diff === 2) {
      acc = 'doubleSharp';
      rank = 2;
    } else if (diff === 10) {
      acc = 'doubleFlat';
      rank = 2;
    }
    if (acc) raw.push({ letter, accidental: acc, rank });
  }
  raw.sort((a, b) => a.rank - b.rank);
  return raw.map((r) => ({
    letter: r.letter,
    accidental: r.accidental,
    label: `${r.letter}${ACCIDENTAL_SYMBOL[r.accidental]}`,
  }));
}

/**
 * Map each letter (C..B) to the accidental that the given key signature
 * implies for it. Letters not touched by the key signature map to
 * `'natural'`. Used by the ABC renderer to decide which notes actually
 * need an explicit accidental drawn.
 */
export function keySignatureLetterAccidentals(
  keySignature: KeySignature,
): Record<Letter, Accidental> {
  const sharpOrder: Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const flatOrder: Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  const out: Record<Letter, Accidental> = {
    C: 'natural',
    D: 'natural',
    E: 'natural',
    F: 'natural',
    G: 'natural',
    A: 'natural',
    B: 'natural',
  };
  const n = keySignature.accidentals;
  if (n > 0) {
    for (let i = 0; i < Math.min(n, 7); i++) out[sharpOrder[i]] = 'sharp';
  } else if (n < 0) {
    for (let i = 0; i < Math.min(-n, 7); i++) out[flatOrder[i]] = 'flat';
  }
  return out;
}

// ── Instruments & transposition ─────────────────────────────────────────────

export type Instrument = {
  id: string;
  label: string;
  /** Written - Concert in semitones. Bb instrument: written is 2 semitones
   *  above concert, so transpose = +2 (concert = written - 2). */
  transposeSemitones: number;
};

export const INSTRUMENTS: Instrument[] = [
  { id: 'concert', label: 'Concert pitch (flute / piano / violin)', transposeSemitones: 0 },
  { id: 'bb_clarinet', label: 'B♭ clarinet / trumpet', transposeSemitones: 2 },
  { id: 'a_clarinet', label: 'A clarinet', transposeSemitones: 3 },
  { id: 'eb_alto_sax', label: 'E♭ alto sax / alto clarinet', transposeSemitones: 9 },
  { id: 'bb_tenor_sax', label: 'B♭ tenor sax / bass clarinet', transposeSemitones: 14 },
  { id: 'eb_bari_sax', label: 'E♭ baritone sax', transposeSemitones: 21 },
  { id: 'f_horn', label: 'F horn / english horn', transposeSemitones: 7 },
];

/** Convert written pitch for an instrument → concert MIDI (what's actually heard). */
export function writtenToConcert(writtenMidi: number, instrument: Instrument): number {
  return writtenMidi - instrument.transposeSemitones;
}

/** Convert concert pitch → written pitch for an instrument. */
export function concertToWritten(concertMidi: number, instrument: Instrument): number {
  return concertMidi + instrument.transposeSemitones;
}

// ── Key signatures ──────────────────────────────────────────────────────────

export type KeySignature = {
  id: string;
  label: string;
  /** ABC key name: 'C', 'G', 'F', 'Bb', 'Eb', 'F#', etc. */
  abcKey: string;
  /** Sharps (+) or flats (-) count for display. */
  accidentals: number;
};

export type Clef = {
  id: string;
  label: string;
  abcClef: string;
};

export const CLEFS: Clef[] = [
  { id: 'treble', label: 'Treble', abcClef: 'treble' },
  { id: 'bass', label: 'Bass', abcClef: 'bass' },
  { id: 'alto', label: 'Alto', abcClef: 'alto' },
  { id: 'tenor', label: 'Tenor', abcClef: 'tenor' },
  { id: 'percussion', label: 'Percussion', abcClef: 'perc' },
];

export const KEY_SIGNATURES: KeySignature[] = [
  { id: 'Cb', label: 'C♭ major (7♭)', abcKey: 'Cb', accidentals: -7 },
  { id: 'Gb', label: 'G♭ major (6♭)', abcKey: 'Gb', accidentals: -6 },
  { id: 'Db', label: 'D♭ major (5♭)', abcKey: 'Db', accidentals: -5 },
  { id: 'Ab', label: 'A♭ major (4♭)', abcKey: 'Ab', accidentals: -4 },
  { id: 'Eb', label: 'E♭ major (3♭)', abcKey: 'Eb', accidentals: -3 },
  { id: 'Bb', label: 'B♭ major (2♭)', abcKey: 'Bb', accidentals: -2 },
  { id: 'F', label: 'F major (1♭)', abcKey: 'F', accidentals: -1 },
  { id: 'C', label: 'C major', abcKey: 'C', accidentals: 0 },
  { id: 'G', label: 'G major (1♯)', abcKey: 'G', accidentals: 1 },
  { id: 'D', label: 'D major (2♯)', abcKey: 'D', accidentals: 2 },
  { id: 'A', label: 'A major (3♯)', abcKey: 'A', accidentals: 3 },
  { id: 'E', label: 'E major (4♯)', abcKey: 'E', accidentals: 4 },
  { id: 'B', label: 'B major (5♯)', abcKey: 'B', accidentals: 5 },
  { id: 'F#', label: 'F♯ major (6♯)', abcKey: 'F#', accidentals: 6 },
  { id: 'C#', label: 'C♯ major (7♯)', abcKey: 'C#', accidentals: 7 },
];
