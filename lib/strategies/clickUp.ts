export type ClickUpStep = {
  phase: number;
  tempo: number;
  activeUnits: number[];
};

function tempoRange(start: number, goal: number, increment: number): number[] {
  const out: number[] = [];
  for (let t = start; t <= goal; t += increment) out.push(t);
  if (out.length === 0 || out[out.length - 1] !== goal) out.push(goal);
  return out;
}

function rangeInclusive(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

export function generateSteps(
  N: number,
  startTempo: number,
  goalTempo: number,
  increment: number,
): ClickUpStep[] {
  if (N < 1) return [];
  const tempos = tempoRange(startTempo, goalTempo, increment);
  const steps: ClickUpStep[] = [];

  // Phase 1: unit 1 alone, laddering tempos
  for (const t of tempos) {
    steps.push({ phase: 1, tempo: t, activeUnits: [1] });
  }

  // Phases 2..N: one step per tempo. Even-indexed tempos are rolling-window
  // steps; odd-indexed tempos are solo-k steps.
  for (let k = 2; k <= N; k++) {
    const cycleStarts: number[] = [1];
    for (let j = k - 1; j >= 2; j--) cycleStarts.push(j);

    tempos.forEach((t, i) => {
      if (i % 2 === 0) {
        const start = cycleStarts[Math.floor(i / 2) % cycleStarts.length];
        steps.push({ phase: k, tempo: t, activeUnits: rangeInclusive(start, k) });
      } else {
        steps.push({ phase: k, tempo: t, activeUnits: [k] });
      }
    });
  }

  return steps;
}

export function activePairMarkers(activeUnits: number[]): [number, number] {
  if (activeUnits.length === 0) return [1, 2];
  const lo = activeUnits[0];
  const hi = activeUnits[activeUnits.length - 1];
  return [lo, hi + 1];
}

// Direction of the build (beta). Gebrian: the method works equally well
// forward or backward — start from whichever end of the passage is harder,
// since the units you start with are the ones you revisit most.
export type ClickUpDirection = 'forward' | 'backward';

// The step engine numbers units in BUILD order (unit 1 = built first). On the
// score, forward build order matches the marked order; a backward build means
// build-unit 1 is the LAST marked unit. This maps build-order units to
// score-order unit numbers (ascending), so marker highlighting and the
// "UNITS a–b" label work unchanged in both directions.
export function mapUnitsToScore(
  activeUnits: number[],
  N: number,
  direction: ClickUpDirection | undefined,
): number[] {
  if (direction !== 'backward') return activeUnits;
  return activeUnits.map((u) => N + 1 - u).reverse();
}
