import {
  keySignatureLetterAccidentals,
  pitchLetter,
  type Accidental,
  type Clef,
  type KeySignature,
  type Pitch,
} from '@/lib/music/pitch';
import type { RhythmPattern, RhythmToken } from '@/lib/strategies/rhythmPatterns';
import { computeBeatBoundaries } from './buildAbc';

const ACC_PREFIX: Record<Accidental, string> = {
  natural: '=',
  sharp: '^',
  flat: '_',
  doubleSharp: '^^',
  doubleFlat: '__',
};

type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

// Duration of each rhythm token, in 32nd-note units.
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

function toAbcBody(letter: Letter, octave: number): string {
  if (octave >= 5) {
    return letter.toLowerCase() + "'".repeat(octave - 5);
  }
  return letter + ','.repeat(4 - octave);
}

type TokenGroup = { start: number; end: number; triplet: boolean };

function groupTriplets(tokens: RhythmToken[]): TokenGroup[] {
  const groups: TokenGroup[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (isTriplet(tokens[i])) {
      let j = i;
      while (j < tokens.length && isTriplet(tokens[j])) j++;
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
  return groups;
}

/**
 * Build an ABC exercise that applies `pattern` to the user's `pitches`,
 * chunking the pitches into groups of `pattern.grouping` — one measure
 * per chunk. Incomplete trailing chunks are dropped.
 */
export function buildExerciseAbc(
  pitches: Pitch[],
  keySignature: KeySignature,
  clef: Clef,
  pattern: RhythmPattern,
): string {
  const head = [
    'X:1',
    `M:${pattern.timeSig}`,
    'L:1/32',
    `K:${keySignature.abcKey} clef=${clef.abcClef}`,
  ].join('\n');

  const G = pattern.grouping;
  if (pitches.length === 0) {
    return `${head}\nz32|`;
  }

  const groups = groupTriplets(pattern.notes);
  const noBeam = pattern.beaming === '0';
  const numFullChunks = Math.floor(pitches.length / G);
  const leftover = pitches.length - numFullChunks * G;
  const measures: string[] = [];

  const tsParts = pattern.timeSig.split('/');
  const tsNum = parseInt(tsParts[0] ?? '4', 10);
  const tsDenom = parseInt(tsParts[1] ?? '4', 10);
  const beatBounds3 = computeBeatBoundaries(pattern, tsNum, tsDenom);

  const keySigDefaults = keySignatureLetterAccidentals(keySignature) as Record<
    Letter,
    Accidental
  >;
  const renderMeasure = (chunkPitches: Pitch[], stopAt: number) => {
    // Track in-measure accidentals per (letter, octave) — a sharp printed
    // in one octave does NOT carry to the same letter in another octave.
    const active = new Map<string, Accidental>();
    let body = '';
    let rendered = 0;
    let cumDur3 = 0;
    outer: for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      let groupSpaced = false;
      if (gi > 0 && !noBeam && rendered > 0) {
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
        if (rendered >= stopAt) break outer;
        const token = pattern.notes[k];
        const dur = TOKEN_UNITS[token];

        if (
          !noBeam &&
          !g.triplet &&
          !groupSpaced &&
          rendered > 0 &&
          cumDur3 > 0 &&
          beatBounds3.has(cumDur3)
        ) {
          body += ' ';
        }
        groupSpaced = false;

        const p = chunkPitches[rendered];
        const { letter, octave } = pitchLetter(p);
        const L = letter as Letter;
        const key = `${L}:${octave}`;
        const want = p.accidental;
        const current = active.has(key) ? active.get(key)! : keySigDefaults[L];
        const needed = want !== current;
        const prefix = needed || p.courtesy ? ACC_PREFIX[want] : '';
        if (needed) active.set(key, want);
        body += prefix + toAbcBody(L, octave);
        if (dur !== 1) body += String(dur);
        if (noBeam && k < g.end) body += ' ';
        cumDur3 += g.triplet ? dur * 2 : dur * 3;
        rendered++;
      }
      if (noBeam && gi < groups.length - 1) body += ' ';
    }
    return body;
  };

  for (let c = 0; c < numFullChunks; c++) {
    const chunk = pitches.slice(c * G, (c + 1) * G);
    measures.push(renderMeasure(chunk, G));
  }

  if (leftover > 0) {
    const tail = pitches.slice(numFullChunks * G);
    measures.push(renderMeasure(tail, leftover));
  }

  return `${head}\n|${measures.join('|')}|`;
}
