// Download a community exercise as the branded PDF (native). Reuses the
// expo-print pipeline the Rhythm Builder uses, driven by a stored config.

import { exportExercisePdf } from '@/lib/export/exportExercisePdf';

import { resolveExerciseConfig, type ExerciseConfig } from './exerciseConfig';

export function downloadExercisePdf(title: string, config: ExerciseConfig): void {
  const { pitches, keySignature, clef, patterns } = resolveExerciseConfig(config);
  if (pitches.length === 0) return;
  const finalTitle = title.trim().length > 0 ? title.trim() : 'Exercise';
  void exportExercisePdf(finalTitle, pitches, keySignature, clef, patterns);
}
