// First-practice evaluation — measurements, no judgments.
//
// Fires the first time a passage is practiced (never at marking time): goal
// tempo → one probe at goal → find your clean tempo → deadline → hand off to a
// fully pre-filled Tempo Ladder. If the probe is clean, the passage needs no
// plan at all — it's marked performance-ready and the flow ends there (D6:
// the expert's first question is "how far is this from possible?").
//
// Everything measured here is remembered: goal → pieces.performance_tempo
// (every tool prefills from it), deadline → pieces.due_date, clean tempo +
// probe result → the 'evaluation' practice-log entry's data_json.

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useMetronome } from '@/lib/audio/useMetronome';
import {
  findHuntStart,
  inheritedGoalForPassage,
  suggestedLadderStart,
  type InheritedGoal,
} from '@/lib/coach/evaluation';
import {
  getPassage,
  updatePassageDueDate,
  updatePassagePerformanceTempo,
  type Passage,
} from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';

type Step = 'goal' | 'unsure' | 'probe' | 'find' | 'due' | 'handoff' | 'done';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const DUE_OPTIONS: { label: string; weeks: number | null }[] = [
  { label: 'This week', weeks: 1 },
  { label: 'In a couple of weeks', weeks: 2 },
  { label: 'In a month', weeks: 4 },
  { label: 'Further off', weeks: 9 },
  { label: 'No deadline', weeks: null },
];

const TEMPO_WORDS = 'Largo 40–60 · Andante 76–108 · Moderato 108–120 · Allegro 120–156 · Vivace 156–176 · Presto 168–200';

export default function EvaluateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const metronome = useMetronome(100);
  // The unmount cleanup must see the latest metronome without re-running.
  const metronomeRef = useRef(metronome);
  metronomeRef.current = metronome;

  const [passage, setPassage] = useState<Passage | null>(null);
  const [inherited, setInherited] = useState<InheritedGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('goal');
  const [goalInput, setGoalInput] = useState('');
  const [goal, setGoal] = useState<number | null>(null);
  const [goalInherited, setGoalInherited] = useState(false);
  const [cleanBpm, setCleanBpm] = useState<number | null>(null);
  const [misses, setMisses] = useState(0);
  const [missFlash, setMissFlash] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getPassage(id);
        if (cancelled) return;
        setPassage(p);
        if (p) {
          const g = await inheritedGoalForPassage(p);
          if (!cancelled) setInherited(g);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      metronomeRef.current.stop();
    };
  }, [id]);

  const typedGoal = parseInt(goalInput, 10);
  const typedGoalValid = Number.isFinite(typedGoal) && typedGoal >= 30 && typedGoal <= 400;

  // Called from a tap so the web AudioContext can resume inside the gesture.
  function beginProbe(bpm: number, fromInherited: boolean) {
    setGoal(bpm);
    setGoalInherited(fromInherited);
    metronome.setBpm(bpm);
    metronome.start();
    setStep('probe');
  }

  async function finishProbeClean() {
    if (!passage || !goal || saving) return;
    setSaving(true);
    metronome.stop();
    try {
      await updatePassagePerformanceTempo(passage.id, goal);
      await logPractice(passage.id, 'evaluation', {
        goal,
        goalInherited,
        probeClean: true,
        tempo: goal,
      });
    } catch (e) {
      console.warn('[evaluate] probe-clean save failed:', e);
    }
    setSaving(false);
    setStep('done');
  }

  function probeMissed() {
    if (!goal) return;
    metronome.setBpm(findHuntStart(goal));
    setStep('find');
  }

  function nudge(delta: number) {
    if (!goal) return;
    const next = Math.min(goal, Math.max(30, metronome.bpm + delta));
    metronome.setBpm(next);
  }

  function findClean() {
    metronome.stop();
    setCleanBpm(metronome.bpm);
    setStep('due');
  }

  function findMiss() {
    setMisses((m) => m + 1);
    setMissFlash(true);
    setTimeout(() => setMissFlash(false), 900);
  }

  function pickDue(weeks: number | null) {
    if (passage) {
      const value = weeks == null ? 0 : Date.now() + weeks * WEEK_MS;
      updatePassageDueDate(passage.id, value).catch(() => {});
    }
    setStep('handoff');
  }

  async function finishHandoff() {
    if (!passage || !goal || !cleanBpm || saving) return;
    setSaving(true);
    const start = suggestedLadderStart(cleanBpm);
    try {
      await updatePassagePerformanceTempo(passage.id, goal);
      await logPractice(passage.id, 'evaluation', {
        goal,
        goalInherited,
        probeClean: false,
        clean: cleanBpm,
        misses,
        start,
      });
    } catch (e) {
      console.warn('[evaluate] handoff save failed:', e);
    }
    setSaving(false);
    router.replace({
      pathname: '/passage/[id]/tempo-ladder',
      params: { id: passage.id, start: String(start) },
    });
  }

  const ladderStart = cleanBpm ? suggestedLadderStart(cleanBpm) : null;

  // A plain render function, NOT a nested component — a component type
  // recreated on each render would remount (and drop keyboard focus) on
  // every keystroke into the TextInput.
  function goalInputRow(primary: boolean) {
    // The box must read as "type here", not as a button — Ralph froze on a
    // pill-shaped input with a bold BPM placeholder (looked like a disabled
    // control). So: an explicit instruction, a ♩ = prefix, and an example
    // number as the placeholder.
    return (
      <View style={{ gap: 6 }}>
        <ThemedText style={styles.inputLabel}>
          {primary ? 'Enter the tempo here:' : 'Or enter a different tempo:'}
        </ThemedText>
        <View style={styles.inputRow}>
          <ThemedText style={styles.inputPrefix}>♩ =</ThemedText>
          <TextInput
            value={goalInput}
            onChangeText={setGoalInput}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="120"
            placeholderTextColor={Palette.textMuted}
            style={styles.bpmInput}
          />
          <View style={{ flex: 1 }}>
            <Button
              label={primary ? 'Use this tempo' : 'Use it'}
              onPress={() => typedGoalValid && beginProbe(typedGoal, false)}
              disabled={!typedGoalValid}
              fullWidth
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={styles.backLink}>‹ Back</ThemedText>
        </Pressable>
        <ThemedText type="title" numberOfLines={2}>
          {passage?.title ?? 'First practice'}
        </ThemedText>
        <ThemedText style={styles.subtle}>
          First time on this passage — let’s take its measurements. Under a minute.
        </ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {loading ? (
          <ThemedText style={styles.muted}>Loading…</ThemedText>
        ) : !passage ? (
          <ThemedText>Passage not found.</ThemedText>
        ) : step === 'goal' ? (
          <View style={styles.section}>
            <StepDots step={0} />
            <ThemedText style={styles.question}>How fast does it need to go?</ThemedText>
            {inherited ? (
              <>
                <View style={styles.card}>
                  <View style={styles.stampTag}>
                    <ThemedText style={styles.stampTagText}>♩ = {inherited.bpm}</ThemedText>
                  </View>
                  <ThemedText style={styles.subtle}>
                    the tempo you set for “{inherited.fromTitle}” in this same section — you can
                    always change it later
                  </ThemedText>
                </View>
                <Button
                  label={`Use ${inherited.bpm}`}
                  onPress={() => beginProbe(inherited.bpm, true)}
                  fullWidth
                />
                {goalInputRow(false)}
              </>
            ) : (
              <>
                <ThemedText style={styles.subtle}>
                  Check the score — modern parts often print an exact ♩ = number.
                </ThemedText>
                {goalInputRow(true)}
              </>
            )}
            <Pressable onPress={() => setStep('unsure')} hitSlop={8} style={styles.ghost}>
              <ThemedText style={styles.ghostText}>I’m not sure</ThemedText>
            </Pressable>
          </View>
        ) : step === 'unsure' ? (
          <View style={styles.section}>
            <StepDots step={0} />
            <ThemedText style={styles.question}>Three ways to find it</ThemedText>
            <ThemedText style={styles.subtle}>Cheapest and most authoritative first.</ThemedText>
            <View style={styles.card}>
              <ThemedText style={styles.wayTitle}>📖 Check the score’s printed marking</ThemedText>
              <ThemedText style={styles.wayBody}>
                Many parts print ♩ = an exact number at the tempo change.
              </ThemedText>
            </View>
            <View style={styles.card}>
              <ThemedText style={styles.wayTitle}>🎧 Listen to a recording and tap along</ThemedText>
              <ThemedText style={styles.wayBody}>
                Open the metronome tool and use TAP TEMPO while the recording plays.
              </ThemedText>
            </View>
            <View style={styles.card}>
              <ThemedText style={styles.wayTitle}>🎼 Best guess from the tempo word</ThemedText>
              <ThemedText style={styles.wayBody}>{TEMPO_WORDS}</ThemedText>
            </View>
            {goalInputRow(true)}
            <Pressable onPress={() => setStep('goal')} hitSlop={8} style={styles.ghost}>
              <ThemedText style={styles.ghostText}>‹ back</ThemedText>
            </Pressable>
          </View>
        ) : step === 'probe' && goal ? (
          <View style={styles.section}>
            <StepDots step={1} />
            <ThemedText style={styles.question}>
              Let’s just make sure you can’t already play it at tempo.
            </ThemedText>
            <ThemedText style={styles.subtle}>
              Try it once at {goal} — if it’s clean, there’s nothing to practice. The click is
              running.
            </ThemedText>
            <ThemedText style={styles.bigBpm}>{goal}</ThemedText>
            <ThemedText style={[styles.subtle, { textAlign: 'center' }]}>Clean?</ThemedText>
            <View style={styles.pair}>
              <Pressable onPress={finishProbeClean} style={[styles.bigBtn, styles.cleanBtn]}>
                <ThemedText style={styles.cleanBtnText}>✓ Clean</ThemedText>
              </Pressable>
              <Pressable onPress={probeMissed} style={[styles.bigBtn, styles.missBtn]}>
                <ThemedText style={styles.missBtnText}>✗ Not yet</ThemedText>
              </Pressable>
            </View>
          </View>
        ) : step === 'find' && goal ? (
          <View style={styles.section}>
            <StepDots step={2} />
            <ThemedText style={styles.question}>Find your clean tempo</ThemedText>
            <ThemedText style={styles.subtle}>
              Nudge the tempo up until it stops feeling easy, then back off one notch — that’s
              your clean tempo. Prove it with one rep.
            </ThemedText>
            <View style={styles.bpmRow}>
              <Pressable onPress={() => nudge(-5)} style={styles.nudgeBtn} hitSlop={6}>
                <ThemedText style={styles.nudgeGlyph}>−</ThemedText>
              </Pressable>
              <ThemedText style={styles.bigBpm}>{metronome.bpm}</ThemedText>
              <Pressable onPress={() => nudge(5)} style={styles.nudgeBtn} hitSlop={6}>
                <ThemedText style={styles.nudgeGlyph}>+</ThemedText>
              </Pressable>
            </View>
            <ThemedText style={[styles.subtle, { textAlign: 'center' }]}>
              Play it once here. Clean?
            </ThemedText>
            <View style={styles.pair}>
              <Pressable onPress={findClean} style={[styles.bigBtn, styles.cleanBtn]}>
                <ThemedText style={styles.cleanBtnText}>✓ Clean</ThemedText>
              </Pressable>
              <Pressable onPress={findMiss} style={[styles.bigBtn, styles.missBtn]}>
                <ThemedText style={styles.missBtnText}>
                  {missFlash ? 'noted — keep hunting' : '✗ Not yet'}
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText style={styles.footnote}>
              Your ✓ is the confirmation — it counts as your first logged rep.
            </ThemedText>
          </View>
        ) : step === 'due' ? (
          <View style={styles.section}>
            <StepDots step={3} />
            <ThemedText style={styles.question}>When does it need to be ready?</ThemedText>
            {DUE_OPTIONS.map((o) => (
              <Pressable
                key={o.label}
                onPress={() => pickDue(o.weeks)}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                <ThemedText style={styles.optionText}>{o.label}</ThemedText>
              </Pressable>
            ))}
            <Pressable onPress={() => setStep('handoff')} hitSlop={8} style={styles.ghost}>
              <ThemedText style={styles.ghostText}>skip</ThemedText>
            </Pressable>
          </View>
        ) : step === 'handoff' && goal && cleanBpm && ladderStart ? (
          <View style={styles.section}>
            <View style={[styles.card, styles.handoffCard]}>
              <ThemedText style={styles.handoffTitle}>Tempo Ladder, set up for you</ThemedText>
              <ThemedText style={styles.handoffLine}>
                Start <ThemedText style={styles.handoffStrong}>{ladderStart}</ThemedText> — a notch
                below your clean {cleanBpm}, so the first rungs feel easy
              </ThemedText>
              <ThemedText style={styles.handoffLine}>
                Goal <ThemedText style={styles.handoffStrong}>{goal}</ThemedText>
                {goalInherited ? ' — shared with its section' : ' — your goal tempo'}
              </ThemedText>
            </View>
            <Button
              label={saving ? 'Saving…' : 'Set up my ladder'}
              onPress={finishHandoff}
              disabled={saving}
              fullWidth
            />
            <Pressable onPress={() => router.back()} hitSlop={8} style={styles.ghost}>
              <ThemedText style={styles.ghostText}>or pick a tool yourself</ThemedText>
            </Pressable>
            <ThemedText style={styles.footnote}>
              From now on, every tool on this passage comes pre-filled with these numbers.
            </ThemedText>
          </View>
        ) : step === 'done' && goal ? (
          <View style={styles.section}>
            <View style={[styles.card, styles.doneCard]}>
              <ThemedText style={styles.handoffTitle}>
                That’s it — nothing to practice here.
              </ThemedText>
              <ThemedText style={styles.handoffLine}>
                Marked performance-ready at {goal}. That rep is in your practice log.
              </ThemedText>
            </View>
            <Button label="Back to the page" onPress={() => router.back()} fullWidth />
          </View>
        ) : (
          <ThemedText style={styles.muted}>Loading…</ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

// Four dots — goal · probe · clean tempo · deadline.
function StepDots({ step }: { step: number }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  backLink: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
  },
  body: { padding: Spacing.lg, gap: Spacing.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  section: { gap: Spacing.sm },
  muted: { color: Palette.textMuted },
  subtle: { fontSize: Type.size.sm, color: Palette.textSecondary, lineHeight: 19 },
  question: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.2,
  },
  dots: { flexDirection: 'row', gap: 5, justifyContent: 'center', marginBottom: Spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Palette.border },
  dotOn: { backgroundColor: Palette.accent },
  card: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii['2xl'],
    padding: Spacing.md,
    gap: 6,
    ...Lift,
  },
  stampTag: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.accentSoft,
    borderRadius: Radii.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stampTagText: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
    color: Palette.accent,
  },
  inputRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  inputLabel: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    color: Palette.text,
  },
  inputPrefix: {
    fontSize: Type.size.lg,
    fontWeight: Type.weight.bold,
    color: Palette.textSecondary,
  },
  bpmInput: {
    width: 92,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.bold,
    color: Palette.text,
    textAlign: 'center',
  },
  ghost: { alignSelf: 'center', paddingVertical: 8 },
  ghostText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold, color: Palette.accent },
  wayTitle: { fontSize: Type.size.md, fontWeight: Type.weight.bold, color: Palette.text },
  wayBody: { fontSize: Type.size.sm, color: Palette.textSecondary, lineHeight: 19 },
  bigBpm: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  bpmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  nudgeBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Lift,
  },
  nudgeGlyph: { fontSize: 26, lineHeight: 30, fontWeight: Type.weight.bold, color: Palette.text },
  pair: { flexDirection: 'row', gap: Spacing.sm },
  bigBtn: {
    flex: 1,
    borderRadius: Radii['2xl'],
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanBtn: { backgroundColor: '#2E9C66' },
  cleanBtnText: { fontSize: Type.size.lg, fontWeight: Type.weight.heavy, color: '#fff' },
  missBtn: {
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: '#E2A99B',
  },
  missBtnText: { fontSize: Type.size.md, fontWeight: Type.weight.bold, color: '#D9523E' },
  footnote: {
    fontSize: Type.size.xs,
    color: Palette.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  option: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii['2xl'],
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    ...Lift,
  },
  pressed: { transform: [{ scale: 0.985 }] },
  optionText: { fontSize: Type.size.md, color: Palette.text },
  handoffCard: {
    backgroundColor: Palette.accentSoft,
    borderColor: Palette.accent,
  },
  handoffTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
  },
  handoffLine: { fontSize: Type.size.md, color: Palette.textSecondary, lineHeight: 22 },
  handoffStrong: { fontWeight: Type.weight.heavy, color: Palette.text },
  doneCard: { backgroundColor: '#E4F2EA', borderColor: '#2E9C66' },
});
