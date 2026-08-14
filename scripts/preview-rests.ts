// Dev helper: render the rest-entry transformation (fork A, confirmed
// 2026-08-12) through the REAL notation code so it can be eyeballed in a
// browser without going through the app UI. Writes public/_rest-preview.html
// (served by the dev server at /_rest-preview.html). Run:
//   npx tsx scripts/preview-rests.ts
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

import { buildExerciseAbc } from '../lib/notation/buildExerciseAbc';
import { buildEntrySequenceAbc } from '../lib/notation/buildPitchAbc';
import { CLEFS, KEY_SIGNATURES, spellForKey, type Pitch } from '../lib/music/pitch';
import { patternsByGrouping } from '../lib/strategies/rhythmPatterns';

const key = KEY_SIGNATURES.find((k) => k.id === 'C')!;
const clef = CLEFS[0];

// Frenzy m45 shape: an eighth rest at the running-sixteenth size = TWO
// rest placeholders, then a run of sixteenths (c d e f g a g f e d c B c d).
const rest = (): Pitch => ({ ...spellForKey(71, key, true), rest: true });
const seq: Pitch[] = [
  rest(),
  rest(),
  ...[60, 62, 64, 65, 67, 69, 67, 65, 64, 62, 60, 59, 60, 62].map((m) =>
    spellForKey(m, key, true),
  ),
];

const entry = buildEntrySequenceAbc(seq, key, clef, 4);
const patterns = patternsByGrouping(4);

const sections = [
  `<h2>Entry staff (running 16ths, 2 leading rest slots merged → one 8th rest)</h2><div class="staff" data-abc="${encodeURIComponent(entry.abc)}"></div>`,
  ...patterns.map(
    (p) =>
      `<h2>#${p.id} · ${p.timeSig} · [${p.notes.join(' ')}]</h2><div class="staff" data-abc="${encodeURIComponent(
        buildExerciseAbc(seq, key, clef, p),
      )}"></div>`,
  ),
].join('\n');

const abcjs = readFileSync(
  join(__dirname, '..', 'node_modules', 'abcjs', 'dist', 'abcjs-basic-min.js'),
  'utf8',
);

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rest preview</title>
<style>body{font-family:sans-serif;max-width:900px;margin:24px auto}h2{font-size:13px;margin:18px 0 4px}</style>
<script>${abcjs}</script></head><body>
<h1>Exercise Builder rests — fork A transformation preview</h1>
${sections}
<script>
document.querySelectorAll('.staff').forEach(function(el){
  ABCJS.renderAbc(el, decodeURIComponent(el.dataset.abc), {staffwidth: 860});
});
</script></body></html>`;

writeFileSync(join(__dirname, '..', 'public', '_rest-preview.html'), html);
// Also print the raw ABC for the first few patterns for quick inspection.
console.log('entry:', entry.abc.split('\n').pop());
console.log('itemStartChars:', JSON.stringify(entry.itemStartChars));
console.log('elementIndexOfItem:', JSON.stringify(entry.elementIndexOfItem));
for (const p of patterns.slice(0, 6)) {
  console.log(
    `#${p.id} ${p.timeSig} [${p.notes.join(' ')}]:`,
    buildExerciseAbc(seq, key, clef, p).split('\n').pop(),
  );
}
console.log('wrote public/_rest-preview.html');
