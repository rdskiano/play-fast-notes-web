import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMetronome } from '@/lib/audio/useMetronome';
import { getOrCreateExercise } from '@/lib/db/repos/exercises';
import { getPiece, type Piece } from '@/lib/db/repos/pieces';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import {
  getTempoLadder,
  updateTempoLadderState,
  upsertTempoLadder,
  type TempoLadderProgress,
} from '@/lib/db/repos/tempoLadder';

type Phase = 'loading' | 'config' | 'active' | 'done';

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function NumberStepper({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min: number;
  max: number;
  suffix?: string;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <View style={[stepperStyles.row, { borderColor: C.icon }]}>
      <Pressable
        onPress={() => onChange(clampInt(value - step, min, max))}
        hitSlop={6}
        style={stepperStyles.btn}>
        <ThemedText style={[stepperStyles.btnText, { color: C.tint }]}>−</ThemedText>
      </Pressable>
      <View style={stepperStyles.valueWrap}>
        <ThemedText style={stepperStyles.valueText}>{value}</ThemedText>
        {suffix && (
          <ThemedText style={[stepperStyles.suffix, { color: C.icon }]}>{suffix}</ThemedText>
        )}
      </View>
      <Pressable
        onPress={() => onChange(clampInt(value + step, min, max))}
        hitSlop={6}
        style={stepperStyles.btn}>
        <ThemedText style={[stepperStyles.btnText, { color: C.tint }]}>+</ThemedText>
      </Pressable>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  btn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  btnText: {
    fontSize: Type.size['2xl'],
    fontWeight: Type.weight.heavy,
    lineHeight: 24,
  },
  valueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
  },
  valueText: { fontSize: Type.size['2xl'], fontWeight: Type.weight.heavy },
  suffix: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold },
});

export default function TempoLadderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [phase, setPhase] = useState<Phase>('loading');
  const [piece, setPiece] = useState<Piece | null>(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);

  // Config (also serves as displayed values during active phase)
  const [startTempo, setStartTempo] = useState(60);
  const [goalTempo, setGoalTempo] = useState(120);
  const [increment, setIncrement] = useState(5);
  const [targetReps, setTargetReps] = useState(5);

  // Active state
  const [currentTempo, setCurrentTempo] = useState(60);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [repsClean, setRepsClean] = useState(0);
  const [repsMissed, setRepsMissed] = useState(0);

  const { running: metronomeOn, setRunning: setMetronomeOn, setBpm } = useMetronome(60);

  // Pull existing config / progress on mount.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      (async () => {
        try {
          const p = await getPiece(id);
          if (cancelled) return;
          setPiece(p);
          const ex = await getOrCreateExercise(id, 'tempo_ladder');
          if (cancelled) return;
          setExerciseId(ex.id);
          const progress = await getTempoLadder(ex.id);
          if (cancelled) return;
          if (progress) {
            setStartTempo(progress.start_tempo);
            setGoalTempo(progress.goal_tempo);
            setIncrement(progress.increment ?? 5);
            setTargetReps(progress.target_reps);
            setCurrentTempo(progress.current_tempo);
            setCurrentStreak(progress.current_streak);
          }
          setPhase('config');
        } catch (e) {
          console.warn('[tempo-ladder] load failed', e);
          setPhase('config');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  // Keep metronome BPM in sync with the practice tempo while active.
  useEffect(() => {
    if (phase === 'active') setBpm(currentTempo);
  }, [phase, currentTempo, setBpm]);

  // Stop metronome on unmount or phase change away from active.
  useEffect(() => {
    if (phase !== 'active' && metronomeOn) setMetronomeOn(false);
  }, [phase, metronomeOn, setMetronomeOn]);

  async function startSession() {
    if (!exerciseId) return;
    const config = {
      exercise_id: exerciseId,
      mode: 'step' as const,
      start_tempo: startTempo,
      goal_tempo: goalTempo,
      increment,
      target_reps: targetReps,
    };
    try {
      await upsertTempoLadder(config);
    } catch (e) {
      console.warn('[tempo-ladder] save config failed', e);
    }
    // Always start the active phase from the start_tempo (or resume current_tempo if it's mid-ladder).
    setCurrentTempo((prev) => (prev > 0 ? prev : startTempo));
    setRepsClean(0);
    setRepsMissed(0);
    setPhase('active');
  }

  async function persistState(tempo: number, streak: number) {
    if (!exerciseId) return;
    try {
      await updateTempoLadderState(exerciseId, tempo, streak);
    } catch (e) {
      console.warn('[tempo-ladder] save state failed', e);
    }
  }

  async function onClean() {
    setRepsClean((n) => n + 1);
    const newStreak = currentStreak + 1;
    if (newStreak >= targetReps) {
      const newTempo = currentTempo + increment;
      if (newTempo > goalTempo) {
        // Reached the goal — stay at the goal tempo and reset streak.
        setCurrentStreak(0);
        await persistState(currentTempo, 0);
        setPhase('done');
        return;
      }
      setCurrentTempo(newTempo);
      setCurrentStreak(0);
      await persistState(newTempo, 0);
    } else {
      setCurrentStreak(newStreak);
      await persistState(currentTempo, newStreak);
    }
  }

  async function onMissed() {
    setRepsMissed((n) => n + 1);
    setCurrentStreak(0);
    await persistState(currentTempo, 0);
  }

  async function endSession() {
    setMetronomeOn(false);
    if (id) {
      try {
        await Promise.all([
          logPractice(id, 'tempo_ladder', { repsClean, repsMissed, finalTempo: currentTempo }, exerciseId),
          stampLastUsed(id, 'tempo_ladder'),
        ]);
      } catch (e) {
        console.warn('[tempo-ladder] log practice failed', e);
      }
    }
    router.back();
  }

  if (phase === 'loading' || !piece) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={{ opacity: Opacity.muted }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (phase === 'config') {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <ThemedText type="title">Tempo Ladder</ThemedText>
            <ThemedText style={[styles.composer, { color: C.icon }]}>
              {piece.title}
              {piece.composer ? ` · ${piece.composer}` : ''}
            </ThemedText>
          </View>

          <ThemedText style={styles.intro}>
            Climb a metronome from your start tempo up to your goal, one rep at a
            time. When you hit your target reps cleanly at one tempo, the ladder
            advances by your chosen increment.
          </ThemedText>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Start tempo</ThemedText>
            <NumberStepper value={startTempo} onChange={setStartTempo} step={5} min={20} max={300} suffix="BPM" />
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Goal tempo</ThemedText>
            <NumberStepper value={goalTempo} onChange={setGoalTempo} step={5} min={20} max={300} suffix="BPM" />
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Increment per step</ThemedText>
            <NumberStepper value={increment} onChange={setIncrement} step={1} min={1} max={20} suffix="BPM" />
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Reps in a row to advance</ThemedText>
            <NumberStepper value={targetReps} onChange={setTargetReps} step={1} min={1} max={20} suffix="reps" />
          </View>

          <View style={styles.row}>
            <Button
              label="Cancel"
              variant="outline"
              onPress={() => router.back()}
              style={{ flex: 1 }}
            />
            <Button
              label="Start"
              onPress={startSession}
              disabled={goalTempo <= startTempo}
              style={{ flex: 1 }}
            />
          </View>
          {goalTempo <= startTempo && (
            <ThemedText style={[styles.warn, { color: Status.warning }]}>
              Goal tempo must be higher than start tempo.
            </ThemedText>
          )}
        </ScrollView>
      </ThemedView>
    );
  }

  if (phase === 'done') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ThemedText type="title" style={{ textAlign: 'center' }}>
            Reached your goal 🎉
          </ThemedText>
          <ThemedText style={[styles.intro, { textAlign: 'center' }]}>
            {repsClean} clean rep{repsClean === 1 ? '' : 's'} ·{' '}
            {repsMissed} missed · finished at {currentTempo} BPM.
          </ThemedText>
          <Button label="Save and finish" onPress={endSession} fullWidth />
        </View>
      </ThemedView>
    );
  }

  // phase === 'active'
  return (
    <View style={styles.playRoot}>
      {piece.source_uri ? (
        <Image
          source={{ uri: piece.source_uri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
      ) : null}

      <View style={[styles.topOverlay, { backgroundColor: scheme === 'dark' ? '#000000cc' : '#ffffffd0', borderBottomColor: C.icon + '44' }]}>
        <Pressable onPress={endSession} hitSlop={8} style={styles.endBtn}>
          <ThemedText style={[styles.endBtnText, { color: C.tint }]}>End</ThemedText>
        </Pressable>

        <View style={styles.streakDots}>
          {Array.from({ length: targetReps }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < currentStreak
                  ? { backgroundColor: Status.success, borderColor: Status.success }
                  : { borderColor: C.icon },
              ]}
            />
          ))}
        </View>

        <View style={styles.transportRow}>
          <Pressable onPress={onMissed} hitSlop={4} style={[styles.headerPill, styles.missBtn]}>
            <ThemedText style={styles.headerPillText}>✗</ThemedText>
          </Pressable>
          <Pressable onPress={onClean} hitSlop={4} style={[styles.headerPill, styles.cleanBtn]}>
            <ThemedText style={styles.headerPillText}>✓</ThemedText>
          </Pressable>
          <ThemedText style={[styles.headerBpm, { color: C.text }]}>{currentTempo}</ThemedText>
          <Pressable
            onPress={() => setMetronomeOn(!metronomeOn)}
            style={[
              styles.headerPlayBtn,
              {
                backgroundColor: metronomeOn ? C.tint : 'transparent',
                borderColor: C.tint,
              },
            ]}>
            <ThemedText
              style={{
                color: metronomeOn ? '#fff' : C.tint,
                fontWeight: Type.weight.bold,
                fontSize: 13,
              }}>
              {metronomeOn ? '■' : '▶'}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.statusBar}>
        <ThemedText style={[styles.statusText, { color: scheme === 'dark' ? '#ffffffaa' : '#000000aa' }]}>
          {startTempo} → {goalTempo} BPM · {repsClean} clean · {repsMissed} missed
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  scroll: { gap: Spacing.lg, paddingBottom: Spacing.xl },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
  },
  header: { gap: Spacing.xs },
  composer: { fontSize: Type.size.md },
  intro: {
    fontSize: Type.size.sm,
    lineHeight: 20,
    opacity: Opacity.subtle,
  },
  field: { gap: Spacing.sm },
  label: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    opacity: 0.85,
  },
  row: { flexDirection: 'row', gap: Spacing.md },
  warn: { fontSize: Type.size.sm, textAlign: 'center' },

  // Active phase — full-bleed score with floating top overlay
  playRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  topOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingTop: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  endBtn: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  endBtnText: { fontSize: Type.size.lg, fontWeight: Type.weight.semibold },
  streakDots: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    backgroundColor: 'transparent',
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missBtn: { backgroundColor: '#e74c3c' },
  cleanBtn: { backgroundColor: Status.success },
  headerPillText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  headerBpm: { fontSize: Type.size.md, fontWeight: Type.weight.heavy, marginHorizontal: 6 },
  headerPlayBtn: {
    borderWidth: Borders.medium,
    borderRadius: Radii.sm,
    width: 32,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBar: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusText: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radii.pill,
    backgroundColor: '#00000033',
  },
});
