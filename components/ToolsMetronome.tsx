// Inline, always-visible metronome card for Tools mode on phone.
//
// On a phone the shared PracticeToolsLayer keeps the metronome collapsed in an
// edge tab. The Tools-mode practice screens (Tempo Ladder, Interleaved
// Click-Up) have an otherwise-empty body there, so we drop the full
// MetronomePanel straight into the layout — same charcoal "device" card the
// ToolDock uses, just mounted directly instead of behind a tab. Screens that
// use this should remove the metronome from PracticeToolsLayer's tabs (pass
// `tools`) so there aren't two.

import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { DEVICE, MetronomePanel } from '@/components/MetronomePanel';
import type { MetronomeApi } from '@/lib/audio/useMetronome';

export function ToolsMetronome({
  metronome,
  height = 384,
}: {
  metronome: MetronomeApi;
  /** Card height. 384 matches the phone docked metronome — the panel's full
   *  control stack (BPM, dots, TAP, function strip, play/meter/sub) needs it
   *  to render without clipping. Don't go much below this. */
  height?: number;
}) {
  const { width: vpW } = useWindowDimensions();
  // Fit the panel's fixed-width internals (~280) plus padding, capped to the
  // viewport so it never runs off a narrow phone.
  const width = Math.min(vpW - 24, 320);
  return (
    <View style={[styles.card, { width, height }]}>
      <MetronomePanel metronome={metronome} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    backgroundColor: DEVICE.body,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    overflow: 'hidden',
  },
});
