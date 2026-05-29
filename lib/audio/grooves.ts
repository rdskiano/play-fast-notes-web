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

export type DrumVoice = 'kick' | 'snare' | 'hat' | 'openHat' | 'clap';

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
const ROCK: Groove = {
  id: 'rock44',
  name: 'Rock',
  meter: '4/4',
  steps: 16,
  hits: [
    ...at('kick', [0, 8]),
    ...at('snare', [4, 12]),
    ...every('hat', 2, 16, 0, 0.7), // straight eighths
  ],
};

const POP: Groove = {
  id: 'pop44',
  name: 'Pop',
  meter: '4/4',
  steps: 16,
  hits: [
    ...at('kick', [0, 8, 10]), // extra push on the "and" of 3
    ...at('snare', [4, 12]),
    ...every('hat', 2, 16, 0, 0.7),
  ],
};

const FUNK: Groove = {
  id: 'funk44',
  name: 'Funk',
  meter: '4/4',
  steps: 16,
  hits: [
    ...at('kick', [0, 3, 6, 10]),
    ...at('snare', [4, 12]),
    ...every('hat', 1, 16, 0, 0.45), // sixteenth hats, quiet
    ...at('hat', [0, 4, 8, 12], 0.8), // accent the beats
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
  ROCK,
  POP,
  FUNK,
  HOUSE,
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
