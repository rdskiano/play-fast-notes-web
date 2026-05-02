import { Pressable, StyleSheet, View } from 'react-native';

import { BpmStepper } from '@/components/BpmStepper';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Spacing } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMetronome } from '@/lib/audio/useMetronome';

export const INCREMENTS = [2, 5, 10] as const;
export type Increment = (typeof INCREMENTS)[number];

type Metronome = ReturnType<typeof useMetronome>;

type Props = {
  startLabel?: string;
  goalLabel?: string;
  startValue: string;
  goalValue: string;
  increment: Increment;
  onStart: (v: string) => void;
  onGoal: (v: string) => void;
  onIncrement: (v: Increment) => void;
  incrementLabel?: string;
  metronome?: Metronome;
};

export function TempoConfigFields({
  startLabel = 'Start BPM',
  goalLabel = 'Goal BPM',
  startValue,
  goalValue,
  increment,
  onStart,
  onGoal,
  onIncrement,
  incrementLabel = 'Increment',
  metronome,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <>
      <View style={styles.row}>
        <View style={styles.field}>
          <ThemedText style={styles.label}>{startLabel}</ThemedText>
          <BpmStepper value={startValue} onChange={onStart} metronome={metronome} />
        </View>
        <View style={styles.field}>
          <ThemedText style={styles.label}>{goalLabel}</ThemedText>
          <BpmStepper value={goalValue} onChange={onGoal} metronome={metronome} />
        </View>
      </View>

      <ThemedText style={styles.label}>{incrementLabel}</ThemedText>
      <View style={styles.chipRow}>
        {INCREMENTS.map((n) => (
          <Pressable
            key={n}
            onPress={() => onIncrement(n)}
            style={[
              styles.chip,
              {
                borderColor: C.icon,
                backgroundColor: increment === n ? C.tint : 'transparent',
              },
            ]}>
            <ThemedText style={{ color: increment === n ? '#fff' : C.text }}>
              +{n}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md },
  field: { flex: 1, gap: 6 },
  label: { opacity: 0.7 },
  chipRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  chip: {
    borderWidth: Borders.thin,
    borderRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minWidth: 56,
    alignItems: 'center',
  },
});
