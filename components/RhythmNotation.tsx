import { useMemo } from 'react';
import { NativeModules, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ABCJS_SOURCE } from '@/lib/notation/abcjsSource';
import { buildRhythmAbc } from '@/lib/notation/buildAbc';
import type { RhythmPattern } from '@/lib/strategies/rhythmPatterns';

// Lazy-load react-native-webview the same way we handle other native
// modules — so the screen stays alive in dev clients that don't have
// the native side compiled in yet.
type WebViewComponent = React.ComponentType<{
  source: { html: string };
  style?: object;
  scrollEnabled?: boolean;
  javaScriptEnabled?: boolean;
  originWhitelist?: string[];
  onError?: () => void;
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

function buildHtml(abc: string, inkColor: string, bgColor: string, width: number): string {
  const escapedAbc = JSON.stringify(abc);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  html, body { margin:0; padding:0; background:${bgColor}; }
  #paper { padding: 6px 8px; }
  svg { max-width: 100%; }
</style>
<script>${ABCJS_SOURCE}</script>
</head>
<body>
<div id="paper"></div>
<script>
function render() {
  try {
    var abc = ${escapedAbc};
    ABCJS.renderAbc('paper', abc, {
      scale: 1.6,
      staffwidth: ${Math.max(280, width - 24)},
      paddingleft: 4,
      paddingright: 4,
      paddingtop: 4,
      paddingbottom: 4,
      responsive: 'resize'
    });
    var paper = document.getElementById('paper');
    paper.querySelectorAll('svg path, svg rect, svg ellipse, svg line, svg text, svg g').forEach(function(el) {
      el.style.fill = '${inkColor}';
      el.style.stroke = '${inkColor}';
    });
    var bgRect = paper.querySelector('svg rect');
    if (bgRect) { bgRect.style.fill = 'transparent'; bgRect.style.stroke = 'transparent'; }
  } catch (e) {
    document.body.innerHTML = '<div style="color:red;padding:8px;font-family:sans-serif">' + (e && e.message ? e.message : 'abcjs failed') + '</div>';
  }
}
if (typeof ABCJS !== 'undefined') { render(); }
else { window.addEventListener('load', render); }
</script>
</body>
</html>`;
}

type Props = {
  pattern: RhythmPattern;
  width: number;
  height?: number;
};

export function RhythmNotation({ pattern, width, height = 110 }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const ink = scheme === 'dark' ? '#ffffff' : '#111111';
  const bg = 'transparent';

  const abc = useMemo(() => buildRhythmAbc(pattern), [pattern]);
  const html = useMemo(() => buildHtml(abc, ink, bg, width), [abc, ink, bg, width]);

  const WebView = loadWebView();
  if (!WebView) {
    // Graceful fallback if react-native-webview isn't compiled into the
    // current dev client yet. Shows the raw tokens so the user can still
    // read the rhythm.
    return (
      <View style={[styles.fallback, { width, height }]}>
        <ThemedText style={styles.fallbackText}>
          {pattern.notes.join('  ·  ')}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ width, height }}>
      <WebView
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: 'transparent' },
  fallback: {
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { fontSize: 24, fontWeight: Type.weight.heavy, letterSpacing: 1 },
});
