// Native AbcStaffView — renders standard notation via abcjs inside a
// react-native-webview, the same approach as RhythmNotation. The web
// sibling (AbcStaffView.web.tsx) renders abcjs into a DOM node directly.
//
// Same prop API as the web version so every caller (SubdivisionGlyph,
// PitchStaff, GroupingPicker, the rhythmic + rhythm-builder screens) works
// unchanged across platforms.

import { useEffect, useMemo, useRef, useState } from 'react';
import { NativeModules, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ABCJS_CDN = 'https://unpkg.com/abcjs@6/dist/abcjs-basic-min.js';

type WebViewInstance = { injectJavaScript: (script: string) => void };
type WebViewComponent = React.ComponentType<{
  ref?: React.Ref<WebViewInstance>;
  source: { html: string };
  style?: object;
  scrollEnabled?: boolean;
  javaScriptEnabled?: boolean;
  originWhitelist?: string[];
  onMessage?: (e: { nativeEvent: { data: string } }) => void;
}>;

let WebViewRef: WebViewComponent | null = null;
let webViewLoaded = false;

function loadWebView(): WebViewComponent | null {
  if (WebViewRef || webViewLoaded) return WebViewRef;
  webViewLoaded = true;
  const mods = NativeModules as unknown as Record<string, unknown>;
  if (!mods.RNCWebView && !mods.WebView) {
    WebViewRef = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-webview');
    WebViewRef = mod.WebView as WebViewComponent;
  } catch {
    WebViewRef = null;
  }
  return WebViewRef;
}

type Props = {
  abc: string;
  width?: number;
  height?: number;
  hideStaffLines?: boolean;
  centered?: boolean;
  /** abcjs internal scale — controls note + staff size. */
  scale?: number;
  /** Wrap notation across multiple staff lines (used by PitchStaff). */
  wrap?: boolean;
  preferredMeasuresPerLine?: number;
  /** Grow the view to the rendered notation height (so wrapped multi-line
   *  staves aren't clipped). `height` acts as the initial/min height. */
  autoHeight?: boolean;
  /** Shown when abcjs fails to render. */
  fallbackText?: string;
  /** Web-only: shrink a long single-line phrase to fit `width`. No-op on native. */
  fitWidth?: boolean;
  /** Maps a tapped note's SVG element to its index in the ABC body. */
  onNoteTap?: (noteIndex: number) => void;
  /** Draws a coloured highlight on the note at this index. */
  activeNoteIndex?: number | null;
};

function buildHtml(o: {
  abc: string;
  ink: string;
  width: number;
  hideStaffLines: boolean;
  centered: boolean;
  scale: number;
  wrap: boolean;
  preferredMeasuresPerLine: number;
  hasTap: boolean;
  activeNoteIndex: number | null;
}): string {
  const staffWidth = Math.max(40, o.width - 10);
  const wrapStmt = o.wrap
    ? `opts.wrap = { minSpacing: 1.4, maxSpacing: 2.7, preferredMeasuresPerLine: ${o.preferredMeasuresPerLine}, lastLineLimit: 0.5 };`
    : '';
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  html, body { margin:0; padding:0; background:transparent; }
  #paper {
    display:flex;
    align-items:${o.wrap ? 'flex-start' : 'flex-end'};
    justify-content:${o.centered ? 'center' : 'flex-start'};
  }
  svg { max-width:100%; }
</style>
<script src="${ABCJS_CDN}"></script>
</head>
<body>
<div id="paper"></div>
<script>
  var ABC = ${JSON.stringify(o.abc)};
  var INK = ${JSON.stringify(o.ink)};
  var ACTIVE = ${o.activeNoteIndex == null ? 'null' : String(o.activeNoteIndex)};
  var HAS_TAP = ${o.hasTap ? 'true' : 'false'};
  function post(m){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(m); }
  function noteStarts(){
    var bs = ABC.lastIndexOf('\\n') + 1;
    var be = ABC.lastIndexOf('|'); if (be < 0) be = ABC.length;
    var parts = ABC.substring(bs, be).split(' ').filter(function(s){ return s.length > 0; });
    var starts = []; var c = bs;
    for (var i=0;i<parts.length;i++){ starts.push(c); c += parts[i].length + 1; }
    return starts;
  }
  function highlight(){
    var notes = document.querySelectorAll('.abcjs-note');
    for (var i=0;i<notes.length;i++){
      notes[i].setAttribute('fill', (ACTIVE !== null && i === ACTIVE) ? '#9b59b6' : INK);
    }
  }
  function setActive(idx){ ACTIVE = idx; highlight(); }
  function render(){
    try {
      var opts = {
        staffwidth: ${staffWidth},
        scale: ${o.scale},
        paddingleft: 4, paddingright: 4, paddingtop: 4, paddingbottom: 4,
        format: { stafflinescolor: ${o.hideStaffLines ? "'transparent'" : 'INK'} }
      };
      ${wrapStmt}
      if (HAS_TAP) {
        var starts = noteStarts();
        opts.clickListener = function(el){
          if (!el || typeof el.startChar !== 'number') return;
          var sc = el.startChar;
          for (var i=0;i<starts.length;i++){
            var lo = starts[i], hi = (i+1 < starts.length) ? starts[i+1] : Infinity;
            if (sc >= lo && sc < hi) { post(String(i)); return; }
          }
        };
      }
      ABCJS.renderAbc('paper', ABC, opts);
      document.querySelectorAll('#paper svg path').forEach(function(p){
        p.setAttribute('fill', INK);
        if (p.getAttribute('stroke') && p.getAttribute('stroke') !== 'none') {
          p.setAttribute('stroke', INK);
        }
      });
      highlight();
      // Center-crop: abcjs pads the staff out to staffwidth, so a short note
      // group is drawn at the LEFT with blank space to its right — centering the
      // whole SVG then leaves the notes left-of-center (visible under the number
      // in the grouping picker). Crop the viewBox to the actual drawn bounds so
      // centering centers the notes themselves. Mirrors AbcStaffView.web.tsx.
      if (${o.centered ? 'true' : 'false'}) {
        try {
          var csvg = document.querySelector('#paper svg');
          if (csvg) {
            var bb = csvg.getBBox();
            var oh = parseFloat(csvg.getAttribute('height')) || (bb ? bb.height : 0);
            if (bb && bb.width > 0 && oh > 0) {
              // Horizontal crop only: map the drawn width to the element and keep
              // the full height, so vertical layout + the reported height are
              // untouched and only the left-bias is corrected.
              csvg.setAttribute('viewBox', bb.x + ' 0 ' + bb.width + ' ' + oh);
              csvg.setAttribute('width', String(bb.width));
            }
          }
        } catch (ce) {}
      }
      // Report the rendered SVG height so RN can grow the container to fit
      // wrapped staff lines (otherwise a 2-line wrap clips at the fixed height).
      try {
        var svg = document.querySelector('#paper svg');
        var h = svg ? (parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height) : 0;
        if (h) post('H:' + Math.ceil(h));
      } catch (he) {}
    } catch (e) {
      post('ERR:' + (e && e.message ? e.message : 'abcjs failed'));
    }
  }
  if (typeof ABCJS !== 'undefined') render();
  else window.addEventListener('load', render);
</script>
</body>
</html>`;
}

export function AbcStaffView({
  abc,
  width,
  height,
  hideStaffLines,
  centered,
  scale = 1,
  wrap,
  preferredMeasuresPerLine = 4,
  autoHeight,
  fallbackText,
  onNoteTap,
  activeNoteIndex,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const webRef = useRef<WebViewInstance | null>(null);
  const [failed, setFailed] = useState(false);
  const [measured, setMeasured] = useState<number | null>(null);

  const resolvedWidth = width ?? 240;
  const resolvedHeight = height ?? 60;
  // When autoHeight, grow to the rendered notation (floored at resolvedHeight)
  // so wrapped staff lines show in full.
  const containerHeight =
    autoHeight && measured != null ? Math.max(resolvedHeight, measured) : resolvedHeight;

  const html = useMemo(
    () =>
      buildHtml({
        abc,
        ink: C.text,
        width: resolvedWidth,
        hideStaffLines: !!hideStaffLines,
        centered: !!centered,
        scale,
        wrap: !!wrap,
        preferredMeasuresPerLine,
        hasTap: !!onNoteTap,
        activeNoteIndex: activeNoteIndex ?? null,
      }),
    // activeNoteIndex is intentionally excluded — its changes are pushed via
    // injectJavaScript below so the WebView doesn't reload on every note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      abc,
      C.text,
      resolvedWidth,
      hideStaffLines,
      centered,
      scale,
      wrap,
      preferredMeasuresPerLine,
      onNoteTap,
    ],
  );

  // Reset failure + measured height whenever the rendered content changes.
  useEffect(() => {
    setFailed(false);
    setMeasured(null);
  }, [html]);

  // Push active-note changes without reloading the WebView. The guard
  // covers the window before the page's <script> has defined setActive.
  useEffect(() => {
    webRef.current?.injectJavaScript(
      `if(typeof setActive==='function'){setActive(${
        activeNoteIndex == null ? 'null' : activeNoteIndex
      });}true;`,
    );
  }, [activeNoteIndex]);

  const WebView = loadWebView();

  if (!WebView || failed) {
    return (
      <View style={[styles.fallback, { width: resolvedWidth, height: resolvedHeight }]}>
        {fallbackText ? (
          <ThemedText
            style={[styles.fallbackText, { color: C.icon }]}
            numberOfLines={2}>
            {fallbackText}
          </ThemedText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ width: resolvedWidth, height: containerHeight }}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
        onMessage={(e) => {
          const data = e.nativeEvent.data;
          if (data.startsWith('ERR:')) {
            setFailed(true);
          } else if (data.startsWith('H:')) {
            const h = Number(data.slice(2));
            if (!Number.isNaN(h) && h > 0) setMeasured(h + 8);
          } else if (onNoteTap) {
            const idx = Number(data);
            if (!Number.isNaN(idx)) onNoteTap(idx);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: 'transparent' },
  fallback: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  fallbackText: { fontSize: Type.size.xs, fontStyle: 'italic', textAlign: 'center' },
});
