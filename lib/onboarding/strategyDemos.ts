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

import {
  bucketConcertMidi,
  BUMBLEBEE_BUCKETS,
  representativeInstrumentForBucket,
  type BumblebeeBucket,
} from '@/lib/onboarding/bumblebee';
import { generateMacroSteps } from '@/lib/strategies/macroChain';
import type { SampleNote } from '@/lib/audio/sampler';
import { getSetting, setSetting } from '@/lib/db/repos/settings';
import { listPassages } from '@/lib/db/repos/passages';
import { listExercisesForPassage } from '@/lib/db/repos/exercises';

/**
 * Settings key holding the instrument the user picked during onboarding. Used
 * to replay the Bumblebee strategy demos in their clef long after onboarding —
 * e.g. the "?" on each passage-hub strategy card.
 */
export const ONBOARDING_INSTRUMENT_KEY = 'onboarding:instrument';

/** Title the Bumblebee seed piece is stored under (see seedBumblebee.ts). */
const SEED_TITLE = 'Flight of the Bumblebee';

/**
 * The instrument to replay the strategy demos with. Prefers the one the user
 * picked during onboarding (saved to settings). For users who onboarded before
 * we saved it, falls back to deriving the bucket from their seeded Bumblebee
 * piece's rhythm exercise — recovering at least the correct CLEF — and backfills
 * the setting so we only pay that lookup once. Defaults to Flute (concert pitch)
 * for anyone with neither. Always resolves; never throws.
 */
export async function resolveOnboardingInstrument(): Promise<string> {
  const saved = await getSetting(ONBOARDING_INSTRUMENT_KEY).catch(() => null);
  if (saved) return saved;

  try {
    const piece = (await listPassages()).find((p) => p.title === SEED_TITLE);
    if (piece) {
      const ex = (await listExercisesForPassage(piece.id)).find((e) => e.strategy === 'rhythmic');
      if (ex) {
        const cfg = JSON.parse(ex.config_json) as {
          instrumentId?: string;
          keyId?: string;
          clefId?: string;
        };
        const bucket = BUMBLEBEE_BUCKETS.find(
          (b) =>
            b.instrumentId === cfg.instrumentId &&
            b.keyId === cfg.keyId &&
            b.clefId === cfg.clefId,
        );
        if (bucket) {
          const name = representativeInstrumentForBucket(bucket.id);
          void setSetting(ONBOARDING_INSTRUMENT_KEY, name).catch(() => undefined);
          return name;
        }
      }
    }
  } catch {
    // best-effort — fall through to the default
  }

  return 'Flute';
}

/**
 * Micro- and Macro-chaining are practiced AT PERFORMANCE TEMPO (unlike Tempo
 * Ladder / Click-Up, which ramp slow→fast). Ralph's spec: quarter note = 136.
 * The phrase runs in sixteenths, so each note lasts 60/136/4 ≈ 0.110 s. Both
 * chaining demos read this so they always play at the same performance tempo.
 */
export const CHAIN_DEMO_TEMPO_BPM = 136;
/** Seconds per (sixteenth) note at the chaining demos' performance tempo. */
export const CHAIN_DEMO_NOTE_SEC = 60 / CHAIN_DEMO_TEMPO_BPM / 4;

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

// ── Macro-chaining demo ──────────────────────────────────────────────────────
// Faithful to the real generateMacroSteps: at each chunk size, ISOLATE each
// chunk (drill it a few times — "repeat until comfortable") then CHAIN the
// chunks with rest-beats between them, knocking the rests down from 2 → 1 → 0;
// then the chunk size DOUBLES and you isolate + chain again, up to the whole
// phrase. The Bumblebee phrase is 16 running sixteenths = 4 beats (note 17 is
// the final landing note). Chunk sizes for 4 beats: 1, 2, 4.
//
// The demo expands that step list into a flat timeline of FRAMES the player
// walks: a play-frame greens + sounds a chunk; a rest-frame shows a blinking
// "REST" above the staff (one blink per rest beat). Performance tempo (q = 136).

/** Sixteenth-notes per beat in the phrase. */
export const MACRO_BEAT_NOTES = 4 as const;
/** Beats in the phrase (16 sixteenths). */
export const MACRO_BEATS = 4 as const;
/** Times each chunk is drilled in its ISOLATE step ("repeat until comfortable"). */
export const MACRO_ISOLATE_REPS = 3;

/**
 * The 0-based phrase note indices for one chunk. Chunks are the chunkSize beats
 * starting at chunkIndex; the LAST chunk also takes the final landing note
 * (index 16) so the phrase resolves. Non-overlapping, so chained playback is
 * clean (no doubled downbeats).
 */
export function macroUnitNotes(
  beatCount: number,
  chunkSize: number,
  chunkIndex: number,
): number[] {
  const chunkCount = Math.ceil(beatCount / chunkSize);
  const from = chunkIndex * chunkSize * MACRO_BEAT_NOTES;
  const isLast = chunkIndex >= chunkCount - 1;
  const to = isLast ? beatCount * MACRO_BEAT_NOTES : from + chunkSize * MACRO_BEAT_NOTES - 1;
  const out: number[] = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
}

/**
 * Notes for a CHAIN chunk — its beats PLUS the next downbeat (you play the chunk
 * INTO the landing note), clamped to the final note. The landing note is why the
 * real silence runs one beat longer than the displayed REST count.
 */
export function macroChainNotes(
  beatCount: number,
  chunkSize: number,
  chunkIndex: number,
): number[] {
  const from = chunkIndex * chunkSize * MACRO_BEAT_NOTES;
  const to = Math.min(from + chunkSize * MACRO_BEAT_NOTES, beatCount * MACRO_BEAT_NOTES);
  const out: number[] = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
}

/** Short label for the stage indicator, by chunk size in beats. */
export function macroChunkBeatsLabel(chunkBeats: number, beatCount: number): string {
  if (chunkBeats >= beatCount) return 'Whole phrase';
  return chunkBeats === 1 ? '1-beat chunks' : `${chunkBeats}-beat chunks`;
}

/** The distinct chunk sizes the demo passes through, in order (1, 2, … whole). */
export function macroChunkSizes(beatCount: number = MACRO_BEATS): number[] {
  const sizes = new Set<number>();
  for (let c = 1; c * 2 <= beatCount; c++) if (beatCount % c === 0) sizes.add(c);
  sizes.add(beatCount);
  return [...sizes].sort((a, b) => a - b);
}

export type MacroFrame = {
  /** 0-based phrase note indices to color (the chunk in play); [] during a rest. */
  green: number[];
  /** Note indices to sound, or null on a silent rest beat. */
  sound: number[] | null;
  /** True on a rest beat. */
  rest: boolean;
  /** Whether the REST label is lit (rest beats split on→off so it blinks). */
  restOn: boolean;
  /** Chunk size (beats) of the current step — drives the stage indicator. */
  chunkBeats: number;
  /** Short caption for the current step. */
  label: string;
  /** How long this frame holds, ms. */
  durMs: number;
};

/**
 * Expand the real macro step list into the demo's frame timeline.
 *
 * - ISOLATE: drill the chunk MACRO_ISOLATE_REPS times.
 * - CHAIN: play each chunk INTO the next downbeat (landing note included), then
 *   the landing beat passes silently-but-unlabeled, then `restBeats` blinking
 *   "REST" beats — so the real silence is always ONE beat longer than the REST
 *   count shown. Rests count down 2 → 1 → 0.
 * - SEAMLESS (the step that completes each chunk size): the chunks played
 *   straight through with no gap at all. Added after the rest-0 chain step.
 * - Chunk size doubles each round, up to the whole phrase.
 */
export function buildMacroDemoFrames(beatCount: number = MACRO_BEATS): MacroFrame[] {
  const steps = generateMacroSteps(beatCount);
  const noteMs = CHAIN_DEMO_NOTE_SEC * 1000;
  const beatMs = MACRO_BEAT_NOTES * noteMs;
  // A clear break at the END of every step, so the last chunk never bleeds into
  // the next step's first chunk when we return to the start of the passage.
  const stepBreakMs = Math.round(beatMs * 1.5);
  const frames: MacroFrame[] = [];

  const pushBreak = (chunkBeats: number, label: string) =>
    frames.push({
      green: [],
      sound: null,
      rest: false,
      restOn: false,
      chunkBeats,
      label,
      durMs: stepBreakMs,
    });

  for (const step of steps) {
    if (step.kind === 'isolate') {
      const isWhole = step.chunkCount === 1;
      // Drill the chunk INTO the next downbeat (landing-inclusive) even on its
      // own — a 1-beat chunk is 5 notes, a 2-beat chunk is 9 — so isolate and
      // chain cover the same notes. (The whole-phrase finale is the full run.)
      const notes = macroChainNotes(beatCount, step.chunkSize, step.chunkIndex);
      const label = isWhole
        ? 'The whole phrase'
        : step.chunkSize === 1
          ? `Drill unit ${step.chunkIndex + 1} until it’s comfortable`
          : `Drill chunk ${step.chunkIndex + 1} (${step.chunkSize} beats) until comfortable`;
      // Drill a chunk a few times; play the whole phrase just once.
      const reps = isWhole ? 1 : MACRO_ISOLATE_REPS;
      for (let r = 0; r < reps; r++) {
        frames.push({
          green: notes,
          sound: notes,
          rest: false,
          restOn: false,
          chunkBeats: step.chunkSize,
          label,
          durMs: notes.length * noteMs + (r < reps - 1 ? 260 : 0),
        });
      }
      pushBreak(step.chunkSize, label);
    } else {
      const chunkCount = Math.ceil(beatCount / step.chunkSize);
      const label =
        step.restBeats === 0
          ? 'Join them — a beat between'
          : `Join them — rest ${step.restBeats}, then back in`;
      for (let j = 0; j < chunkCount; j++) {
        const notes = macroChainNotes(beatCount, step.chunkSize, j);
        frames.push({
          green: notes,
          sound: notes,
          rest: false,
          restOn: false,
          chunkBeats: step.chunkSize,
          label,
          durMs: notes.length * noteMs,
        });
        if (j < chunkCount - 1) {
          // The landing beat: you played onto the downbeat, now it rests out —
          // silent but NOT labeled, which is the extra beat beyond the REST count.
          frames.push({
            green: [],
            sound: null,
            rest: false,
            restOn: false,
            chunkBeats: step.chunkSize,
            label,
            durMs: Math.round(beatMs * 0.75),
          });
          for (let b = 0; b < step.restBeats; b++) {
            frames.push({
              green: [],
              sound: null,
              rest: true,
              restOn: true,
              chunkBeats: step.chunkSize,
              label,
              durMs: Math.round(beatMs * 0.62),
            });
            frames.push({
              green: [],
              sound: null,
              rest: true,
              restOn: false,
              chunkBeats: step.chunkSize,
              label,
              durMs: Math.round(beatMs * 0.38),
            });
          }
        }
      }
      // The missing step: once the rests are gone, join the chunks SEAMLESSLY —
      // played straight through with no gap. (Added after the rest-0 chain.)
      if (step.restBeats === 0) {
        // A break BEFORE the seamless join, so the last "chunk · chunk · chunk"
        // rep doesn't bleed straight into the all-joined-together pass.
        pushBreak(step.chunkSize, label);
        const seamlessLabel = 'Now join them seamlessly';
        for (let j = 0; j < chunkCount; j++) {
          const notes = macroUnitNotes(beatCount, step.chunkSize, j);
          frames.push({
            green: notes,
            sound: notes,
            rest: false,
            restOn: false,
            chunkBeats: step.chunkSize,
            label: seamlessLabel,
            durMs: notes.length * noteMs,
          });
        }
      }
      // A clear break before the next step (so the last chunk doesn't bleed
      // into the next step's first chunk at the start of the passage).
      pushBreak(step.chunkSize, label);
    }
  }
  return frames;
}
