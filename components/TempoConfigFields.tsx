import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { BpmStepper } from '@/components/BpmStepper';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMetronome } from '@/lib/audio/useMetronome';
import { tempoStacks } from '@/lib/layout/configForm';

export const INCREMENTS = [2, 5, 10] as const;
// Any whole BPM step ≥ 1 — the presets above plus a type-your-own chip.
export type Increment = number;

export function isValidIncrementStep(n: unknown): n is Increment {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99;
}

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
  // Stack the BPM cards only when the column is genuinely narrow (portrait
  // phone) — at 2-across they're tight and "Hear this tempo" wraps. Keyed
  // off the effective column width, NOT min(w,h): a landscape phone has
  // room for 2-across inside the capped config column.
  const { width } = useWindowDimensions();
  const stack = tempoStacks(width);
  // Type-your-own increment chip: an empty outlined box until the typed
  // number is the active increment, then filled like a selected preset.
  // Mirrors the Tempo Ladder setup screen's treatment.
  const [customText, setCustomText] = useState('');
  const isPreset = (INCREMENTS as readonly number[]).includes(increment);
  useEffect(() => {
    if (!isPreset) setCustomText(String(increment));
  }, [increment, isPreset]);
  return (
    <>
      <View style={stack ? styles.rowPhone : styles.row}>
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
            onPress={() => {
              onIncrement(n);
              setCustomText('');
            }}
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
        <View
          style={[
            styles.chip,
            styles.chipInputWrap,
            !isPreset
              ? { backgroundColor: C.tint, borderColor: C.tint }
              : { backgroundColor: 'transparent', borderColor: C.text },
          ]}>
          <ThemedText style={{ color: !isPreset ? '#fff' : C.text }}>+</ThemedText>
          <TextInput
            value={customText}
            onChangeText={(t) => {
              const digits = t.replace(/[^0-9]/g, '').slice(0, 2);
              setCustomText(digits);
              const n = parseInt(digits, 10);
              if (isValidIncrementStep(n)) onIncrement(n);
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="other"
            placeholderTextColor={!isPreset ? 'rgba(255,255,255,0.7)' : C.icon}
            style={[styles.chipInput, { color: !isPreset ? '#fff' : C.text }]}
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md },
  rowPhone: { flexDirection: 'column', gap: Spacing.md },
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
  chipInputWrap: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: 2,
    justifyContent: 'center',
  },
  chipInput: {
    minWidth: 40,
    textAlign: 'center',
    padding: 0,
    fontSize: Type.size.md,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
});
