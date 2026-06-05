// Web stub. On web, Rhythm Builder exports the PDF inline via a print popup
// (window.print) right in rhythm-builder.tsx, so this helper is never called.
// It exists only so the shared rhythm-builder.tsx import resolves on web.

import type { Clef, KeySignature, Pitch } from '@/lib/music/pitch';
import type { RhythmPattern } from '@/lib/strategies/rhythmPatterns';

export async function exportExercisePdf(
  _title: string,
  _pitches: Pitch[],
  _keySignature: KeySignature,
  _clef: Clef,
  _patterns: RhythmPattern[],
): Promise<void> {
  // Web uses the inline window.print() path; this should never run.
  throw new Error('exportExercisePdf is native-only; web prints inline.');
}
