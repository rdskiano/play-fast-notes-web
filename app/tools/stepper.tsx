import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { SessionTopBar } from '@/components/SessionTopBar';
import { TempoConfigFields, type Increment } from '@/components/TempoConfigFields';
import { ThemedText } from '@/components/themed-text';
import { ToolsMetronome } from '@/components/ToolsMetronome';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { TOOLS_CLICK_UP_HELP } from '@/constants/toolsHelp';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMetronome } from '@/lib/audio/useMetronome';
import { HELP_CLEARANCE } from '@/lib/layout/configForm';
import { generateSteps, type ClickUpStep } from '@/lib/strategies/clickUp';

// Tools-mode Interleaved Click-Up — the real ICU interleaving sequence, but
// guided by text instead of marks on a piece of music. The user says how many
// units their passage breaks into and sets a tempo range; the app walks them
// through the same interleaved order ("Play unit 1" → "Now play units 1 and
// 2" → …), climbing the tempo, with the metronome set for each step. No piece,
// no saved progress — a warmup tool, reachable from the library's Tools hub.

const MIN_UNITS = 2;
const MAX_UNITS = 24;

// Turn a step's active-unit list (always a contiguous range from clickUp's
// generateSteps) into a natural-language phrase: "unit 3", "units 1 and 2",
// "units 1 through 4".
function describeUnits(units: number[]): string {
  if (units.length === 0) return '';
  if (units.length === 1) return `unit ${units[0]}`;
  if (units.length === 2) return `units ${units[0]} and ${units[1]}`;
  return `units ${units[0]} through ${units[units.length - 1]}`;
}

function sameUnits(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export default function ToolsStepperScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;

  const metronome = useMetronome(60);

  const [phase, setPhase] = useState<'config' | 'playing'>('config');
  const [units, setUnits] = useState(4);
  const [startTempo, setStartTempo] = useState('60');
  const [goalTempo, setGoalTempo] = useState('120');
  const [increment, setIncrement] = useState<Increment>(5);

  const [steps, setSteps] = useState<ClickUpStep[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  function exit() {
    metronome.stop();
    router.back();
  }

  function start() {
    const startN = parseInt(startTempo, 10);
    const goalN = parseInt(goalTempo, 10);
    if (!startN || !goalN || goalN <= startN) return;
    const generated = generateSteps(units, startN, goalN, increment);
    if (generated.length === 0) return;
    setSteps(generated);
    setCurrentIndex(0);
    metronome.setBpm(generated[0].tempo);
    metronome.start();
    setPhase('playing');
  }

  function onNext() {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= steps.length) {
      // Reached the top — drop back to setup so the user can run it again
      // or adjust. (No celebration modal here; it's a lightweight warmup.)
      metronome.stop();
      setPhase('config');
      return;
    }
    setCurrentIndex(nextIdx);
    metronome.setBpm(steps[nextIdx].tempo, { animateBump: true });
  }

  function onPrev() {
    const prevIdx = Math.max(0, currentIndex - 1);
    if (prevIdx === currentIndex) return;
    setCurrentIndex(prevIdx);
    metronome.setBpm(steps[prevIdx].tempo);
  }

  // ── CONFIG ─────────────────────────────────────────────────────────────
  if (phase === 'config') {
    const startN = parseInt(startTempo, 10);
    const goalN = parseInt(goalTempo, 10);
    const canStart = !!startN && !!goalN && goalN > startN && units >= MIN_UNITS;
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={exit}
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Interleaved Click-Up
            </ThemedText>
          }
        />
        <ScrollView contentContainerStyle={[styles.configContainer, { paddingTop: insets.top + 6 }]}>
          <ThemedText style={{ opacity: 0.75, lineHeight: 21 }}>
            Break your passage into small units in your head — a beat or a
            measure each. The app drills them the Interleaved Click-Up way:
            one unit at a time, then growing combinations, climbing the tempo.
            It tells you what to play at each step — no music needed on screen.
          </ThemedText>

          <View style={styles.field}>
            <ThemedText style={styles.label}>How many units?</ThemedText>
            <View style={styles.counterRow}>
              <Pressable
                onPress={() => setUnits((n) => Math.max(MIN_UNITS, n - 1))}
                disabled={units <= MIN_UNITS}
                style={[
                  styles.counterBtn,
                  { borderColor: C.icon, opacity: units <= MIN_UNITS ? 0.4 : 1 },
                ]}>
                <ThemedText style={styles.counterBtnText}>−</ThemedText>
              </Pressable>
              <ThemedText style={styles.counterValue}>{units}</ThemedText>
              <Pressable
                onPress={() => setUnits((n) => Math.min(MAX_UNITS, n + 1))}
                disabled={units >= MAX_UNITS}
                style={[
                  styles.counterBtn,
                  { borderColor: C.icon, opacity: units >= MAX_UNITS ? 0.4 : 1 },
                ]}>
                <ThemedText style={styles.counterBtnText}>+</ThemedText>
              </Pressable>
            </View>
          </View>

          <TempoConfigFields
            startLabel="Start Tempo"
            goalLabel="Performance Tempo"
            startValue={startTempo}
            goalValue={goalTempo}
            increment={increment}
            onStart={setStartTempo}
            onGoal={setGoalTempo}
            onIncrement={setIncrement}
            metronome={metronome}
          />
        </ScrollView>

        <View style={{ padding: 20 }}>
          <Button
            label="Start practicing"
            onPress={start}
            disabled={!canStart}
          />
        </View>

        <TutorialStep
          id="tools-click-up"
          visible
          title={TOOLS_CLICK_UP_HELP.title}
          body={TOOLS_CLICK_UP_HELP.body}
        />
      </ThemedView>
    );
  }

  // ── PLAYING ────────────────────────────────────────────────────────────
  const step = steps[currentIndex];
  const prevStep = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const isNewCombo = !prevStep || !sameUnits(prevStep.activeUnits, step.activeUnits);
  const cue = `${isNewCombo && currentIndex > 0 ? 'Now play ' : 'Play '}${describeUnits(step.activeUnits)}`;

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={exit}
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Step {currentIndex + 1}/{steps.length}
          </ThemedText>
        }
        right={
          <Pressable onPress={() => { metronome.stop(); setPhase('config'); }} hitSlop={6} style={styles.topBtn}>
            <ThemedText style={[styles.topBtnText, { color: C.tint }]}>← Setup</ThemedText>
          </Pressable>
        }
      />

      <PedalCatcher active onAdvance={onNext} onBack={onPrev} />

      {isPhone ? (
        // Phone: show the unit prompt AND the metronome together. The
        // metronome carries the tempo readout, so we drop the separate
        // BPM line. Scrolls if a short (landscape) phone can't fit both.
        <ScrollView contentContainerStyle={styles.phoneStage}>
          <ThemedText style={[styles.cue, { color: C.text }]}>{cue}</ThemedText>
          <ToolsMetronome metronome={metronome} />
        </ScrollView>
      ) : (
        <View style={styles.stage}>
          <ThemedText style={[styles.cue, { color: C.text }]}>{cue}</ThemedText>
          <ThemedText style={[styles.tempo, { color: C.tint }]}>{step.tempo} BPM</ThemedText>
        </View>
      )}

      <View style={styles.bottomBar}>
        {!isPhone && (
          <ThemedText style={styles.pedalNote}>
            Space / Enter / right pedal = NEXT · ← / Backspace / left pedal = BACK
          </ThemedText>
        )}
        <View style={styles.navRow}>
          <Pressable
            onPress={currentIndex === 0 ? undefined : onPrev}
            disabled={currentIndex === 0}
            style={[styles.backBtn, { opacity: currentIndex === 0 ? 0.4 : 1 }]}>
            <ThemedText style={styles.backBtnText}>← BACK</ThemedText>
          </Pressable>
          <Pressable onPress={onNext} style={[styles.nextBtn, styles.nextBtnGrow]}>
            <ThemedText style={styles.nextBtnText}>
              {currentIndex + 1 >= steps.length ? 'FINISH' : 'NEXT →'}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <PracticeToolsLayer
        metronome={metronome}
        metronomeNote="Interleaved Click-Up sets the tempo for each step — just tap Next after each repetition."
        // Phone renders the metronome inline (above), so drop it from the
        // edge tabs to avoid two; keep just the practice timers.
        tools={isPhone ? { left: [], right: ['timer'] } : undefined}
      />

      {/* "?" content during play (auto-fire already happened in config). */}
      <TutorialStep
        id="tools-click-up"
        visible={false}
        title={TOOLS_CLICK_UP_HELP.title}
        body={TOOLS_CLICK_UP_HELP.body}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { textAlign: 'center', fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  topBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.md },
  topBtnText: { fontWeight: Type.weight.heavy, fontSize: Type.size.sm },
  configContainer: { flexGrow: 1, padding: 20, gap: 16, paddingBottom: HELP_CLEARANCE + 20 },
  field: { gap: 8 },
  label: { opacity: 0.7 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  counterBtn: {
    width: 52,
    height: 52,
    borderRadius: Radii.md,
    borderWidth: Borders.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: { fontSize: 26, fontWeight: Type.weight.heavy, lineHeight: 30 },
  counterValue: { fontSize: 34, fontWeight: Type.weight.heavy, minWidth: 56, textAlign: 'center' },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  phoneStage: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  cue: { fontSize: 36, fontWeight: Type.weight.heavy, textAlign: 'center', lineHeight: 44 },
  tempo: { fontSize: 22, fontWeight: Type.weight.bold, letterSpacing: 1 },
  bottomBar: {
    paddingHorizontal: HELP_CLEARANCE,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  pedalNote: { textAlign: 'center', fontSize: 12, opacity: 0.6 },
  nextBtn: { backgroundColor: '#2ecc71', paddingVertical: 16, borderRadius: Radii.md, alignItems: 'center' },
  nextBtnGrow: { flex: 1 },
  nextBtnText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.lg },
  navRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  backBtn: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Borders.medium,
    borderColor: '#bbb',
    backgroundColor: 'transparent',
  },
  backBtnText: { fontWeight: Type.weight.heavy, fontSize: Type.size.lg },
});
