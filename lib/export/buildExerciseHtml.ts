import type { Clef, KeySignature, Pitch } from '@/lib/music/pitch';
import { buildExerciseAbc } from '@/lib/notation/buildExerciseAbc';
import type { RhythmPattern } from '@/lib/strategies/rhythmPatterns';

const ABCJS_CDN = 'https://unpkg.com/abcjs@6/dist/abcjs-basic-min.js';

export function buildExerciseHtml(
  title: string,
  pitches: Pitch[],
  keySignature: KeySignature,
  clef: Clef,
  patterns: RhythmPattern[],
): string {
  const exercises = patterns.map((pattern) => {
    const abc = buildExerciseAbc(pitches, keySignature, clef, pattern);
    const escapedAbc = JSON.stringify(abc);
    const id = `ex-${pattern.id}`;
    return { id, pattern, escapedAbc };
  });

  const renderCalls = exercises
    .map(
      (ex) => `
    try {
      ABCJS.renderAbc('${ex.id}', ${ex.escapedAbc}, {
        scale: 0.9,
        staffwidth: 680,
        paddingleft: 0,
        paddingright: 0,
        paddingtop: 2,
        paddingbottom: 2,
        responsive: 'resize',
      });
    } catch(e) {
      document.getElementById('${ex.id}').innerHTML = '<p style="color:red">Error: ' + e.message + '</p>';
    }`,
    )
    .join('\n');

  const exerciseDivs = exercises
    .map(
      (ex) => `
      <div class="exercise">
        <div class="ex-header">
          <span class="ex-id">#${ex.pattern.id}</span>
        </div>
        <div id="${ex.id}" class="notation"></div>
      </div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { margin: 0.6in; size: letter; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', sans-serif;
    margin: 0;
    padding: 24px;
    color: #111;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitle { font-size: 13px; color: #666; margin-bottom: 16px; }
  .exercise {
    page-break-inside: avoid;
    margin-bottom: 12px;
    border-bottom: 1px solid #e0e0e0;
    padding-bottom: 8px;
  }
  .ex-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 2px;
  }
  .ex-id { font-weight: 800; font-size: 13px; }
  .ex-time { font-size: 13px; font-weight: 600; }
  .ex-tokens { font-size: 11px; color: #999; font-family: monospace; }
  .notation { width: 100%; }
  .notation svg { max-width: 100%; display: block; }
</style>
<script src="${ABCJS_CDN}"></script>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="subtitle">${escapeHtml(keySignature.label)} · ${escapeHtml(clef.label)} clef · ${pitches.length} notes · ${patterns.length} exercises</p>
  ${exerciseDivs}
<script>
function render() {
  ${renderCalls}
}
if (typeof ABCJS !== 'undefined') { render(); }
else { window.addEventListener('load', render); }
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
