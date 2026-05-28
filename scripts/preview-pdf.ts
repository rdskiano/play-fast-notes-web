// Dev-only harness for visualizing the rhythm-builder PDF export.
// Writes a sample HTML to public/_pdf-preview.html so it can be viewed at
// http://localhost:8081/_pdf-preview.html and screenshotted.
//
// Usage: npx tsx scripts/preview-pdf.ts

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildExerciseHtml } from '../lib/export/buildExerciseHtml';
import { CLEFS, KEY_SIGNATURES, makePitch } from '../lib/music/pitch';
import { patternsByGrouping } from '../lib/strategies/rhythmPatterns';

const pitches = [60, 62, 64, 65].map((m) => makePitch(m)); // C D E F
const keySig = KEY_SIGNATURES.find((k) => k.id === 'C')!;
const clef = CLEFS.find((c) => c.id === 'treble')!;
const patterns = patternsByGrouping(4).slice(0, 6);

const html = buildExerciseHtml(
  'Rhythmic exercise — C major scale fragment',
  pitches,
  keySig,
  clef,
  patterns,
);

const out = resolve(__dirname, '..', 'public', '_pdf-preview.html');
writeFileSync(out, html, 'utf8');
console.log('Wrote', out);
