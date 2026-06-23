import Slider from '@react-native-community/slider';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Lift, Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMetronome } from '@/lib/audio/useMetronome';

type Metronome = ReturnType<typeof useMetronome>;

type Props = {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  metronome?: Metronome;
  /** Accent color for the slider + Hear-tempo button. Defaults to the theme tint. */
  accent?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function BpmStepper({
  value,
  onChange,
  min = 30,
  max = 300,
  metronome,
  accent,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const accentColor = accent ?? C.tint;

  const parsed = parseInt(value, 10);
  const numValue = !isNaN(parsed) ? clamp(parsed, min, max) : min;

  function setBpm(next: number) {
    const clamped = clamp(Math.round(next), min, max);
    if (clamped === numValue) return;
    onChange(String(clamped));
    if (metronome && metronome.running && metronome.bpm === numValue) {
      metronome.setBpm(clamped);
    }
  }

  const running = !!metronome && metronome.running && metronome.bpm === numValue;

  function toggle() {
    if (!metronome) return;
    if (running) {
      metronome.stop();
    } else {
      metronome.setBpm(numValue);
      metronome.start();
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.tempoRow}>
        <Pressable
          onPress={() => setBpm(numValue - 1)}
          onLongPress={() => setBpm(numValue - 5)}
          hitSlop={6}
          style={styles.stepBtn}>
          <ThemedText style={styles.stepText}>−</ThemedText>
        </Pressable>
        <View style={styles.tempoDisplay}>
          <ThemedText style={styles.tempoNum}>{numValue}</ThemedText>
          <ThemedText style={styles.tempoUnit}>BPM</ThemedText>
        </View>
        <Pressable
          onPress={() => setBpm(numValue + 1)}
          onLongPress={() => setBpm(numValue + 5)}
          hitSlop={6}
          style={styles.stepBtn}>
          <ThemedText style={styles.stepText}>+</ThemedText>
        </Pressable>
      </View>

      {Platform.OS === 'web' ? (
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={numValue}
          onChange={(e) => setBpm(parseInt(e.target.value, 10))}
          style={{
            width: '100%',
            accentColor: accentColor,
            marginTop: -2,
          }}
        />
      ) : (
        <Slider
          minimumValue={min}
          maximumValue={max}
          step={1}
          value={numValue}
          onValueChange={(v) => setBpm(v)}
          minimumTrackTintColor={accentColor}
          maximumTrackTintColor={Palette.border}
          style={{ width: '100%', marginTop: -2 }}
        />
      )}
      <View style={styles.sliderLabels}>
        <ThemedText style={styles.sliderLabelText}>{min}</ThemedText>
        <ThemedText style={styles.sliderLabelText}>{max}</ThemedText>
      </View>

      {metronome && (
        <Pressable
          onPress={toggle}
          hitSlop={8}
          accessibilityLabel={running ? 'Stop preview' : 'Hear this tempo'}
          style={styles.playBtn}>
          <ThemedText
            style={[styles.playBtnText, { color: running ? Palette.danger : accentColor }]}>
            {running ? '■  Stop' : '▶  Hear tempo'}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: 16,
    padding: Spacing.md,
    gap: 10,
    ...Lift,
  },
  tempoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontSize: Type.size['2xl'],
    fontWeight: Type.weight.bold,
    lineHeight: 26,
    color: Palette.text,
  },
  tempoDisplay: { alignItems: 'center' },
  tempoNum: {
    fontSize: 32,
    fontWeight: Type.weight.heavy,
    lineHeight: 36,
    color: Palette.text,
    fontVariant: ['tabular-nums'],
  },
  tempoUnit: { fontSize: 10, color: Palette.textMuted, marginTop: -2 },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
    marginHorizontal: Spacing.sm,
  },
  sliderLabelText: { fontSize: 10, color: Palette.textMuted },
  playBtn: {
    alignSelf: 'center',
    height: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  playBtnText: {
    fontWeight: Type.weight.bold,
    fontSize: Type.size.sm,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
});
