// ── Onboarding strategy demos ────────────────────────────────────────────────
//
// The value-first onboarding payoff names six guided strategies as chips. This
// module turns a chip into a self-driving DEMO that works the strategy on the
// Flight of the Bumblebee phrase the user just heard — see the chunks light up
// + hear them play, instead of reading a label.
//
// First strategy wired: Interleaved Click-Up. The phrase is 17 notes = 4 chunks
// of 4 sixteenths, each chunk ending on the first note of the next (the
// "landing" note). The real ICU generator (lib/strategies/clickUp.ts) is mirrored
// here so the demo's add-a-chunk / solo / rolling-window / climb-the-tempo
// sequence is faithful to the actual tool.

import { bucketConcertMidi, type BumblebeeBucket } from '@/lib/onboarding/bumblebee';
import type { SampleNote } from '@/lib/audio/sampler';

/** Notes per chunk (the four sixteenths before the landing note). */
export const DEMO_CHUNK = 4 as const;
/** Number of chunks the Bumblebee phrase splits into. */
export const DEMO_CHUNKS = 4 as const;

/**
 * Tempo ladder for the demo. The real tool clicks up +5; that produces 13 rungs
 * × 4 phases = 52 steps, which is a long sit with audio on every step. The demo
 * uses a coarser rung so the interleaving (phases 2–4) shows up quickly. Change
 * INCREMENT back to 5 for a literal run — the pattern logic is identical.
 */
export const DEMO_START_TEMPO = 60;
export const DEMO_GOAL_TEMPO = 120;
export const DEMO_INCREMENT = 10;

export type IcuDemoStep = {
  /** Phase = how many chunks are in play (1..4). */
  phase: number;
  /** Metronome tempo for this step. */
  tempo: number;
  /** Lowest active chunk (1-based). */
  loChunk: number;
  /** Highest active chunk (1-based). */
  hiChunk: number;
};

function tempoRange(start: number, goal: number, inc: number): number[] {
  const out: number[] = [];
  for (let t = start; t <= goal; t += inc) out.push(t);
  if (out.length === 0 || out[out.length - 1] !== goal) out.push(goal);
  return out;
}

/**
 * The faithful ICU step list for `N` chunks. Phase 1 ladders chunk 1 up the
 * tempo range. Each later phase alternates, across the same tempo ladder, a
 * "rolling window" step (whose start point cycles 1 → k-1 → … → 2) with a "solo
 * the newest chunk" step — exactly `generateSteps` in lib/strategies/clickUp.ts.
 */
export function generateIcuDemoSteps(
  N: number = DEMO_CHUNKS,
  start: number = DEMO_START_TEMPO,
  goal: number = DEMO_GOAL_TEMPO,
  inc: number = DEMO_INCREMENT,
): IcuDemoStep[] {
  const tempos = tempoRange(start, goal, inc);
  const steps: IcuDemoStep[] = [];

  for (const t of tempos) {
    steps.push({ phase: 1, tempo: t, loChunk: 1, hiChunk: 1 });
  }

  for (let k = 2; k <= N; k++) {
    const cycleStarts: number[] = [1];
    for (let j = k - 1; j >= 2; j--) cycleStarts.push(j);

    tempos.forEach((t, i) => {
      if (i % 2 === 0) {
        const lo = cycleStarts[Math.floor(i / 2) % cycleStarts.length];
        steps.push({ phase: k, tempo: t, loChunk: lo, hiChunk: k });
      } else {
        steps.push({ phase: k, tempo: t, loChunk: k, hiChunk: k });
      }
    });
  }

  return steps;
}

/** Inclusive note-index span (into the 17-note phrase) a step makes active. */
export function stepNoteSpan(step: IcuDemoStep): { from: number; to: number } {
  return { from: (step.loChunk - 1) * DEMO_CHUNK, to: step.hiChunk * DEMO_CHUNK };
}

/** Human label for what a step is doing, e.g. "chunk 3 alone" / "chunks 2–3". */
export function stepDoingLabel(step: IcuDemoStep): string {
  if (step.loChunk === step.hiChunk) return `chunk ${step.hiChunk} alone`;
  if (step.loChunk === 1) return `chunks 1–${step.hiChunk} together`;
  return `chunks ${step.loChunk}–${step.hiChunk} together`;
}

/** One short caption per phase — the why, not the mechanics. */
export const ICU_PHASE_CAPTIONS: Record<number, string> = {
  1: 'Lock in chunk one — click the tempo up a notch at a time.',
  2: 'Add chunk two: bounce between it alone and both together.',
  3: 'Add chunk three: solo it, pair it with the one before, then all three.',
  4: 'Add the last chunk the same way — until the whole phrase is fast.',
};

/**
 * Build the sampler schedule for a step: the active note slice of the phrase,
 * played as even sixteenths at the step's tempo. `soundShift` matches the
 * onboarding instrument's playback octave (e.g. tenor/bari sax).
 */
export function icuStepSchedule(
  bucket: BumblebeeBucket,
  step: IcuDemoStep,
  soundShift = 0,
): { notes: SampleNote[]; durationSec: number } {
  const concert = bucketConcertMidi(bucket);
  const { from, to } = stepNoteSpan(step);
  const slice = concert.slice(from, to + 1);
  const secPerSixteenth = 60 / step.tempo / 4;
  const notes: SampleNote[] = slice.map((midi, k) => ({
    midi: midi + soundShift,
    time: k * secPerSixteenth,
    duration: secPerSixteenth * 0.92,
  }));
  return { notes, durationSec: slice.length * secPerSixteenth };
}

// ── Tempo Ladder demo ────────────────────────────────────────────────────────
// One rep = the whole phrase at the current tempo. The demo runs a 3-clean-in-
// a-row set at ~80 bpm; a miss resets the streak to zero, and completing the set
// celebrates + offers to bump the tempo (the "ladder"). Mirrors the real
// useTempoLadderSession step mode (target_reps / current_streak / increment).

export const TL_BASE_TEMPO = 80;
export const TL_INCREMENT = 5;
export const TL_TARGET_REPS = 3;

/** The whole 17-note phrase as even sixteenths at `tempo` — one tempo-ladder rep. */
export function fullPhraseSchedule(
  bucket: BumblebeeBucket,
  tempo: number,
  soundShift = 0,
): { notes: SampleNote[]; durationSec: number } {
  const concert = bucketConcertMidi(bucket);
  const secPerSixteenth = 60 / tempo / 4;
  const notes: SampleNote[] = concert.map((midi, k) => ({
    midi: midi + soundShift,
    time: k * secPerSixteenth,
    duration: secPerSixteenth * 0.92,
  }));
  return { notes, durationSec: concert.length * secPerSixteenth };
}
