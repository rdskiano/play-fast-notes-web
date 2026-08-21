// One-tap stale-goal update chip for strategy setup screens.
//
// Shown when the passage's shared performance tempo (locked in on the
// evaluate screen or stamped by starting another strategy) is newer than the
// goal a saved session/config is showing. Tapping adopts the newer number;
// ignoring it keeps the saved goal untouched — the chip never overwrites
// anything on its own.

import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Radii, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function TempoNudgeChip({
  bpm,
  onAccept,
  accent,
}: {
  bpm: number;
  onAccept: () => void;
  /** Strategy accent color; falls back to the app tint. */
  accent?: string;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const color = accent ?? C.tint;
  return (
    <Pressable
      onPress={onAccept}
      accessibilityLabel={`Use the updated goal tempo of ${bpm} BPM`}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: color,
          backgroundColor: color + '14',
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <Feather name="refresh-ccw" size={13} color={color} />
      <ThemedText style={[styles.text, { color }]}>
        Your goal for this passage is now ♩ = {bpm}. Tap to use it.
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  text: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    flexShrink: 1,
  },
});
