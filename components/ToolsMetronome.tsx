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
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  // The panel's internals are fixed-pixel. On a phone we show it at natural
  // size. On larger screens the natural card can look small adrift in the
  // space, so scale the device up — but only as far as the viewport HEIGHT
  // allows, so it stays a centerpiece on a tall iPad without dominating a short
  // laptop window (where a unit prompt + nav share the height). Capped at 1.4.
  // The outer wrapper reserves the SCALED footprint so neighbours lay out
  // around the real visual size, not the unscaled box.
  const scale = isPhone ? 1 : Math.max(1, Math.min(1.4, (vpH * 0.5) / height));
  const width = Math.min(vpW - 24, 320);
  return (
    <View
      style={{
        width: width * scale,
        height: height * scale,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={[
          styles.card,
          { width, height, transform: scale !== 1 ? [{ scale }] : undefined },
        ]}>
        <MetronomePanel metronome={metronome} />
      </View>
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
