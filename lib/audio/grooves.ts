// Groove library for the metronome's "Rhythms" feature — a small, curated
// set of drum-machine grooves the metronome can play instead of a plain
// click, at the current tempo, matched to the chosen meter.
//
// Grooves are pure data: a list of drum hits on a fixed grid. The audio is
// synthesised by the metronome engine (see useMetronome.web.ts) — there are
// no audio files. This keeps the feature asset-free, offline, and aligned
// with how the rest of the metronome is built.
//
// GRID: STEPS_PER_QUARTER sixteenth-steps per quarter-note beat. A step's
// real duration is (60 / bpm) / STEPS_PER_QUARTER seconds, read live so the
// groove retempos with the dial. Bar length = `steps` × that.
//   4/4 → 16 steps   3/4 → 12 steps   6/8 → 12 steps (6 eighths)
// Meter labels match the metronome panel's METERS list exactly.

export const STEPS_PER_QUARTER = 4;

export type DrumVoice =
  | 'kick'
  | 'snare'
  | 'hat'
  | 'openHat'
  | 'clap'
  // Latin percussion — synthesised alongside the kit voices.
  | 'maracas' // bright shaker / short noise burst
  | 'conga' // pitched hand drum with a skin-attack
  | 'block'; // woodblock — sharp pitched tick

/** One drum hit, placed at `step` on the sixteenth grid. */
export type GrooveHit = {
  voice: DrumVoice;
  step: number;
  /** 0..1 loudness, default 1. */
  vel?: number;
};

export type Groove = {
  id: string;
  /** Short display name shown in the picker. */
  name: string;
  /** Meter label, e.g. '4/4' — must match a MetronomePanel METERS entry. */
  meter: string;
  /** Steps in one bar on the sixteenth grid. */
  steps: number;
  hits: GrooveHit[];
};

// ── Helpers for authoring ────────────────────────────────────────────────
// Quarter-note beats land on multiples of STEPS_PER_QUARTER (0,4,8,…);
// eighth notes on multiples of 2.

/** Hits of one voice on every Nth step from `from` up to (exclusive) `to`. */
function every(voice: DrumVoice, n: number, to: number, from = 0, vel?: number): GrooveHit[] {
  const out: GrooveHit[] = [];
  for (let s = from; s < to; s += n) out.push({ voice, step: s, vel });
  return out;
}
function at(voice: DrumVoice, steps: number[], vel?: number): GrooveHit[] {
  return steps.map((step) => ({ voice, step, vel }));
}

// ── 4/4 (16 steps) ────────────────────────────────────────────────────────
// Transcribed from a reference groove (hi-hat / snare / kick), 1-indexed cells
// 1–16 mapped to 0-indexed steps. Hi-hats accent the beats and soften the
// off-beats; the snare adds ghost notes on the "a" of 2 and the "e"-ish of 3;
// the kick pushes the "&" of 4 into the next downbeat.
const BEAT1: Groove = {
  id: 'beat1',
  name: 'Beat 1',
  meter: '4/4',
  steps: 16,
  hits: [
    ...at('kick', [0, 14]), // beat 1 + push on the "&" of 4
    ...at('snare', [4, 12]), // backbeat, full
    ...at('snare', [7, 9], 0.4), // ghost notes
    ...at('hat', [0, 4, 8, 12], 0.7), // on-beat hats, accented
    ...at('hat', [2, 6, 10, 14], 0.45), // off-beat hats, softer
  ],
};

// Transcribed from the reference "Rock" groove (hi-hat / snare / kick).
const ROCK: Groove = {
  id: 'rock44',
  name: 'Rock',
  meter: '4/4',
  steps: 16,
  hits: [
    ...at('kick', [0, 3, 8, 11]), // beat 1 + "a" of 1, beat 3 + "a" of 3
    ...at('kick', [6, 14], 0.7), // softer "&" of 2 and "&" of 4
    ...at('snare', [4, 12]), // backbeat
    ...at('hat', [0, 4, 8, 12], 0.7), // on-beat hats, accented
    ...at('hat', [2, 6, 10, 14], 0.45), // off-beat hats, softer
  ],
};

// Transcribed from the reference "Pop" groove (hi-hat / snare / kick).
const POP: Groove = {
  id: 'pop44',
  name: 'Pop',
  meter: '4/4',
  steps: 16,
  hits: [
    ...at('kick', [0, 6, 10]), // beat 1 + "&" of 2 + "&" of 3
    ...at('kick', [3], 0.7), // softer "a" of 1
    ...at('snare', [4, 12]), // backbeat, full
    ...at('snare', [9], 0.4), // ghost on the "e" of 3
    ...at('hat', [0, 4, 8, 12], 0.7), // on-beat hats, accented
    ...at('hat', [2, 6, 10, 14], 0.45), // off-beat hats, softer
  ],
};

// Transcribed from the reference "Funk" groove (hi-hat / snare / kick).
const FUNK: Groove = {
  id: 'funk44',
  name: 'Funk',
  meter: '4/4',
  steps: 16,
  hits: [
    ...at('kick', [0, 3, 10, 13]), // beat 1, "a" of 1, "&" of 3, "e" of 4
    ...at('snare', [4, 12]), // backbeat, full
    ...at('snare', [9, 15], 0.4), // ghosts on "e" of 3 and "a" of 4
    ...at('hat', [2, 6, 10, 14], 0.75), // off-beat hats, accented
    ...at('hat', [0, 4, 8, 12], 0.5), // on-beat hats, softer
  ],
};

const HOUSE: Groove = {
  id: 'house44',
  name: 'Four-on-floor',
  meter: '4/4',
  steps: 16,
  hits: [
    ...every('kick', 4, 16), // four-on-the-floor
    ...at('clap', [4, 12]),
    ...at('openHat', [2, 6, 10, 14], 0.6), // off-beat open hats
  ],
};

// Transcribed from the reference "Latin 1" groove (maracas / conga / block).
const LATIN1: Groove = {
  id: 'latin1_44',
  name: 'Latin 1',
  meter: '4/4',
  steps: 16,
  hits: [
    // Maracas: steady sixteenths, accented on the "&" of each beat.
    ...at('maracas', [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], 0.4),
    ...at('maracas', [2, 6, 10, 14], 0.7),
    // Conga: the off-beats, plus a push on the "a" of 4.
    ...at('conga', [2, 6, 10, 14]),
    ...at('conga', [15], 0.7),
    // Block: a clave-style line.
    ...at('block', [0, 3, 7, 10, 12]),
  ],
};

// Transcribed from the reference "Cha-cha" groove (hi-hat / conga / kick).
const CHACHA: Groove = {
  id: 'chacha_44',
  name: 'Cha-cha',
  meter: '4/4',
  steps: 16,
  hits: [
    ...at('hat', [0, 4, 8, 12], 0.7), // on-beat hats, accented
    ...at('hat', [2, 3, 6, 10, 14], 0.45), // off-beats + the "a" of 1
    ...at('conga', [12, 14]), // beat 4 + "&" of 4
    ...at('conga', [4], 0.6), // softer beat 2
    ...at('kick', [0, 8]), // beats 1 and 3
    ...at('kick', [6], 0.7), // softer "&" of 2
  ],
};

// Authored from the genre (no reference grid). Minimal, driving techno.
const TECHNO: Groove = {
  id: 'techno_44',
  name: 'Techno',
  meter: '4/4',
  steps: 16,
  hits: [
    ...at('kick', [0, 4, 8, 12]), // four-on-the-floor
    ...at('clap', [4, 12]), // machine clap on 2 & 4
    ...at('openHat', [2, 6, 10, 14], 0.6), // offbeat open hats
  ],
};

// Authored from the genre (no reference grid). Classic disco hat sizzle.
const DISCO: Groove = {
  id: 'disco_44',
  name: 'Disco',
  meter: '4/4',
  steps: 16,
  hits: [
    ...at('kick', [0, 4, 8, 12]), // four-on-the-floor
    ...at('snare', [4, 12]), // backbeat
    ...at('hat', [0, 4, 8, 12], 0.4), // closed hats on the beats
    ...at('openHat', [2, 6, 10, 14], 0.7), // open hats on the "and"s
  ],
};

// ── 3/4 (12 steps) ──────────────────────────────────────────────────────
const WALTZ: Groove = {
  id: 'waltz34',
  name: 'Waltz',
  meter: '3/4',
  steps: 12,
  hits: [
    ...at('kick', [0]), // oom
    ...at('hat', [4, 8], 0.8), // pah-pah on beats 2 and 3
  ],
};

const JAZZ_WALTZ: Groove = {
  id: 'jazzwaltz34',
  name: 'Jazz waltz',
  meter: '3/4',
  steps: 12,
  hits: [
    ...at('kick', [0]),
    ...at('snare', [8], 0.6), // light comp on beat 3
    ...every('hat', 2, 12, 0, 0.6), // ride-ish eighths
  ],
};

const LATIN3: Groove = {
  id: 'latin34',
  name: 'Latin (in 3)',
  meter: '3/4',
  steps: 12,
  hits: [
    ...at('kick', [0, 6]),
    ...at('clap', [4, 8], 0.8),
    ...every('hat', 2, 12, 0, 0.55),
  ],
};

// ── 6/8 (12 steps — 6 eighths, eighths on even steps) ─────────────────────
const SHUFFLE68: Groove = {
  id: 'shuffle68',
  name: '6/8 groove',
  meter: '6/8',
  steps: 12,
  hits: [
    ...at('kick', [0]),
    ...at('snare', [6]), // backbeat on the second main pulse
    ...every('hat', 2, 12, 0, 0.7), // eighths
  ],
};

const MARCH68: Groove = {
  id: 'march68',
  name: '6/8 march',
  meter: '6/8',
  steps: 12,
  hits: [
    ...at('kick', [0, 6]),
    ...every('hat', 2, 12, 0, 0.7),
  ],
};

export const GROOVES: Groove[] = [
  BEAT1,
  ROCK,
  POP,
  FUNK,
  HOUSE,
  LATIN1,
  CHACHA,
  TECHNO,
  DISCO,
  WALTZ,
  JAZZ_WALTZ,
  LATIN3,
  SHUFFLE68,
  MARCH68,
];

/** Grooves available for a given meter label (e.g. '4/4'). */
export function groovesForMeter(meter: string): Groove[] {
  return GROOVES.filter((g) => g.meter === meter);
}

/** Look up a groove by id; null for unknown/None. */
export function getGroove(id: string | null): Groove | null {
  if (!id) return null;
  return GROOVES.find((g) => g.id === id) ?? null;
}
