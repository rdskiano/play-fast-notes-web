// Interleaved Click-Up 2 (beta) — Molly Gebrian's "interleaved clicking up #2"
// (Learn Faster, Perform Better, ch. 16). Where Interleaved Click-Up learns a
// passage, ICU2 trains playing several passages clean at tempo on the FIRST
// try: rotate 3-5 passages (7-10 short ones) through seven rounds whose tempo
// jumps grow each time, so every return to a passage is a harder test.
//
// The round ladder is fixed on purpose (v1 ships her exact recipe).

export type Icu2RoundType = 'inc' | 'land3' | 'land2' | 'cold';

export type Icu2Round = {
  label: string;
  // Short line shown on the between-rounds card.
  intro: string;
  type: Icu2RoundType;
  inc?: number;
};

export const ICU2_ROUNDS: Icu2Round[] = [
  { label: 'Round 1 · climb by 5s', intro: 'Every passage climbs from its start tempo to its goal by 5s.', type: 'inc', inc: 5 },
  { label: 'Round 2 · climb by 10s', intro: 'Same rotation, bigger jumps: by 10s.', type: 'inc', inc: 10 },
  { label: 'Round 3 · climb by 20s', intro: 'Bigger again: by 20s.', type: 'inc', inc: 20 },
  { label: 'Round 4 · climb by 30s', intro: 'By 30s. Getting close to first-try territory.', type: 'inc', inc: 30 },
  { label: 'Round 5 · start · middle · goal', intro: 'Just three landmarks now: start, middle, goal.', type: 'land3' },
  { label: 'Round 6 · start · goal', intro: 'Two tempos: start, then straight to the goal.', type: 'land2' },
  { label: 'Round 7 · at tempo, cold', intro: 'The payoff: each passage once, at tempo, first try.', type: 'cold' },
];

// The tempo sequence one passage plays in one round. `top` is the passage's
// goal tempo, or its saved ceiling for the day if a miss capped it. Climbs
// always land exactly on `top` (same convention as Click-Up / Tempo Ladder).
export function icu2ClimbTempos(start: number, top: number, round: Icu2Round): number[] {
  if (top <= start) return [top];
  if (round.type === 'cold') return [top];
  if (round.type === 'land2') return [start, top];
  if (round.type === 'land3') {
    const mid = Math.round((start + top) / 2);
    // Dedupe: with a tiny start-to-top range the middle can equal an endpoint.
    return [...new Set([start, mid, top])];
  }
  const inc = round.inc ?? 5;
  const out: number[] = [];
  for (let t = start; t < top; t += inc) out.push(t);
  out.push(top);
  return out;
}

// Total reps across the whole protocol for the picker's honesty line.
export function icu2TotalReps(pairs: Array<{ start: number; goal: number }>): number {
  let reps = 0;
  for (const p of pairs) {
    for (const round of ICU2_ROUNDS) reps += icu2ClimbTempos(p.start, p.goal, round).length;
  }
  return reps;
}

// Rough session length. ~18s per rep averages a short played line plus the
// tempo change; it's an estimate for the picker, not a promise.
export function icu2EstimatedMinutes(totalReps: number): number {
  return Math.max(1, Math.round((totalReps * 18) / 60));
}

// Default start tempo from a known goal: half, rounded to a clean 5.
export function icu2DefaultStart(goal: number): number {
  return Math.max(30, Math.round(goal / 2 / 5) * 5);
}
