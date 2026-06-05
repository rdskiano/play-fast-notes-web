// Native (iOS) PDF export for Rhythm Builder exercises.
//
// The web sibling (rhythm-builder.tsx, web branch) opens a print popup via
// window.print(); native has no popup, so we render the SAME branded
// `buildExerciseHtml` document to a PDF file with expo-print, then hand it to
// the iOS share sheet (expo-sharing) so the user can save it to Files, AirDrop
// it, or print it. Ported from the pre-merge iPad app's exportExercisePdf.ts —
// a recipe already proven to render the CDN-loaded abcjs staves correctly.

import { Alert } from 'react-native';

import type { Clef, KeySignature, Pitch } from '@/lib/music/pitch';
import type { RhythmPattern } from '@/lib/strategies/rhythmPatterns';

import { buildExerciseHtml } from './buildExerciseHtml';

export async function exportExercisePdf(
  title: string,
  pitches: Pitch[],
  keySignature: KeySignature,
  clef: Clef,
  patterns: RhythmPattern[],
): Promise<void> {
  const html = buildExerciseHtml(title, pitches, keySignature, clef, patterns);

  // expo-print / expo-sharing are native modules. They're in package.json and
  // autolink, so a fresh build includes them — but an OTA JS update delivered
  // to an OLDER binary that predates them would otherwise hard-crash. Resolve
  // them defensively and degrade to an explanatory alert instead.
  let Print: typeof import('expo-print');
  let Sharing: typeof import('expo-sharing');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Print = require('expo-print');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Sharing = require('expo-sharing');
  } catch {
    Alert.alert(
      'Update needed',
      'PDF export needs the latest app version. It will be available after the next build.',
    );
    return;
  }

  try {
    const { uri } = await Print.printToFileAsync({
      html,
      width: 612, // US Letter at 72 dpi (8.5in × 11in)
      height: 792,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('PDF saved', `Exported to:\n${uri}`);
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `${title} — Exercises`,
    });
  } catch (e) {
    Alert.alert(
      'Could not export PDF',
      e instanceof Error ? e.message : 'Please try again.',
    );
  }
}
