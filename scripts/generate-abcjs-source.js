// Regenerates lib/notation/abcjsSource.ts from the installed abcjs package so
// the native WebViews can render notation with NO network access (the CDN
// dependency died in offline demos — Interlochen 2026-07). Run after any
// abcjs upgrade:  npm run gen:abcjs
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const minPath = path.join(root, 'node_modules', 'abcjs', 'dist', 'abcjs-basic-min.js');
const pkg = require(path.join(root, 'node_modules', 'abcjs', 'package.json'));
const outPath = path.join(root, 'lib', 'notation', 'abcjsSource.ts');

const src = fs.readFileSync(minPath, 'utf8');
if (/<\/script/i.test(src)) {
  // Inlined into a <script> tag inside WebView HTML — a literal </script>
  // would terminate the tag early and corrupt the page.
  throw new Error('abcjs-basic-min.js contains "</script>"; add escaping before inlining.');
}

const header = `// GENERATED FILE — do not edit by hand. Regenerate with: npm run gen:abcjs
// Source: abcjs@${pkg.version} dist/abcjs-basic-min.js (MIT, Paul Rosen & Gregory Dyke).
// Inlined so native WebViews render notation fully offline (no CDN fetch).
// Web never loads this: abcjsSource.web.ts exports an empty string, and the
// web components import the abcjs npm package into the bundle instead.
`;

fs.writeFileSync(
  outPath,
  `${header}export const ABCJS_SOURCE: string = ${JSON.stringify(src)};\n`,
);
console.log(`Wrote ${outPath} (abcjs@${pkg.version}, ${Math.round(src.length / 1024)} KB)`);
