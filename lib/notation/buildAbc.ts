import type { RhythmPattern, RhythmToken } from '@/lib/strategies/rhythmPatterns';

/**
 * At L:1/32, each token's duration is a multiple of a 32nd note.
 */
const TOKEN_UNITS: Record<RhythmToken, number> = {
  h: 16,
  q: 8,
  'q.': 12,
  '8': 4,
  '8.': 6,
  '8t': 4,
  '16': 2,
  '16.': 3,
  '16t': 2,
  '32': 1,
  '32t': 1,
};

function isTriplet(token: RhythmToken): boolean {
  return token === '8t' || token === '16t' || token === '32t';
}

/**
 * Build an ABC notation string that renders a rhythm pattern as an
 * unpitched rhythm on a single pitch (middle B of the treble staff).
 *
 * Rules:
 * - Time signature from the pattern.
 * - Unit length L:1/32 so every token is an integer duration.
 * - Notes concatenated without whitespace so ABCJS auto-beams per meter.
 * - `beaming === '0'` forces spaces between every note → no beams.
 * - Consecutive triplet tokens are wrapped with a `(N` tuplet prefix,
 *   which ABCJS renders as a N:2 tuplet (the standard 3-in-2 for triplets).
 */
/**
 * Compute a Set of cumulative-duration positions (in ×3 units) where
 * beam-break spaces should be inserted. Handles regular meters (/4, /8)
 * and asymmetric meters (5/8, 7/8) by auto-detecting groupings that
 * align with note boundaries.
 */
export function computeBeatBoundaries(
  pattern: RhythmPattern,
  tsNum: number,
  tsDenom: number,
): Set<number> {
  const empty = new Set<number>();

  // /4 time: break every quarter note (8 units × 3 = 24)
  if (tsDenom === 4) {
    const b = 8 * 3;
    const s = new Set<number>();
    const totalUnits = tsNum * 8;
    for (let pos = b; pos < totalUnits * 3; pos += b) s.add(pos);
    return s;
  }

  // 5/8 and 7/8: try asymmetric groupings, pick the first where
  // every boundary falls exactly between two notes.
  if ((tsNum === 5 || tsNum === 7) && tsDenom === 8) {
    const noteBounds: number[] = [];
    let acc = 0;
    for (const t of pattern.notes) {
      acc += TOKEN_UNITS[t] ?? 0;
      noteBounds.push(acc);
    }
    const boundsSet = new Set(noteBounds);
    const candidates =
      tsNum === 5
        ? [[12, 20], [8, 20]]
        : [[12, 20, 28], [8, 20, 28], [8, 16, 28]];
    for (const cand of candidates) {
      if (cand.every((b) => boundsSet.has(b))) {
        return new Set(cand.map((b) => b * 3));
      }
    }
    // No grouping fits cleanly — fall through to per-eighth
  }

  // /8 time with ≤4 notes (excluding 5/8 and 7/8 handled above):
  // beam whole measure together
  if (tsDenom === 8 && pattern.notes.length <= 4) return empty;

  // Compound meters (6/8, 9/8, 12/8): beat = dotted quarter = 12 units
  if (tsDenom === 8 && tsNum % 3 === 0 && tsNum >= 6) {
    const b = 12 * 3;
    const s = new Set<number>();
    const totalUnits = tsNum * 4;
    for (let pos = b; pos < totalUnits * 3; pos += b) s.add(pos);
    return s;
  }

  // Simple /8 time (3/8 with >4 notes, etc.): break every eighth (4 units)
  if (tsDenom === 8) {
    const b = 4 * 3;
    const s = new Set<number>();
    const totalUnits = tsNum * 4;
    for (let pos = b; pos < totalUnits * 3; pos += b) s.add(pos);
    return s;
  }

  return empty;
}

export function buildRhythmAbc(pattern: RhythmPattern): string {
  const noBeam = pattern.beaming === '0';
  const pitch = 'd';

  // Compute beat-boundary positions (in ×3 units for triplet compat).
  // Spaces are inserted at these cumulative-duration marks.
  const tsParts = pattern.timeSig.split('/');
  const tsNum = parseInt(tsParts[0] ?? '4', 10);
  const tsDenom = parseInt(tsParts[1] ?? '4', 10);

  const beatBounds3 = computeBeatBoundaries(pattern, tsNum, tsDenom);

  // Pre-scan to group consecutive triplet tokens in groups of 3.
  // A run of 6 triplets becomes two (3) groups, not one (6).
  type Group = { start: number; end: number; triplet: boolean };
  const groups: Group[] = [];
  let i = 0;
  while (i < pattern.notes.length) {
    const t = pattern.notes[i];
    if (isTriplet(t)) {
      let j = i;
      while (j < pattern.notes.length && isTriplet(pattern.notes[j])) j++;
      const runLen = j - i;
      let pos = i;
      while (pos < j) {
        const chunkEnd = Math.min(pos + 3, j);
        groups.push({ start: pos, end: chunkEnd - 1, triplet: true });
        pos = chunkEnd;
      }
      i = j;
    } else {
      groups.push({ start: i, end: i, triplet: false });
      i++;
    }
  }

  let body = '';
  let cumDur3 = 0;
  let noteIdx = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    let groupSpaced = false;
    if (gi > 0 && !noBeam && noteIdx > 0) {
      const prevGroup = groups[gi - 1];
      if (prevGroup.triplet !== g.triplet && tsDenom !== 4) {
        body += ' ';
        groupSpaced = true;
      } else if (
        g.triplet &&
        cumDur3 > 0 &&
        beatBounds3.has(cumDur3)
      ) {
        body += ' ';
        groupSpaced = true;
      }
    }
    if (g.triplet) {
      const count = g.end - g.start + 1;
      body += `(${count}`;
    }
    for (let k = g.start; k <= g.end; k++) {
      const token = pattern.notes[k];
      const dur = TOKEN_UNITS[token];

      if (
        !noBeam &&
        !g.triplet &&
        !groupSpaced &&
        noteIdx > 0 &&
        cumDur3 > 0 &&
        beatBounds3.has(cumDur3)
      ) {
        body += ' ';
      }
      groupSpaced = false;

      body += pitch + String(dur);
      if (noBeam && k < g.end) body += ' ';
      cumDur3 += g.triplet ? dur * 2 : dur * 3;
      noteIdx++;
    }
    if (noBeam && gi < groups.length - 1) body += ' ';
  }

  const head = ['X:1', `M:${pattern.timeSig}`, 'L:1/32', 'K:C'].join('\n');
  return `${head}\n|${body}|`;
}
