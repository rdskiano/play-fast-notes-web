import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BpmStepper } from '@/components/BpmStepper';
import { Button } from '@/components/Button';
import { CelebrationModal } from '@/components/CelebrationModal';
import { FloatingSlowClickUpControls } from '@/components/FloatingSlowClickUpControls';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  REP_TARGETS,
  useTempoLadderSession,
  type Increment,
  type RepTarget,
} from '@/hooks/useTempoLadderSession';

const INCREMENTS: Increment[] = [2, 5, 10];

export default function TempoLadderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [notePromptVisible, setNotePromptVisible] = useState(false);

  const session = useTempoLadderSession(id);
  const {
    phase,
    passage,
    progress,
    celebrating,
    mode,
    startTempo,
    goalTempo,
    clusterHigh,
    finalTempo,
    increment,
    targetReps,
    metronome,
    completedSets,
    setMode,
    setStartTempo,
    setGoalTempo,
    setClusterHigh,
    setFinalTempo,
    setIncrement,
    setTargetReps,
    startSession,
    onClean,
    onMiss,
    advanceAfterCelebration,
    dismissCelebration,
    endSession,
  } = session;

  if (phase === 'config') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.topBar, { borderBottomColor: C.icon + '44' }]}>
          <Pressable onPress={() => router.back()} hitSlop={14} style={styles.backBtn}>
            <ThemedText style={[styles.backText, { color: C.tint }]}>‹ Passage</ThemedText>
          </Pressable>
          <ThemedText style={styles.topTitle}>Tempo Ladder</ThemedText>
          <PracticeTimersPill />
        </View>

        <ScrollView contentContainerStyle={styles.configContainer}>
          <ThemedText type="title">Tempo Ladder</ThemedText>
          <ThemedText style={{ opacity: 0.7 }}>
            Slow-practice with graduated tempos. Set your goal and target reps.
          </ThemedText>

          <View style={styles.row}>
            <View style={styles.field}>
              <ThemedText style={styles.label}>
                {mode === 'cluster' ? 'Low BPM' : 'Start BPM'}
              </ThemedText>
              <BpmStepper
                value={startTempo}
                onChange={setStartTempo}
                metronome={metronome}
              />
            </View>
            <View style={styles.field}>
              <ThemedText style={styles.label}>
                {mode === 'cluster' ? 'High BPM' : 'Goal BPM'}
              </ThemedText>
              <BpmStepper
                value={mode === 'cluster' ? clusterHigh : goalTempo}
                onChange={mode === 'cluster' ? setClusterHigh : setGoalTempo}
                metronome={metronome}
              />
            </View>
            {mode === 'cluster' && (
              <View style={styles.field}>
                <ThemedText style={styles.label}>Final BPM</ThemedText>
                <BpmStepper
                  value={finalTempo}
                  onChange={setFinalTempo}
                  metronome={metronome}
                />
              </View>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: C.icon + '33' }]} />
          <ThemedText type="subtitle">Mode</ThemedText>
          <ThemedText style={{ opacity: 0.7 }}>Pick how the metronome advances.</ThemedText>
          <View style={styles.chipRow}>
            {(['step', 'cluster'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[
                  styles.chip,
                  {
                    borderColor: C.icon,
                    backgroundColor: mode === m ? C.tint : 'transparent',
                    flex: 1,
                  },
                ]}>
                <ThemedText style={{ color: mode === m ? '#fff' : C.text }}>
                  {m === 'step' ? 'Step click-up' : 'Randomized cluster'}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <View style={[styles.divider, { backgroundColor: C.icon + '33' }]} />

          <ThemedText style={styles.label}>
            {mode === 'cluster' ? 'Shift window by, per advance' : 'Increment per advance'}
          </ThemedText>
          <View style={styles.chipRow}>
            {INCREMENTS.map((n) => (
              <Pressable
                key={n}
                onPress={() => setIncrement(n)}
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
          {mode === 'cluster' && (
            <ThemedText style={{ opacity: 0.6, fontSize: 13 }}>
              Each rep picks a random tempo in the current window. On reaching your streak
              target, the window slides up by the increment.
            </ThemedText>
          )}

          <ThemedText style={styles.label}>Clean reps in a row to advance</ThemedText>
          <View style={styles.chipRow}>
            {REP_TARGETS.map((n: RepTarget) => (
              <Pressable
                key={n}
                onPress={() => setTargetReps(n)}
                style={[
                  styles.chip,
                  {
                    borderColor: C.icon,
                    backgroundColor: targetReps === n ? C.tint : 'transparent',
                  },
                ]}>
                <ThemedText style={{ color: targetReps === n ? '#fff' : C.text }}>
                  {n}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <View style={[styles.divider, { backgroundColor: C.icon + '33' }]} />
          <ThemedText type="subtitle">How it works</ThemedText>
          <ThemedText style={styles.blurbText}>
            Tempo Ladder builds tempo control through disciplined repetition. Start well
            below your target tempo and play the passage with the metronome. After each
            rep, tap <ThemedText style={styles.blurbBold}>Clean ✓</ThemedText> if it was
            accurate or <ThemedText style={styles.blurbBold}>Miss ✗</ThemedText> if it was
            not. A <ThemedText style={styles.blurbBold}>Miss ✗</ThemedText> resets your
            streak to zero.
          </ThemedText>
          <ThemedText style={styles.blurbText}>
            Once you hit your target number of consecutive{' '}
            <ThemedText style={styles.blurbBold}>Clean ✓</ThemedText> reps, the metronome
            automatically advances by your chosen increment. The goal is to climb from
            your starting tempo all the way to your target without rushing — building
            real muscle memory at every speed along the way.
          </ThemedText>
          <ThemedText style={styles.blurbText}>
            In <ThemedText style={styles.blurbBold}>Step click-up</ThemedText> the tempo
            increases in fixed jumps. In{' '}
            <ThemedText style={styles.blurbBold}>Randomized cluster</ThemedText> each rep
            picks a random tempo from a window that slides upward as you succeed,
            training flexibility within a range.
          </ThemedText>
        </ScrollView>

        <View style={{ margin: 20 }}>
          <Button label="Start" onPress={startSession} fullWidth />
        </View>
      </ThemedView>
    );
  }

  if (!progress) return <ThemedView style={{ flex: 1 }} />;

  const reachedGoal = celebrating?.reached ?? false;
  const nextPreviewTempo =
    progress.mode === 'cluster'
      ? null
      : Math.min(progress.goal_tempo, progress.current_tempo + (progress.increment ?? 5));
  const celebrationBody = reachedGoal
    ? `You reached your goal tempo of ${progress.goal_tempo} BPM.`
    : progress.mode === 'cluster'
      ? `Ready to slide the cluster up by ${progress.increment ?? 5} BPM?`
      : `Ready to step up to ${nextPreviewTempo} BPM?`;

  return (
    <View style={styles.playRoot}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.activeTopBar, { borderBottomColor: C.icon + '44' }]}>
        <Pressable
          onPress={() => {
            if (completedSets > 0) setNotePromptVisible(true);
            else endSession();
          }}
          hitSlop={8}
          style={styles.endBtn}>
          <ThemedText style={styles.endBtnText}>End</ThemedText>
        </Pressable>
        <View style={styles.streakDots}>
          {Array.from({ length: progress.target_reps }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < progress.current_streak
                  ? styles.dotFilled
                  : { borderColor: C.icon },
              ]}
            />
          ))}
        </View>
        <PracticeTimersPill />
      </View>

      {passage?.source_uri && (
        <Image
          source={{ uri: passage.source_uri }}
          style={styles.scoreFill}
          contentFit="contain"
        />
      )}

      <FloatingSlowClickUpControls
        bpm={metronome.bpm}
        subdivision={metronome.subdivision}
        running={metronome.running}
        volume={metronome.volume}
        onBpm={metronome.setBpm}
        onSubdivision={metronome.setSubdivision}
        onVolume={metronome.setVolume}
        onToggle={metronome.toggle}
        onClean={onClean}
        onMiss={onMiss}
      />

      <CelebrationModal
        visible={celebrating !== null && !reachedGoal}
        title={`${progress.target_reps} clean in a row!`}
        body={celebrationBody}
        primary={{
          label: 'End session',
          onPress: () => {
            dismissCelebration();
            setNotePromptVisible(true);
          },
        }}
        secondary={{ label: 'Step up tempo', onPress: advanceAfterCelebration }}
      />

      <PracticeLogNotePrompt
        visible={(celebrating !== null && reachedGoal) || notePromptVisible}
        emoji={reachedGoal && celebrating ? '🎉' : undefined}
        title={
          reachedGoal && celebrating
            ? `Goal tempo reached — ${progress.goal_tempo} BPM!`
            : 'How did that go?'
        }
        subtitle={passage?.title ?? 'Tempo Ladder'}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note }) => {
          setNotePromptVisible(false);
          dismissCelebration();
          endSession({ mood, note });
        }}
        onSkip={() => {
          setNotePromptVisible(false);
          dismissCelebration();
          endSession();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  backText: { fontSize: 17, fontWeight: Type.weight.semibold },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
  },

  configContainer: {
    padding: 20,
    gap: 14,
    paddingBottom: Spacing['2xl'],
  },
  divider: { height: 1, marginVertical: Spacing.sm, borderRadius: 1 },
  row: { flexDirection: 'row', gap: Spacing.md },
  field: { flex: 1, gap: 6 },
  label: { opacity: Opacity.subtle },
  blurbText: { opacity: Opacity.muted, fontSize: Type.size.md, lineHeight: 20 },
  blurbBold: { fontWeight: Type.weight.heavy, opacity: 1 },
  chipRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  chip: {
    borderWidth: Borders.thin,
    borderRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minWidth: 56,
    alignItems: 'center',
  },

  playRoot: { flex: 1, backgroundColor: '#000' },
  activeTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: 14,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#ffffffd0',
    zIndex: 1,
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
  dotFilled: { backgroundColor: '#2ecc71', borderColor: '#2ecc71' },
  scoreFill: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
