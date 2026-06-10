// Micro-Chaining (note-by-note) step generation.
//
// The user marks each note of a short fragment on the score (a "link" of the
// chain). The app then builds the fragment up one note at a time, always at
// the performance tempo, in one of three modes. Unlike Interleaved Click-Up
// there's no tempo ladder and no interleaving — just a contiguous run of notes
// that grows by one each step.
//
// Marks are numbered 1..N (same shape as Click-Up's Marker). A step's
// `activeIndices` is the contiguous run of note numbers the user plays at that
// step; the play screen highlights exactly those marks.

import type { Marker } from '@/lib/db/repos/passages';

export type MicroMode = 'forward' | 'backward' | 'problem';

export type MicroStep = {
  activeIndices: number[];
};

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/**
 * Build the ordered step list for a Micro-Chaining session.
 *
 * - forward: start on note 1, add one note to the END each step → [1], [1,2], … [1..N].
 * - backward: start on note N, add one note to the FRONT each step → [N], [N-1,N], … [1..N].
 * - problem: start on the user-chosen problem span [a, b] (two notes, adjacent
 *   or not), then expand outward, alternating one note before / one note after
 *   until the whole fragment is rebuilt. `problemA` / `problemB` are the two
 *   1-based note indices the user tapped (order doesn't matter).
 */
export function generateMicroSteps(
  mode: MicroMode,
  noteCount: number,
  problemA?: number,
  problemB?: number,
): MicroStep[] {
  const N = noteCount;
  if (N < 1) return [];

  if (mode === 'forward') {
    return range(1, N).map((k) => ({ activeIndices: range(1, k) }));
  }

  if (mode === 'backward') {
    return range(1, N).map((k) => ({ activeIndices: range(N - k + 1, N) }));
  }

  // problem — start on the chosen span [a, b] (default to the first two notes
  // if somehow unset), then grow outward both ways.
  if (N < 2) return [{ activeIndices: [1] }];
  const a = problemA ?? 1;
  const b = problemB ?? (a + 1 <= N ? a + 1 : a);
  let lo = Math.max(1, Math.min(a, b));
  let hi = Math.min(N, Math.max(a, b));
  const steps: MicroStep[] = [{ activeIndices: range(lo, hi) }];
  // Alternate expanding before / after. When one side is maxed, keep growing
  // the open side. Each iteration always advances exactly one side, so this
  // terminates once the run spans the whole fragment.
  let expandBefore = true;
  while (lo > 1 || hi < N) {
    if (expandBefore && lo > 1) lo--;
    else if (!expandBefore && hi < N) hi++;
    else if (lo > 1) lo--;
    else hi++;
    steps.push({ activeIndices: range(lo, hi) });
    expandBefore = !expandBefore;
  }
  return steps;
}

/**
 * The marks to highlight for a step: just the two ENDPOINTS of the active run
 * (first + current), like Click-Up's pair — not every note in between. One mark
 * when the run is a single note (step 1). This is what the play screen shows so
 * the user reads "play from this note to that note."
 */
export function activeSpanMarks(marks: Marker[], step: MicroStep | undefined): Marker[] {
  if (!step || step.activeIndices.length === 0) return [];
  const lo = step.activeIndices[0];
  const hi = step.activeIndices[step.activeIndices.length - 1];
  const wanted = new Set(lo === hi ? [lo] : [lo, hi]);
  return marks.filter((m) => wanted.has(m.index));
}

/** Short human label for the active run, e.g. "Note 3" or "Notes 1–4". */
export function formatActiveNotes(step: MicroStep | undefined): string {
  if (!step || step.activeIndices.length === 0) return '';
  const lo = step.activeIndices[0];
  const hi = step.activeIndices[step.activeIndices.length - 1];
  return lo === hi ? `Note ${lo}` : `Notes ${lo}–${hi}`;
}
