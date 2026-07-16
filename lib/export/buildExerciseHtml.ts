import type { Clef, KeySignature, Pitch } from '@/lib/music/pitch';
import { buildExerciseAbc } from '@/lib/notation/buildExerciseAbc';
import type { RhythmPattern } from '@/lib/strategies/rhythmPatterns';

const ABCJS_CDN = 'https://unpkg.com/abcjs@6/dist/abcjs-basic-min.js';

// Branding constants for the PDF — pinned to the production site so a
// printed/saved PDF shared as a marketing giveaway always points back to
// playfastnotes.com, regardless of which environment generated it.
const SITE_URL = 'https://playfastnotes.com';
const SITE_HOST = 'playfastnotes.com';
const LOGO_URL = `${SITE_URL}/icon-192.png`;
// Mirrors the app's primary tint (constants/theme.ts).
const BRAND = '#0a7ea4';
// Marketing tagline — shown beneath the brand title and in the footer so a
// PDF shared as a giveaway carries the value prop on its face.
const TAGLINE = 'Science-backed practice techniques to play fast and clean.';

export function buildExerciseHtml(
  title: string,
  pitches: Pitch[],
  keySignature: KeySignature,
  clef: Clef,
  patterns: RhythmPattern[],
): string {
  const exercises = patterns.map((pattern, i) => {
    const abc = buildExerciseAbc(pitches, keySignature, clef, pattern);
    const escapedAbc = JSON.stringify(abc);
    const id = `ex-${pattern.id}`;
    // Sequential 1-based number for the printed list — independent of the
    // internal pattern.id (which is the catalog index and skips around).
    return { id, pattern, escapedAbc, num: i + 1 };
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
        // Let abcjs lay out long passages on multiple staff lines instead
        // of squishing one line to fit the page. preferredMeasuresPerLine
        // = 8 packs the measures densely so a long passage stays a few
        // staff lines tall (rather than ~5), which keeps several exercises
        // on each page instead of one-per-page. minSpacing/maxSpacing
        // constrain note-spacing so a wrapped line doesn't look loose.
        wrap: {
          minSpacing: 1.4,
          maxSpacing: 2.7,
          preferredMeasuresPerLine: 8,
        },
        // 'resize' scales the SVG to fit a smaller container if needed;
        // without it, abcjs uses fixed staffwidth pixels which may
        // overflow the page margins for some print engines.
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
        <div class="ex-num">${ex.num}.</div>
        <div id="${ex.id}" class="notation"></div>
      </div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Play Fast Notes</title>
<style>
  @page { margin: 0.5in 0.55in 0.6in; size: letter; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', sans-serif;
    padding: 24px 28px 0;
    color: #1a1a1a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Branded header — the document's title role. Logo above a large
     "Play Fast Notes" wordmark and the tagline subtitle. */
  .pfn-header {
    text-align: center;
    padding-bottom: 16px;
    border-bottom: 3px solid ${BRAND};
    margin-bottom: 18px;
  }
  .pfn-logo {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    display: block;
    object-fit: cover;
    margin: 0 auto 10px;
  }
  .pfn-name {
    font-weight: 800;
    font-size: 30px;
    letter-spacing: -0.015em;
    color: ${BRAND};
    line-height: 1.1;
    margin: 0;
  }
  .pfn-tag {
    font-size: 13px;
    color: #555;
    margin-top: 6px;
    font-style: italic;
    letter-spacing: 0.01em;
  }
  /* Web address in the header — subtle, in the brand tint, so a printed
     giveaway shows where to find the app right at the top of the page. */
  .pfn-url {
    font-size: 12px;
    color: ${BRAND};
    font-weight: 700;
    margin-top: 6px;
    letter-spacing: 0.02em;
  }

  /* The user-supplied PDF title sits between the brand and the exercises,
     in a smaller role — the brand is the document's headline now. */
  .ex-title {
    text-align: center;
    margin: 0 0 14px;
    font-weight: 700;
    font-size: 16px;
    color: #222;
    letter-spacing: 0.01em;
  }
  /* Exercises — each gets a small teal numeral above the staff so wrapped
     lines inside one exercise can't be confused with the start of the next,
     plus a heavier rule between items than between wrapped staff lines. */
  .exercise {
    /* Keep each exercise whole on a page so it reads as one block (no
       dangling numbers, no exercise split across a page turn). Each one is
       kept short enough — via the wrap density below — that several pack
       onto a page rather than one-per-page. A passage long enough to exceed
       a full page degrades gracefully: the browser breaks it anyway. */
    page-break-inside: avoid;
    break-inside: avoid;
    padding: 6px 0 16px;
    margin-bottom: 10px;
    border-bottom: 1.5px solid #cfcfcf;
  }
  .exercise:last-of-type { border-bottom: none; margin-bottom: 0; }
  .ex-num {
    font-weight: 800;
    font-size: 13px;
    color: ${BRAND};
    letter-spacing: 0.04em;
    margin-bottom: 2px;
    padding-left: 4px;
  }
  .notation { width: 100%; }
  .notation svg { max-width: 100%; display: block; }

  /* Marketing footer — pinned at the end of the document with a teal rule.
     Mirrors the brand title block: tagline + URL, no extra "Generated with"
     prose. */
  .pfn-footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 2px solid ${BRAND};
    text-align: center;
    line-height: 1.55;
  }
  .pfn-footer .tag {
    font-size: 12px;
    color: #555;
    font-style: italic;
  }
  .pfn-footer .site-url {
    display: inline-block;
    margin-top: 4px;
    color: ${BRAND};
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.02em;
  }

  /* On-screen-only return bar for the web print popup — without it the user is
     stranded on this tab after the print dialog with no way back to the app.
     Hidden in the printed/saved PDF (and the native expo-print render) via the
     @media print rule below. */
  .app-return-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: ${BRAND};
    padding: 10px 14px;
    margin: -24px -28px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .app-return-btn {
    background: #fff;
    color: ${BRAND};
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font-weight: 800;
    font-size: 14px;
    cursor: pointer;
  }
  .app-return-hint { color: #fff; font-size: 12px; opacity: 0.95; }
  @media print { .no-print { display: none !important; } }
</style>
<script src="${ABCJS_CDN}"></script>
</head>
<body>
  <div class="no-print app-return-bar">
    <button class="app-return-btn" onclick="window.close()">← Back to Play Fast Notes</button>
    <span class="app-return-hint">Save this as a PDF from your browser's Print dialog, then tap Back to return to the app.</span>
  </div>
  <header class="pfn-header">
    <img class="pfn-logo" src="${LOGO_URL}" alt="Play Fast Notes" />
    <h1 class="pfn-name">Play Fast Notes</h1>
    <div class="pfn-tag">${escapeHtml(TAGLINE)}</div>
    <div class="pfn-url">${SITE_HOST}</div>
  </header>

  <h2 class="ex-title">${escapeHtml(title)}</h2>

  ${exerciseDivs}

  <footer class="pfn-footer">
    <div class="tag">${escapeHtml(TAGLINE)}</div>
    <div class="site-url">${SITE_HOST}</div>
  </footer>
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
