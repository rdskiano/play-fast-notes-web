// Resolve a stored rhythm-builder config (the JSON in exercises.config_json
// and in community_exercises.config_json) back into the objects the notation
// renderer + PDF export need. Mirrors the resolution rhythm-builder.tsx does
// on load, kept in one place so the community screens render/print exactly
// what the Builder produced.

import {
  CLEFS,
  INSTRUMENTS,
  KEY_SIGNATURES,
  type Clef,
  type Instrument,
  type KeySignature,
  type Pitch,
} from '@/lib/music/pitch';
import { buildExerciseAbc } from '@/lib/notation/buildExerciseAbc';
import {
  patternsByGrouping,
  type Grouping,
  type RhythmPattern,
} from '@/lib/strategies/rhythmPatterns';

export type ExerciseConfig = {
  instrumentId?: string;
  keyId?: string;
  clefId?: string;
  grouping?: number;
  pitches?: Pitch[];
  useSharps?: boolean;
};

export type ResolvedConfig = {
  instrument: Instrument;
  keySignature: KeySignature;
  clef: Clef;
  grouping: Grouping;
  pitches: Pitch[];
  patterns: RhythmPattern[];
};

export function parseExerciseConfig(json: string | null | undefined): ExerciseConfig {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as ExerciseConfig) : {};
  } catch {
    return {};
  }
}

export function resolveExerciseConfig(config: ExerciseConfig): ResolvedConfig {
  const keySignature =
    KEY_SIGNATURES.find((k) => k.id === config.keyId) ??
    KEY_SIGNATURES.find((k) => k.id === 'C') ??
    KEY_SIGNATURES[7];
  const clef = CLEFS.find((c) => c.id === config.clefId) ?? CLEFS[0];
  const instrument =
    INSTRUMENTS.find((i) => i.id === config.instrumentId) ?? INSTRUMENTS[0];
  const grouping: Grouping =
    typeof config.grouping === 'number' &&
    config.grouping >= 3 &&
    config.grouping <= 8
      ? (config.grouping as Grouping)
      : 4;
  const pitches = Array.isArray(config.pitches) ? config.pitches : [];
  return {
    instrument,
    keySignature,
    clef,
    grouping,
    pitches,
    patterns: patternsByGrouping(grouping),
  };
}

/** One ABC notation string per rhythm pattern — for in-app preview rendering. */
export function configToAbcs(config: ExerciseConfig): { pattern: RhythmPattern; abc: string }[] {
  const { pitches, keySignature, clef, patterns } = resolveExerciseConfig(config);
  if (pitches.length === 0) return [];
  return patterns.map((pattern) => ({
    pattern,
    abc: buildExerciseAbc(pitches, keySignature, clef, pattern),
  }));
}

/** True when the config has enough to render an exercise (pitches entered). */
export function configIsRenderable(config: ExerciseConfig): boolean {
  return Array.isArray(config.pitches) && config.pitches.length > 0;
}

/** Short label for browsing rows, e.g. "4-note grouping". */
export function groupingLabel(config: ExerciseConfig): string {
  const { grouping } = resolveExerciseConfig(config);
  return `${grouping}-note grouping`;
}

export function pitchCount(config: ExerciseConfig): number {
  return Array.isArray(config.pitches) ? config.pitches.length : 0;
}

/** "4-note grouping · 8 pitches" — derived, never asked of the contributor. */
// Instrument ids that clarinetists browse together as one "Clarinet" category
// in the community library. A and B♭ clarinet transpose differently (so they're
// distinct instruments for notation), but when browsing by instrument you look
// for "clarinet", not the specific pitch. This only affects the community
// display/grouping — never the stored instrument or its transposition.
const CLARINET_INSTRUMENT_IDS = new Set(['a_clarinet', 'bb_clarinet']);

export function communityInstrumentLabel(id: string | null): string | null {
  if (!id) return null;
  if (CLARINET_INSTRUMENT_IDS.has(id)) return 'Clarinet';
  return INSTRUMENTS.find((i) => i.id === id)?.label ?? id;
}

export function exerciseShapeLabel(config: ExerciseConfig): string {
  const n = pitchCount(config);
  return `${groupingLabel(config)} · ${n} ${n === 1 ? 'pitch' : 'pitches'}`;
}
