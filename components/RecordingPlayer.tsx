// Inline player for a recording entry in the practice log (iOS).
// An expo-audio player with a play/pause button, a progress bar, and time.
// (The web sibling uses a raw HTML <audio> element.)
//
// New recordings are AAC (.m4a) and play natively. Older web-made recordings
// are .webm/opus, which iOS can't decode — those simply won't start.

import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  uri: string;
  // Optional inline cap so the control fits inside narrow log-card widths.
  maxWidth?: number;
};

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function RecordingPlayer({ uri, maxWidth }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  const total = status.duration > 0 ? status.duration : 0;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  async function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    // Restart if it finished; otherwise resume where it paused.
    if (total > 0 && status.currentTime >= total - 0.25) {
      player.seekTo(0);
    }
    await setAudioModeAsync({ playsInSilentMode: true });
    player.play();
  }

  return (
    <View style={[styles.row, { maxWidth, borderColor: C.icon + '33' }]}>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        style={[styles.btn, { borderColor: C.tint }]}>
        <ThemedText style={[styles.glyph, { color: C.tint }]}>
          {status.playing ? '❚❚' : '▶'}
        </ThemedText>
      </Pressable>
      <View style={[styles.track, { backgroundColor: C.icon + '22' }]}>
        <View
          style={[
            styles.fill,
            { width: `${progress * 100}%`, backgroundColor: C.tint },
          ]}
        />
      </View>
      <ThemedText style={[styles.time, { color: C.icon }]}>
        {fmt(status.currentTime)}
        {total > 0 ? ` / ${fmt(total)}` : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
  },
  btn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 11, fontWeight: Type.weight.heavy },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
  time: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
});
