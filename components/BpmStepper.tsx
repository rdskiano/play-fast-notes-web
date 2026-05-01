import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMetronome } from '@/lib/audio/useMetronome';

type Metronome = ReturnType<typeof useMetronome>;

type Props = {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  metronome?: Metronome;
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
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

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
    <View style={[styles.card, { borderColor: C.icon + '55', backgroundColor: C.icon + '0a' }]}>
      <View style={styles.tempoRow}>
        <Pressable
          onPress={() => setBpm(numValue - 1)}
          onLongPress={() => setBpm(numValue - 5)}
          hitSlop={6}
          style={[styles.stepBtn, { borderColor: C.icon }]}>
          <ThemedText style={[styles.stepText, { color: C.text }]}>−</ThemedText>
        </Pressable>
        <View style={styles.tempoDisplay}>
          <ThemedText style={[styles.tempoNum, { color: C.text }]}>{numValue}</ThemedText>
          <ThemedText style={[styles.tempoUnit, { color: C.icon }]}>BPM</ThemedText>
        </View>
        <Pressable
          onPress={() => setBpm(numValue + 1)}
          onLongPress={() => setBpm(numValue + 5)}
          hitSlop={6}
          style={[styles.stepBtn, { borderColor: C.icon }]}>
          <ThemedText style={[styles.stepText, { color: C.text }]}>+</ThemedText>
        </Pressable>
      </View>

      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={numValue}
        onChange={(e) => setBpm(parseInt(e.target.value, 10))}
        style={{
          width: '100%',
          accentColor: C.tint,
          marginTop: -2,
        }}
      />
      <View style={styles.sliderLabels}>
        <ThemedText style={[styles.sliderLabelText, { color: C.icon }]}>{min}</ThemedText>
        <ThemedText style={[styles.sliderLabelText, { color: C.icon }]}>{max}</ThemedText>
      </View>

      {metronome && (
        <Pressable
          onPress={toggle}
          style={[styles.playBtn, { backgroundColor: running ? '#c0392b' : '#e67e22' }]}>
          <ThemedText style={styles.playBtnText}>
            {running ? '■ Stop' : '▶ Start'}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: Borders.thin,
    borderRadius: 16,
    padding: Spacing.md,
    gap: 10,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: Type.size['2xl'], fontWeight: Type.weight.bold, lineHeight: 26 },
  tempoDisplay: { alignItems: 'center' },
  tempoNum: { fontSize: 32, fontWeight: Type.weight.heavy, lineHeight: 36 },
  tempoUnit: { fontSize: 10, opacity: Opacity.subtle, marginTop: -2 },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
    marginHorizontal: Spacing.sm,
  },
  sliderLabelText: { fontSize: 10, opacity: Opacity.muted },
  playBtn: {
    borderRadius: Radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  playBtnText: {
    color: '#fff',
    fontWeight: Type.weight.black,
    fontSize: 17,
    letterSpacing: 0.3,
  },
});
