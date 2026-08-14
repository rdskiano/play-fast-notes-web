import {
  keySignatureLetterAccidentals,
  pitchLetter,
  type Accidental,
  type Clef,
  type KeySignature,
  type Pitch,
} from '@/lib/music/pitch';

const ACC_PREFIX: Record<Accidental, string> = {
  natural: '=',
  sharp: '^',
  flat: '_',
  doubleSharp: '^^',
  doubleFlat: '__',
};

type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

function toAbcBody(letter: Letter, octave: number): string {
  if (octave >= 5) {
    return letter.toLowerCase() + "'".repeat(octave - 5);
  }
  return letter + ','.repeat(4 - octave);
}

export type EntrySequenceAbc = {
  abc: string;
  /**
   * Char offset (into `abc`) of each sequence item's token. Items of a
   * merged rest run share the same offset — used to map an abcjs click
   * back to a sequence index.
   */
  itemStartChars: number[];
  /**
   * Rendered element ordinal (notes + rests, document order) per item —
   * used to translate an item index into the element abcjs draws, since
   * a merged rest run renders as ONE element.
   */
  elementIndexOfItem: number[];
};

/**
 * The Exercise Builder's pitch-entry staff. Unlike the plain uniform-value
 * staff, this renders the sequence at the SLOT resolution the builder
 * actually means: notes as running sixteenths beamed per `grouping` chunk
 * (one chunk = one generated measure), and consecutive rest placeholders
 * MERGED into a single rest at their combined value — so tapping the 8th
 * rest palette key (2 slots) reads back as one 8th rest, not two loose
 * placeholders. Accidental rules match buildPitchAbc (out-of-key spellings
 * reprint every time so edits stay visible).
 */
export function buildEntrySequenceAbc(
  pitches: Pitch[],
  keySignature: KeySignature,
  clef: Clef,
  grouping: number,
): EntrySequenceAbc {
  const head =
    ['X:1', 'M:none', 'L:1/16', `K:${keySignature.abcKey} clef=${clef.abcClef}`].join(
      '\n',
    ) + '\n';
  if (pitches.length === 0) {
    return { abc: `${head}x8|`, itemStartChars: [], elementIndexOfItem: [] };
  }

  const keySigDefaults = keySignatureLetterAccidentals(keySignature) as Record<
    Letter,
    Accidental
  >;
  const active = new Map<string, Accidental>();

  let body = '';
  const itemStartChars: number[] = [];
  const elementIndexOfItem: number[] = [];
  let elemCount = 0;
  let i = 0;
  while (i < pitches.length) {
    if (i > 0 && i % grouping === 0) body += ' ';
    const p = pitches[i];
    const start = head.length + body.length;
    if (p.rest) {
      let j = i;
      while (j < pitches.length && pitches[j].rest) j++;
      const len = j - i;
      body += len === 1 ? 'z' : `z${len}`;
      for (let k = i; k < j; k++) {
        itemStartChars.push(start);
        elementIndexOfItem.push(elemCount);
      }
      elemCount++;
      i = j;
      continue;
    }
    const { letter, octave } = pitchLetter(p);
    const L = letter as Letter;
    const key = `${L}:${octave}`;
    const want = p.accidental;
    const current = active.has(key) ? active.get(key)! : keySigDefaults[L];
    const needed = want !== current;
    const outOfKey = want !== keySigDefaults[L];
    const prefix = needed || outOfKey || p.courtesy ? ACC_PREFIX[want] : '';
    if (needed) active.set(key, want);
    body += prefix + toAbcBody(L, octave);
    itemStartChars.push(start);
    elementIndexOfItem.push(elemCount);
    elemCount++;
    i++;
  }
  return { abc: `${head}${body}|`, itemStartChars, elementIndexOfItem };
}

export function buildPitchAbc(
  pitches: Pitch[],
  keySignature: KeySignature,
  clef: Clef,
  opts?: { beamGroup?: number; barEveryGroups?: number },
): string {
  // beamGroup > 0 renders the notes as sixteenths beamed in groups of that
  // size (e.g. 4 → the Bumblebee run reads as four-note beamed groups). Default
  // (0) keeps the original meterless quarter-note layout for the pitch-entry
  // staff. barEveryGroups > 0 inserts a barline every N beamed groups so abcjs
  // can WRAP the line into measures — without barlines the whole phrase is one
  // un-wrappable measure that overflows a narrow card.
  const beamGroup = opts?.beamGroup ?? 0;
  const barEveryGroups = opts?.barEveryGroups ?? 0;
  const head = [
    'X:1',
    'M:none',
    `L:${beamGroup > 0 ? '1/16' : '1/4'}`,
    `K:${keySignature.abcKey} clef=${clef.abcClef}`,
  ].join('\n');
  if (pitches.length === 0) return `${head}\nx8|`;

  // Track accidentals per (letter, octave). A sharp printed in one octave
  // doesn't carry to the same letter in another octave — every out-of-key
  // note prints its own accidental on first appearance in that octave.
  const keySigDefaults = keySignatureLetterAccidentals(keySignature) as Record<
    Letter,
    Accidental
  >;
  const active = new Map<string, Accidental>();

  const tokens: string[] = [];
  for (const p of pitches) {
    if (p.rest) {
      // Rest placeholder — renders as a rest of the staff's uniform note
      // value. No accidental bookkeeping; a rest can't carry a spelling.
      tokens.push('z');
      continue;
    }
    const { letter, octave } = pitchLetter(p);
    const L = letter as Letter;
    const key = `${L}:${octave}`;
    const want = p.accidental;
    const current = active.has(key) ? active.get(key)! : keySigDefaults[L];
    const needed = want !== current;
    // Unlike the per-measure exercise staff, every note here lives in one
    // big meterless measure, so an out-of-key accidental would normally only
    // print on its first appearance and stay suppressed thereafter. The user
    // reads that as "my re-spelling vanished." Reprint the accidental on every
    // out-of-key note (and every forced/courtesy one) so edits are always
    // visible; `active` still tracks the sounding spelling so a return to the
    // key default correctly prints a natural.
    const outOfKey = want !== keySigDefaults[L];
    const prefix = needed || outOfKey || p.courtesy ? ACC_PREFIX[want] : '';
    if (needed) active.set(key, want);
    tokens.push(prefix + toAbcBody(L, octave));
  }
  if (beamGroup > 0) {
    // Concatenate notes within a group (no space → abcjs beams them) and put a
    // space between groups (breaks the beam).
    const groups: string[] = [];
    for (let i = 0; i < tokens.length; i += beamGroup) {
      groups.push(tokens.slice(i, i + beamGroup).join(''));
    }
    if (barEveryGroups > 0) {
      const parts: string[] = [];
      groups.forEach((g, i) => {
        parts.push(g);
        if (i < groups.length - 1 && (i + 1) % barEveryGroups === 0) parts.push('|');
      });
      return `${head}\n${parts.join(' ')}|`;
    }
    return `${head}\n${groups.join(' ')}|`;
  }
  return `${head}\n${tokens.join(' ')}|`;
}
