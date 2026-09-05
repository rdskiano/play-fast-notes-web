// ICU Metronome — a tools-only "physical device" for people running
// Interleaved Click-Up from Molly Gebrian's book (paper diagrams, no music
// attached). Born from Ralph watching his 70-year-old student fight a plain
// metronome through the book's climbs (2026-08-25): the device should own the
// arithmetic — climb by the increment, drop back to the start tempo when a
// phase completes, announce the performance tempo — so the player only ever
// presses NEXT.
//
// One card, two faces, like a physical device you flip over:
//  - SETUP face: performance tempo (typed or ±5), increment chips, start
//    tempo (auto = half of performance, rounded to 5, until hand-edited).
//  - RUN face: big tempo readout, giant NEXT (also spacebar / foot pedal via
//    PedalCatcher), BACK, ±5 escape hatches for when reality diverges. At the
//    top of a climb the display celebrates; NEXT then starts the next phase
//    back at the start tempo automatically.
//
// Tools-mode rules apply: nothing is saved, no passage, no DB writes.

import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { DEVICE } from '@/components/MetronomePanel';
import { PedalCatcher } from '@/components/PedalCatcher';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing, Type } from '@/constants/tokens';
import { useMetronome } from '@/lib/audio/useMetronome';

const BPM_MIN = 30;
const BPM_MAX = 240;
const INCREMENTS = [3, 5, 7, 10];

const CARD_W = 340;
const CARD_H = 500;

function clampBpm(v: number): number {
  return Math.max(BPM_MIN, Math.min(BPM_MAX, v));
}

// Half the goal, rounded to a friendly 5, floored at BPM_MIN — same "so slow
// you can't miss" default the in-app ICU uses.
function defaultStart(goal: number): number {
  return Math.max(BPM_MIN, Math.round(goal / 2 / 5) * 5);
}

function climb(start: number, goal: number, inc: number): number[] {
  const out: number[] = [];
  for (let t = start; t <= goal; t += inc) out.push(t);
  if (out.length === 0 || out[out.length - 1] !== goal) out.push(goal);
  return out;
}

export default function IcuMetronomeScreen() {
  const router = useRouter();
  const metronome = useMetronome(60);

  // ── Setup-face state ────────────────────────────────────────────────────
  const [goalStr, setGoalStr] = useState('120');
  const [inc, setInc] = useState(5);
  const [startStr, setStartStr] = useState(String(defaultStart(120)));
  // Auto-derive start from goal (half) until the user edits start by hand.
  const startTouched = useRef(false);

  function onGoalChange(next: string) {
    setGoalStr(next);
    const g = parseInt(next, 10);
    if (!startTouched.current && Number.isFinite(g) && g >= BPM_MIN) {
      setStartStr(String(defaultStart(g)));
    }
  }
  function nudgeGoal(delta: number) {
    const g = clampBpm((parseInt(goalStr, 10) || 120) + delta);
    onGoalChange(String(g));
    if (previewing === 'goal') metronome.setBpm(g);
  }
  function nudgeStart(delta: number) {
    startTouched.current = true;
    const s = clampBpm((parseInt(startStr, 10) || 60) + delta);
    setStartStr(String(s));
    if (previewing === 'start') metronome.setBpm(s);
  }

  // Hear-before-committing (Ralph's ask): a ♪ preview beside each tempo on
  // the setup face clicks at that number until tapped again, so the player
  // can FEEL a tempo before flipping the device over. Nudging a previewed
  // number retargets the click live.
  const [previewing, setPreviewing] = useState<null | 'goal' | 'start'>(null);
  function togglePreview(which: 'goal' | 'start') {
    if (previewing === which) {
      metronome.stop();
      setPreviewing(null);
      return;
    }
    const bpm =
      which === 'goal'
        ? clampBpm(parseInt(goalStr, 10) || 120)
        : clampBpm(parseInt(startStr, 10) || 60);
    metronome.setBpm(bpm);
    // Inside the tap = the user gesture that unlocks web audio.
    if (!metronome.running) metronome.start();
    setPreviewing(which);
  }

  // ── Run-face state ──────────────────────────────────────────────────────
  const [face, setFace] = useState<'setup' | 'run'>('setup');
  const [tempos, setTempos] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState(1);
  const atGoal = face === 'run' && index === tempos.length - 1;

  // The flip. 0 = setup face front, 1 = run face front. Both faces are
  // mounted; backfaceVisibility hides whichever is turned away.
  const flipAnim = useRef(new Animated.Value(0)).current;
  const setupRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const runRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  function flipToRun() {
    setPreviewing(null);
    const goal = clampBpm(parseInt(goalStr, 10) || 120);
    let start = clampBpm(parseInt(startStr, 10) || defaultStart(goal));
    if (start >= goal) start = defaultStart(goal);
    const seq = climb(start, goal, inc);
    setTempos(seq);
    setIndex(0);
    setPhase(1);
    setFace('run');
    metronome.setBpm(seq[0]);
    // Inside the tap = the user gesture that unlocks web audio.
    metronome.start();
    Animated.timing(flipAnim, { duration: 420, toValue: 1, useNativeDriver: true }).start();
  }

  function flipToSetup() {
    metronome.stop();
    setFace('setup');
    Animated.timing(flipAnim, { duration: 420, toValue: 0, useNativeDriver: true }).start();
  }

  function next() {
    if (face !== 'run') return;
    if (index < tempos.length - 1) {
      const ni = index + 1;
      setIndex(ni);
      metronome.setBpm(tempos[ni], { animateBump: true });
    } else {
      // Top of the climb — NEXT starts the next unit phase back at the start
      // tempo. This is the whole point of the device: nothing to remember.
      setPhase((p) => p + 1);
      setIndex(0);
      metronome.setBpm(tempos[0]);
    }
  }

  function back() {
    if (face !== 'run') return;
    if (index > 0) {
      const pi = index - 1;
      setIndex(pi);
      metronome.setBpm(tempos[pi]);
    } else if (phase > 1) {
      setPhase((p) => p - 1);
      const last = tempos.length - 1;
      setIndex(last);
      metronome.setBpm(tempos[last]);
    }
  }

  // Manual ±5 while running: an escape hatch that nudges the click without
  // moving the sequence position — the next NEXT snaps back onto the climb.
  function nudgeRun(delta: number) {
    metronome.setBpm(clampBpm(metronome.bpm + delta));
  }

  function exit() {
    metronome.stop();
    router.back();
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={exit}
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            ICU Metronome
          </ThemedText>
        }
      />
      <PedalCatcher active={face === 'run'} onAdvance={next} onBack={back} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.deviceWrap}>
          {/* ── SETUP face ── */}
          <Animated.View
            pointerEvents={face === 'setup' ? 'auto' : 'none'}
            style={[
              styles.face,
              { transform: [{ perspective: 1000 }, { rotateY: setupRotate }] },
            ]}>
            <ThemedText style={styles.deviceTitle}>INTERLEAVED CLICK-UP</ThemedText>
            <ThemedText style={styles.deviceSub}>
              Following the book? Set two numbers, flip it over, and just press
              NEXT after each step. The climb, the reset, and the arithmetic
              are handled for you.
            </ThemedText>

            <ThemedText style={styles.fieldLabel}>PERFORMANCE TEMPO</ThemedText>
            <View style={styles.goalRow}>
              <Pressable onPress={() => nudgeGoal(-5)} style={styles.capBtn}>
                <ThemedText style={styles.capText}>−5</ThemedText>
              </Pressable>
              <View style={styles.display}>
                <TextInput
                  value={goalStr}
                  onChangeText={onGoalChange}
                  keyboardType="number-pad"
                  maxLength={3}
                  style={styles.displayInput}
                />
              </View>
              <Pressable onPress={() => nudgeGoal(5)} style={styles.capBtn}>
                <ThemedText style={styles.capText}>+5</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => togglePreview('goal')}
                accessibilityLabel={
                  previewing === 'goal'
                    ? 'Stop hearing this tempo'
                    : 'Hear this tempo'
                }
                style={[
                  styles.previewBtn,
                  previewing === 'goal' && styles.previewBtnOn,
                ]}>
                <ThemedText
                  style={[
                    styles.previewText,
                    previewing === 'goal' && styles.previewTextOn,
                  ]}>
                  {previewing === 'goal' ? '■' : '♪'}
                </ThemedText>
              </Pressable>
            </View>

            <ThemedText style={styles.fieldLabel}>CLIMB BY</ThemedText>
            <View style={styles.incRow}>
              {INCREMENTS.map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setInc(v)}
                  style={[styles.incChip, inc === v && styles.incChipOn]}>
                  <ThemedText style={[styles.incText, inc === v && styles.incTextOn]}>
                    +{v}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <View style={styles.startRow}>
              <ThemedText style={styles.startLabel}>
                STARTS AT ♩ = {startStr}
                {startTouched.current ? '' : '  (half)'}
              </ThemedText>
              <Pressable onPress={() => nudgeStart(-5)} style={styles.capBtnSm}>
                <ThemedText style={styles.capTextSm}>−5</ThemedText>
              </Pressable>
              <Pressable onPress={() => nudgeStart(5)} style={styles.capBtnSm}>
                <ThemedText style={styles.capTextSm}>+5</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => togglePreview('start')}
                accessibilityLabel={
                  previewing === 'start'
                    ? 'Stop hearing the starting tempo'
                    : 'Hear the starting tempo'
                }
                style={[
                  styles.previewBtnSm,
                  previewing === 'start' && styles.previewBtnOn,
                ]}>
                <ThemedText
                  style={[
                    styles.previewTextSm,
                    previewing === 'start' && styles.previewTextOn,
                  ]}>
                  {previewing === 'start' ? '■' : '♪'}
                </ThemedText>
              </Pressable>
            </View>

            <Pressable onPress={flipToRun} style={styles.goBtn}>
              <ThemedText style={styles.goText}>FLIP &amp; START ▶</ThemedText>
            </Pressable>
          </Animated.View>

          {/* ── RUN face ── */}
          <Animated.View
            pointerEvents={face === 'run' ? 'auto' : 'none'}
            style={[
              styles.face,
              styles.faceBack,
              { transform: [{ perspective: 1000 }, { rotateY: runRotate }] },
            ]}>
            <ThemedText style={styles.phaseText}>
              PHASE {phase} · STEP {index + 1}/{tempos.length}
            </ThemedText>

            <View style={[styles.runDisplay, atGoal && styles.runDisplayGoal]}>
              <ThemedText style={styles.runBpm}>{metronome.bpm}</ThemedText>
              <ThemedText style={styles.runBpmUnit}>BPM</ThemedText>
            </View>

            {atGoal ? (
              <ThemedText style={styles.goalBanner}>
                🎉 PERFORMANCE TEMPO!
              </ThemedText>
            ) : (
              <ThemedText style={styles.runHint}>
                Play the step from the book, then NEXT.
              </ThemedText>
            )}

            <Pressable onPress={next} style={[styles.nextBtn, atGoal && styles.nextBtnGoal]}>
              <ThemedText style={styles.nextText}>
                {atGoal ? `NEXT PHASE ↺ ♩ = ${tempos[0] ?? ''}` : 'NEXT →'}
              </ThemedText>
            </Pressable>

            <View style={styles.runControls}>
              <Pressable onPress={back} style={styles.capBtn}>
                <ThemedText style={styles.capText}>← BACK</ThemedText>
              </Pressable>
              <Pressable onPress={() => nudgeRun(-5)} style={styles.capBtn}>
                <ThemedText style={styles.capText}>−5</ThemedText>
              </Pressable>
              <Pressable onPress={() => nudgeRun(5)} style={styles.capBtn}>
                <ThemedText style={styles.capText}>+5</ThemedText>
              </Pressable>
            </View>

            <View style={styles.runFootRow}>
              <Pressable
                onPress={() => (metronome.running ? metronome.stop() : metronome.start())}
                style={styles.footBtn}>
                <ThemedText style={styles.footText}>
                  {metronome.running ? '◼ PAUSE CLICK' : '▶ CLICK'}
                </ThemedText>
              </Pressable>
              <Pressable onPress={flipToSetup} style={styles.footBtn}>
                <ThemedText style={styles.footText}>⚙ TEMPOS</ThemedText>
              </Pressable>
            </View>
            {Platform.OS === 'web' && (
              <ThemedText style={styles.pedalHint}>
                Space or a foot pedal = NEXT · ← = back
              </ThemedText>
            )}
          </Animated.View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { textAlign: 'center', fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  deviceWrap: { width: CARD_W, height: CARD_H, maxWidth: '100%' },
  face: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: DEVICE.body,
    borderRadius: Radii['2xl'],
    borderWidth: 1,
    borderColor: DEVICE.rim,
    padding: Spacing.lg,
    gap: Spacing.md,
    backfaceVisibility: 'hidden',
    justifyContent: 'center',
  },
  faceBack: { alignItems: 'stretch' },

  deviceTitle: {
    color: DEVICE.text,
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.md,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  deviceSub: {
    color: DEVICE.dim,
    fontSize: Type.size.sm,
    lineHeight: 19,
    textAlign: 'center',
  },
  fieldLabel: {
    color: DEVICE.dim,
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  display: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: DEVICE.display,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.sm,
  },
  displayInput: {
    color: DEVICE.accent,
    fontSize: 40,
    fontWeight: Type.weight.heavy,
    fontVariant: ['tabular-nums'],
    minWidth: 76,
    textAlign: 'center',
    padding: 0,
  },
  capBtn: {
    backgroundColor: DEVICE.cap,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  capText: { color: DEVICE.text, fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  capBtnSm: {
    backgroundColor: DEVICE.cap,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  capTextSm: { color: DEVICE.text, fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  // ♪ hear-this-tempo preview keys — cap-shaped siblings of the ±5 keys;
  // lit orange while clicking (■ stops).
  previewBtn: {
    backgroundColor: DEVICE.cap,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  previewBtnSm: {
    backgroundColor: DEVICE.cap,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  previewBtnOn: { backgroundColor: DEVICE.accent, borderColor: DEVICE.accent },
  previewText: { color: DEVICE.text, fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  previewTextSm: { color: DEVICE.text, fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  previewTextOn: { color: '#fff' },
  incRow: { flexDirection: 'row', gap: Spacing.sm },
  incChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    backgroundColor: DEVICE.cap,
  },
  incChipOn: { backgroundColor: DEVICE.accent, borderColor: DEVICE.accent },
  incText: { color: DEVICE.text, fontWeight: Type.weight.bold },
  incTextOn: { color: '#1c1c1c' },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  startLabel: {
    flex: 1,
    color: DEVICE.dim,
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
    letterSpacing: 0.6,
  },
  goBtn: {
    marginTop: Spacing.md,
    backgroundColor: DEVICE.accent,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  goText: { color: '#1c1c1c', fontWeight: Type.weight.heavy, fontSize: Type.size.lg, letterSpacing: 0.8 },

  phaseText: {
    color: DEVICE.dim,
    fontSize: Type.size.sm,
    fontWeight: Type.weight.bold,
    letterSpacing: 1,
    textAlign: 'center',
  },
  runDisplay: {
    backgroundColor: DEVICE.display,
    borderRadius: Radii.lg,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  runDisplayGoal: { borderWidth: 2, borderColor: DEVICE.accent },
  runBpm: {
    color: DEVICE.accent,
    fontSize: 76,
    lineHeight: 84,
    fontWeight: Type.weight.heavy,
    fontVariant: ['tabular-nums'],
  },
  runBpmUnit: { color: DEVICE.dim, fontSize: Type.size.sm, letterSpacing: 2, marginTop: -6 },
  goalBanner: {
    color: DEVICE.accent,
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.md,
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  runHint: { color: DEVICE.dim, fontSize: Type.size.sm, textAlign: 'center' },
  nextBtn: {
    backgroundColor: DEVICE.accent,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  nextBtnGoal: { backgroundColor: '#3f9d5c' },
  nextText: { color: '#1c1c1c', fontWeight: Type.weight.heavy, fontSize: Type.size.xl, letterSpacing: 0.6 },
  runControls: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm },
  runFootRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs },
  footBtn: { paddingVertical: 6, paddingHorizontal: Spacing.sm },
  footText: { color: DEVICE.dim, fontWeight: Type.weight.bold, fontSize: Type.size.xs, letterSpacing: 0.6 },
  pedalHint: { color: DEVICE.dim, fontSize: Type.size.xs, textAlign: 'center' },
});
