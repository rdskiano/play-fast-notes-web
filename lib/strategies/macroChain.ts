// Macro-Chaining (chunking + systematic rests) step generation.
//
// The user marks each beat of the passage (mark the start of every beat + one
// at the end — so N marks = N-1 beats, like Click-Up units). Practice then
// works through chunk sizes that split the passage into equal full units (its
// divisors — e.g. 8 → 1, 2, 4; 10 → 1, 2, 5) up to the whole passage. At EACH
// chunk size there are two phases:
//
//   1. ISOLATE — drill each chunk on its own (play it into the first note of
//      the next beat, repeat until comfortable). One step per chunk position.
//   2. CHAIN — play the chunks in a row with rest beats inserted between them,
//      knocking the rests down to zero.
//
// Then the chunk size grows to the next divisor and you isolate, then chain,
// again — up to playing the whole passage continuously.
//
// Step-based, NOT metronome-driven: the app shows the instruction + highlights
// the relevant chunk(s) on the score; the user runs their own metronome and
// taps NEXT.

import type { Marker } from '@/lib/db/repos/passages';

export type MacroStep =
  | { kind: 'isolate'; chunkSize: number; chunkIndex: number; chunkCount: number }
  | { kind: 'chain'; chunkSize: number; restBeats: number };

// Starting rests per chunk size (user-confirmed): 2 for 1–2-beat chunks, 3 for
// larger ones.
export function initialRests(chunkSize: number): number {
  return chunkSize <= 2 ? 2 : 3;
}

/**
 * Build the ordered step list. `beatCount` = beats in the passage (marks - 1).
 * Chunk sizes double up to the whole passage; each size gets an isolate step
 * per chunk, then (if there are ≥2 chunks) a rest-reduction chain sequence.
 */
export function generateMacroSteps(beatCount: number): MacroStep[] {
  if (beatCount < 1) return [];
  const sizes = new Set<number>();
  // Use chunk sizes that split the passage into ≥2 EQUAL full units — i.e. the
  // divisors of beatCount up to half its length. Every unit stays a full unit
  // (never a partial trailing chunk), and the progression grows naturally:
  // 8 → 1, 2, 4; 10 → 1, 2, 5; 16 → 1, 2, 4, 8. The whole passage is the finale.
  for (let c = 1; c * 2 <= beatCount; c++) {
    if (beatCount % c === 0) sizes.add(c);
  }
  sizes.add(beatCount); // whole-passage finale (and guarantees ≥1 size)
  const ordered = [...sizes].sort((a, b) => a - b);

  const steps: MacroStep[] = [];
  for (const c of ordered) {
    const chunkCount = Math.ceil(beatCount / c);
    for (let i = 0; i < chunkCount; i++) {
      steps.push({ kind: 'isolate', chunkSize: c, chunkIndex: i, chunkCount });
    }
    // Chaining only makes sense with at least two chunks to put rests between.
    if (chunkCount >= 2) {
      for (let r = initialRests(c); r >= 0; r--) {
        steps.push({ kind: 'chain', chunkSize: c, restBeats: r });
      }
    }
  }
  return steps;
}

function fullBeatWord(n: number): string {
  return n === 1 ? '1 full beat' : `${n} full beats`;
}

/** Instruction line for the current step (shown in the top bar). */
export function formatMacroInstruction(step: MacroStep | undefined): string {
  if (!step) return '';

  if (step.kind === 'isolate') {
    if (step.chunkCount === 1) {
      return 'Play the whole passage continuously at your goal tempo, repeating until it’s comfortable.';
    }
    const label =
      step.chunkSize === 1 ? `beat ${step.chunkIndex + 1}` : `chunk ${step.chunkIndex + 1}`;
    return `Drill ${label} of ${step.chunkCount}: play it into the first note of the next beat, repeating until it’s comfortable. Then tap NEXT.`;
  }

  const what = step.chunkSize === 1 ? 'each beat' : `each ${step.chunkSize}-beat chunk`;
  if (step.restBeats === 0) {
    return `Now chain them: play ${what} into the next downbeat, with no full beats of rest — just a quick breath, then back in. Through the whole passage.`;
  }
  return `Now chain them: play ${what} into the next downbeat, then rest ${fullBeatWord(step.restBeats)} before coming back in. Through the whole passage.`;
}

// A count-along illustration (assumes 4/4, running 16ths) for a chain level:
// each chunk's beats counted "1 e & a", landing on the next downbeat, then the
// rest beats. Capped to one bar's worth of chunks + an ellipsis. EXAMPLE only —
// macro marks are beats, so we don't know the real subdivision.
function macroCountAlong(chunkSize: number, restBeats: number, beatCount: number): string {
  const restTail = restBeats > 0 ? ', ' + Array(restBeats).fill('rest').join(', ') : '';
  const lines: string[] = [];
  const maxLines = 4;
  let start = 0;
  while (start < beatCount && lines.length < maxLines) {
    const len = Math.min(chunkSize, beatCount - start);
    const parts: string[] = [];
    for (let j = 0; j < len; j++) parts.push(`${((start + j) % 4) + 1} e & a`);
    parts.push(String(((start + len) % 4) + 1)); // landing downbeat
    lines.push(parts.join(' ') + restTail);
    start += chunkSize;
  }
  if (start < beatCount) lines.push('…');
  return lines.join('\n');
}

// Key for auto-opening the ⓘ once-ever the first time the user reaches each new
// teaching beat of the method. Keyed by CHUNK SIZE so the instructions re-show
// the first time through each newly-doubled size — the user re-learns the loop
// at every chunk size, just like at the original size (the count-along example
// reflects the current chunk size). Within a given size each card still fires
// only once:
//   - 'isolate'              — the very first rep (drill the first single beat)
//   - 'chain-<size>-<rest>'  — chaining at each rest count, per chunk size:
//                              chain with rests, then the rest gets dropped,
//                              and dropped again, down to none
//   - 'chunk-doubled-<size>' — the first isolate at each newly-doubled size
//   - 'isolate-whole'        — the final whole-passage step
export function macroInfoKey(step: MacroStep): string {
  if (step.kind === 'isolate') {
    if (step.chunkCount === 1) return 'isolate-whole';
    if (step.chunkSize === 1) return 'isolate';
    return `chunk-doubled-${step.chunkSize}`;
  }
  return `chain-${step.chunkSize}-${step.restBeats}`;
}

/** Short title for the ⓘ tip card. */
export function formatMacroInfoTitle(step: MacroStep | undefined): string {
  if (!step) return '';
  if (step.kind === 'isolate') {
    if (step.chunkCount === 1) return 'The whole passage';
    return step.chunkSize === 1 ? 'Drill this chunk' : 'Bigger chunks now';
  }
  if (step.restBeats === 0) return 'No full rests';
  // First chain (full rests) reads "Chain it together"; each later rest-drop
  // reads "Now one less rest".
  return step.restBeats === initialRests(step.chunkSize)
    ? 'Chain it together'
    : 'Now one less rest';
}

/** Expanded "ⓘ" explanation for the current step (on-demand popup). */
export function formatMacroInfo(step: MacroStep | undefined, beatCount: number): string {
  if (!step) return '';

  if (step.kind === 'isolate') {
    if (step.chunkCount === 1) {
      return 'It may not be perfect, but hopefully as the days go by, this step should feel better and better.';
    }
    if (step.chunkSize > 1) {
      return `The chunks just grew — you're now drilling bigger pieces, ${step.chunkSize} beats at a time. Drill each one until it's comfortable, then you'll chain them with rests again, just like before.`;
    }
    return 'Play from the beginning of the chunk to the first note of the next. Repeat this chunk until it feels comfortable — but the moment you feel your autopilot kicking in, move on to the next.';
  }

  const intro =
    step.restBeats === 0
      ? 'No full rests now — just a quick breath between chunks. As an example, for running 16ths, the pattern would be:'
      : 'Play through the passage chunk by chunk, resting the given beats between each. As an example, for running 16ths, the pattern would be:';
  return `${intro}\n\n${macroCountAlong(step.chunkSize, step.restBeats, beatCount)}\n\nRepeat this until it feels relatively easy before moving to the next step.`;
}

/** Short label for headers / logs: "Isolate · chunk 2" or "Chain · rest 1". */
export function formatMacroLabel(step: MacroStep | undefined): string {
  if (!step) return '';
  if (step.kind === 'isolate') {
    return step.chunkCount === 1
      ? 'Whole passage'
      : `Isolate ${step.chunkSize}-beat · ${step.chunkIndex + 1}/${step.chunkCount}`;
  }
  return step.restBeats === 0
    ? `Chain ${step.chunkSize}-beat · no rest`
    : `Chain ${step.chunkSize}-beat · rest ${step.restBeats}`;
}

/**
 * Chain step: flag the start of each chunk (every `chunkSize` units) plus the
 * final mark, so the green arrows show the grouping/sequence.
 */
export function chunkBoundaryMarks(marks: Marker[], chunkSize: number): Marker[] {
  if (marks.length === 0) return [];
  const last = marks.length;
  return marks.filter((m) => (m.index - 1) % chunkSize === 0 || m.index === last);
}

/**
 * Isolate step: flag just the one chunk being drilled — its start mark and the
 * downbeat it lands on (the first note of the next beat). So the green arrows
 * bracket exactly the chunk to repeat.
 */
export function isolateChunkMarks(
  marks: Marker[],
  chunkSize: number,
  chunkIndex: number,
): Marker[] {
  if (marks.length === 0) return [];
  const startIdx = chunkIndex * chunkSize + 1;
  const endIdx = Math.min((chunkIndex + 1) * chunkSize + 1, marks.length);
  const wanted = new Set(startIdx === endIdx ? [startIdx] : [startIdx, endIdx]);
  return marks.filter((m) => wanted.has(m.index));
}
