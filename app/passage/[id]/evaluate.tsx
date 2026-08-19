// First-practice evaluation — measurements, no judgments.
//
// Fires the first time a passage is practiced (never at marking time): goal
// tempo → one probe at goal → find your starting tempo → deadline → hand off
// to a fully pre-filled Tempo Ladder. If the probe is clean, the passage needs
// no plan at all — it's marked performance-ready and the flow ends there (D6:
// the expert's first question is "how far is this from possible?").
//
// 2026-08-18 redesign (Ralph's mock-up, approved): the score and a real
// metronome live on every step. One metronome card (play/stop, slider, ±1
// nudges, live tempo word) is the single tempo surface; every commit button
// shows the number it commits ("Lock in ♩ = N"). The old typed-BPM field and
// the find-step miss button are gone — nudging IS the process. Deadline and
// handoff render as cards over the dimmed screen since no playing happens
// there.
//
// Everything measured here is remembered: goal → pieces.performance_tempo
// (every tool prefills from it), deadline → pieces.due_date, starting tempo +
// probe result → the 'evaluation' practice-log entry's data_json.

import Slider from '@react-native-community/slider';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RotateForPractice } from '@/components/RotateForPractice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ZoomableImage } from '@/components/ZoomableImage';
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
const BPM_MIN = 40;
const BPM_MAX = 208;
const DEFAULT_GOAL = 120;

const DUE_OPTIONS: { label: string; weeks: number | null }[] = [
  { label: 'This week', weeks: 1 },
  { label: 'In a couple of weeks', weeks: 2 },
  { label: 'In a month', weeks: 4 },
  { label: 'Further off', weeks: 9 },
  { label: 'No deadline', weeks: null },
];

function tempoWord(bpm: number): string {
  if (bpm < 60) return 'LARGO';
  if (bpm < 76) return 'ADAGIO';
  if (bpm < 108) return 'ANDANTE';
  if (bpm < 120) return 'MODERATO';
  if (bpm < 156) return 'ALLEGRO';
  if (bpm < 176) return 'VIVACE';
  return 'PRESTO';
}

export default function EvaluateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const metronome = useMetronome(DEFAULT_GOAL);
  // The unmount cleanup must see the latest metronome without re-running.
  const metronomeRef = useRef(metronome);
  metronomeRef.current = metronome;

  const [passage, setPassage] = useState<Passage | null>(null);
  const [inherited, setInherited] = useState<InheritedGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('goal');
  const [goal, setGoal] = useState<number | null>(null);
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
          if (!cancelled) {
            setInherited(g);
            // Pre-load the suggestion into the metronome so ▶ plays it as-is.
            if (g) metronomeRef.current.setBpm(clampBpm(g.bpm));
          }
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

  function clampBpm(v: number) {
    return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(v)));
  }
  function nudge(delta: number) {
    metronome.setBpm(clampBpm(metronome.bpm + delta));
  }

  // Every start()/stop() below runs inside a tap so the web AudioContext can
  // resume within the gesture.
  function lockGoal() {
    const g = metronome.bpm;
    setGoal(g);
    metronome.setBpm(g);
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
        goalInherited: inherited != null && goal === inherited.bpm,
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
    metronome.setBpm(clampBpm(findHuntStart(goal)));
    metronome.start();
    setStep('find');
  }

  function lockStart() {
    metronome.stop();
    setStep('due');
  }

  function pickDue(weeks: number | null) {
    if (passage) {
      const value = weeks == null ? 0 : Date.now() + weeks * WEEK_MS;
      updatePassageDueDate(passage.id, value).catch(() => {});
    }
    setStep('handoff');
  }

  async function finishHandoff() {
    if (!passage || !goal || saving) return;
    setSaving(true);
    const clean = metronome.bpm;
    const start = suggestedLadderStart(clean);
    try {
      await updatePassagePerformanceTempo(passage.id, goal);
      await logPractice(passage.id, 'evaluation', {
        goal,
        goalInherited: inherited != null && goal === inherited.bpm,
        probeClean: false,
        clean,
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

  const bpm = metronome.bpm;
  const running = metronome.running;
  const onSuggestion = inherited != null && bpm === inherited.bpm;
  const ladderStart = suggestedLadderStart(bpm);
  const overlayStep = step === 'due' || step === 'handoff' || step === 'done';
  const { height: winH, width: winW } = useWindowDimensions();
  const phone = Math.min(winH, winW) < 600;
  // Phones measure in landscape, like every practice screen: the score needs
  // the width. Portrait shows the same rotate gate the Tempo Ladder uses.
  const phoneLandscape = phone && winW > winH;
  // Overlay steps keep the previous screen visible (dimmed) behind the card.
  const bgStep: Step = !overlayStep ? step : step === 'done' ? 'probe' : 'find';

  const stepIndex = step === 'goal' || step === 'unsure' ? 0 : step === 'probe' ? 1 : 2;

  function header(title: string, subtitle: string) {
    return (
      <View style={styles.hdr}>
        <View style={styles.hdrRow}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={styles.backLink}>‹ Back</ThemedText>
          </Pressable>
          <View style={styles.prog}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.seg, i === stepIndex && styles.segOn]} />
            ))}
          </View>
          <ThemedText style={styles.passageName} numberOfLines={1}>
            {passage?.title ?? ''}
          </ThemedText>
        </View>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
      </View>
    );
  }

  // The score window is a clone of the passage view's hero card: same column,
  // same card material, same height rule — Ralph wants the two screens to
  // read as the same music window.
  const heroH = phone ? Math.round(winH * 0.32) : Math.min(620, Math.round(winH * 0.52));
  const scoreCard = passage?.source_uri ? (
    <View style={[styles.scoreCard, { height: heroH }]}>
      <ZoomableImage uri={passage.source_uri} style={styles.scoreImage} persistKey={passage.id} />
      <View style={styles.scoreFoot} pointerEvents="none">
        <ThemedText style={styles.pinchHint}>pinch to zoom</ThemedText>
      </View>
    </View>
  ) : null;

  // One-row metronome: every pixel it doesn't use goes to the score above.
  const metroCard = (
    <View style={[styles.metroCard, phoneLandscape && styles.metroCardShort]}>
      <Pressable
        onPress={() => (running ? metronome.stop() : metronome.start())}
        hitSlop={6}
        accessibilityLabel={running ? 'Stop the click' : 'Start the click'}
        style={[
          styles.playBtn,
          phoneLandscape && styles.playBtnShort,
          running && styles.playBtnRunning,
        ]}>
        <ThemedText style={styles.playGlyph}>{running ? '◼' : '▶'}</ThemedText>
      </Pressable>
      <View style={styles.readout}>
        <View style={styles.readoutRow}>
          <ThemedText style={styles.readoutPre}>♩ = </ThemedText>
          <ThemedText style={[styles.readoutBpm, phoneLandscape && styles.readoutBpmShort]}>
            {bpm}
          </ThemedText>
        </View>
        {/* The tempo word costs a text row — on the phone strip that vertical
            space belongs to the music instead. */}
        {!phoneLandscape && (
          <ThemedText style={styles.readoutWord}>BPM · {tempoWord(bpm)}</ThemedText>
        )}
      </View>
      <View style={styles.sliderGroup}>
      <Pressable
        onPress={() => nudge(-1)}
        onLongPress={() => nudge(-5)}
        hitSlop={6}
        style={[styles.nudgeBtn, phoneLandscape && styles.nudgeBtnShort]}>
        <ThemedText style={styles.nudgeGlyph}>−</ThemedText>
      </Pressable>
      <View style={styles.sliderWrap}>
        {Platform.OS === 'web' ? (
          <input
            type="range"
            min={BPM_MIN}
            max={BPM_MAX}
            step={1}
            value={Math.max(BPM_MIN, Math.min(BPM_MAX, bpm))}
            onChange={(e) => metronome.setBpm(clampBpm(parseInt(e.target.value, 10)))}
            style={{ width: '100%', accentColor: Palette.accent }}
          />
        ) : (
          <Slider
            minimumValue={BPM_MIN}
            maximumValue={BPM_MAX}
            step={1}
            value={Math.max(BPM_MIN, Math.min(BPM_MAX, bpm))}
            onValueChange={(v) => metronome.setBpm(clampBpm(v))}
            minimumTrackTintColor={Palette.accent}
            maximumTrackTintColor={Palette.border}
            style={{ width: '100%' }}
          />
        )}
      </View>
      <Pressable
        onPress={() => nudge(1)}
        onLongPress={() => nudge(5)}
        hitSlop={6}
        style={[styles.nudgeBtn, phoneLandscape && styles.nudgeBtnShort]}>
        <ThemedText style={styles.nudgeGlyph}>+</ThemedText>
      </Pressable>
      </View>
    </View>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {loading ? (
          <ThemedText style={[styles.muted, { padding: Spacing.lg }]}>Loading…</ThemedText>
        ) : !passage ? (
          <ThemedText style={{ padding: Spacing.lg }}>Passage not found.</ThemedText>
        ) : (
          <>
            {phoneLandscape ? (
              <>
                {passage.source_uri ? (
                  <ZoomableImage
                    uri={passage.source_uri}
                    style={StyleSheet.absoluteFill}
                    persistKey={passage.id}
                  />
                ) : null}
                <Pressable
                  onPress={() => (step === 'unsure' ? setStep('goal') : router.back())}
                  hitSlop={8}
                  style={[styles.phoneBack, { top: insets.top + 6, left: insets.left + 10 }]}>
                  <ThemedText style={styles.phoneBackText}>‹ Back</ThemedText>
                </Pressable>
                <View
                  pointerEvents="none"
                  style={[styles.phoneTitleWrap, { top: insets.top + 8 }]}>
                  <View style={styles.phoneTitlePill}>
                    <ThemedText style={styles.phoneTitleText}>
                      {bgStep === 'probe' && goal
                        ? `Try it once at ${goal}. Clean = nothing to practice.`
                        : bgStep === 'find'
                          ? 'Nudge up until it stops feeling easy, back off one notch'
                          : 'Set the goal tempo. This is full speed.'}
                    </ThemedText>
                  </View>
                </View>
                <View
                  style={[
                    styles.phoneBottomRow,
                    {
                      bottom: insets.bottom + 4,
                      left: insets.left + 12,
                      right: insets.right + 12,
                    },
                  ]}>
                  {bgStep === 'goal' || bgStep === 'unsure' ? (
                    <Pressable
                      onPress={() => setStep('unsure')}
                      style={[styles.phonePill, styles.phonePillGhost]}>
                      <ThemedText style={styles.phonePillText}>Not sure?</ThemedText>
                    </Pressable>
                  ) : bgStep === 'probe' && goal ? (
                    <Pressable
                      onPress={probeMissed}
                      style={[styles.phonePill, styles.phonePillMiss]}>
                      <ThemedText style={styles.phonePillMissText}>✗ Not yet</ThemedText>
                    </Pressable>
                  ) : null}
                  <View style={{ flex: 1 }}>{metroCard}</View>
                  {bgStep === 'goal' || bgStep === 'unsure' ? (
                    <Pressable
                      onPress={lockGoal}
                      style={[styles.phonePill, styles.phonePillAccent]}>
                      <ThemedText style={styles.phonePillText}>Lock in ♩ = {bpm}</ThemedText>
                    </Pressable>
                  ) : bgStep === 'probe' && goal ? (
                    <Pressable
                      onPress={finishProbeClean}
                      disabled={saving}
                      style={[styles.phonePill, styles.phonePillGreen]}>
                      <ThemedText style={styles.phonePillText}>✓ It was clean</ThemedText>
                    </Pressable>
                  ) : bgStep === 'find' && goal ? (
                    <Pressable
                      onPress={lockStart}
                      style={[styles.phonePill, styles.phonePillGreen]}>
                      <ThemedText style={styles.phonePillText}>Lock in ♩ = {bpm}</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
                {step === 'unsure' ? (
                  <View style={styles.overlay}>
                    <View style={styles.ovCard}>
                      <ScrollView contentContainerStyle={{ gap: Spacing.sm }}>
                        <ThemedText style={styles.ovTitle}>Help me pick a tempo</ThemedText>
                        <ThemedText style={styles.wayBody}>
                          📖 Many parts print ♩ = a number right at the tempo change.
                        </ThemedText>
                        <ThemedText style={styles.wayBody}>
                          🎧 Play a recording and move the slider until the click keeps pace.
                        </ThemedText>
                        <ThemedText style={styles.wayBody}>
                          🎼 Largo 40–60 · Andante 76–108 · Allegro 120–156 · Vivace 156–176 ·
                          Presto 168–200.
                        </ThemedText>
                        <Pressable onPress={lockGoal} style={styles.cta}>
                          <ThemedText style={styles.ctaText}>Lock in ♩ = {bpm}</ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => setStep('goal')}
                          hitSlop={8}
                          style={styles.ghost}>
                          <ThemedText style={styles.ghostText}>‹ back to the metronome</ThemedText>
                        </Pressable>
                      </ScrollView>
                    </View>
                  </View>
                ) : null}
              </>
            ) : bgStep === 'goal' ? (
              <>
                {header(
                  'Set the goal tempo',
                  "This is full speed. You'll ladder up to it, not start here."
                )}
                <ScrollView contentContainerStyle={styles.body}>
                  <View style={styles.col}>
                  {scoreCard}
                  {inherited ? (
                    <>
                      <ThemedText style={styles.hintLabel}>ⓘ Suggested goal tempo</ThemedText>
                      <Pressable
                        onPress={() => metronome.setBpm(clampBpm(inherited.bpm))}
                        style={[styles.suggestCard, !onSuggestion && styles.suggestCardOff]}>
                        <ThemedText style={styles.suggestNum}>{inherited.bpm}</ThemedText>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.suggestWhy}>
                            The tempo you set for “{inherited.fromTitle}”
                          </ThemedText>
                          <ThemedText style={styles.suggestFrom}>in this same section</ThemedText>
                        </View>
                        <View style={[styles.checkDot, !onSuggestion && styles.checkDotOff]}>
                          <ThemedText
                            style={[styles.checkGlyph, !onSuggestion && styles.checkGlyphOff]}>
                            ✓
                          </ThemedText>
                        </View>
                      </Pressable>
                    </>
                  ) : (
                    <ThemedText style={styles.hintLabel}>
                      ⓘ Check your part. The tempo is often printed right on it.
                    </ThemedText>
                  )}
                  {metroCard}
                  </View>
                </ScrollView>
                <View style={styles.footer}>
                  <Pressable onPress={lockGoal} style={styles.cta}>
                    <ThemedText style={styles.ctaText}>Lock in ♩ = {bpm}</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setStep('unsure')} hitSlop={8} style={styles.ghost}>
                    <ThemedText style={styles.ghostText}>Not sure? Help me pick a tempo</ThemedText>
                  </Pressable>
                </View>
              </>
            ) : bgStep === 'unsure' ? (
              <>
                {header(
                  'Help me pick a tempo',
                  'Three ways, easiest first. The metronome is live for all of them.'
                )}
                <ScrollView contentContainerStyle={styles.body}>
                  <View style={styles.col}>
                  <View style={styles.wayCard}>
                    <ThemedText style={styles.wayTitle}>📖 Check the printed marking</ThemedText>
                    <ThemedText style={styles.wayBody}>
                      Many parts print ♩ = a number right at the tempo change.
                    </ThemedText>
                  </View>
                  <View style={styles.wayCard}>
                    <ThemedText style={styles.wayTitle}>🎧 Match a recording</ThemedText>
                    <ThemedText style={styles.wayBody}>
                      Play a recording, then move the slider until the click keeps pace with it.
                    </ThemedText>
                  </View>
                  <View style={styles.wayCard}>
                    <ThemedText style={styles.wayTitle}>🎼 Guess from the tempo word</ThemedText>
                    <ThemedText style={styles.wayBody}>
                      Largo 40–60 · Andante 76–108 · Moderato 108–120 · Allegro 120–156 · Vivace
                      156–176 · Presto 168–200. Set the slider and listen.
                    </ThemedText>
                  </View>
                  {metroCard}
                  </View>
                </ScrollView>
                <View style={styles.footer}>
                  <Pressable onPress={lockGoal} style={styles.cta}>
                    <ThemedText style={styles.ctaText}>Lock in ♩ = {bpm}</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setStep('goal')} hitSlop={8} style={styles.ghost}>
                    <ThemedText style={styles.ghostText}>‹ back</ThemedText>
                  </Pressable>
                </View>
              </>
            ) : bgStep === 'probe' && goal ? (
              <>
                {header(
                  `Try it once at ${goal}`,
                  'The click is running. If that run is clean, there is nothing to practice.'
                )}
                <ScrollView contentContainerStyle={styles.body}>
                  <View style={styles.col}>
                    {scoreCard}
                    {metroCard}
                  </View>
                </ScrollView>
                <View style={styles.footer}>
                  <View style={styles.ctaPair}>
                    <Pressable
                      onPress={finishProbeClean}
                      disabled={saving}
                      style={[styles.cta, styles.ctaGreen, styles.ctaHalf]}>
                      <ThemedText style={styles.ctaText}>✓ It was clean</ThemedText>
                    </Pressable>
                    <Pressable onPress={probeMissed} style={[styles.cta, styles.ctaMiss, styles.ctaHalf]}>
                      <ThemedText style={[styles.ctaText, styles.ctaMissText]}>✗ Not yet</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : bgStep === 'find' && goal ? (
              <>
                {header(
                  'Find your starting tempo',
                  'Nudge the click up until it stops feeling easy, then back off one notch.'
                )}
                <ScrollView contentContainerStyle={styles.body}>
                  <View style={styles.col}>
                    {scoreCard}
                    {metroCard}
                  </View>
                </ScrollView>
                <View style={styles.footer}>
                  <Pressable onPress={lockStart} style={[styles.cta, styles.ctaGreen]}>
                    <ThemedText style={styles.ctaText}>
                      Lock in ♩ = {bpm}. This is where I'll start
                    </ThemedText>
                  </Pressable>
                  <ThemedText style={styles.footnote}>
                    Locking it in counts as your first logged rep on this passage.
                  </ThemedText>
                </View>
              </>
            ) : null}

            {step === 'due' ? (
              <View style={styles.overlay}>
                <View style={[styles.ovCard, phoneLandscape && styles.ovCardWide]}>
                  <ThemedText style={styles.ovTitle}>When does it need to be ready?</ThemedText>
                  <View style={phoneLandscape ? styles.dueGrid : styles.dueStack}>
                    {DUE_OPTIONS.map((o) => (
                      <Pressable
                        key={o.label}
                        onPress={() => pickDue(o.weeks)}
                        style={({ pressed }) => [
                          styles.option,
                          phoneLandscape && styles.optionChip,
                          pressed && styles.pressed,
                        ]}>
                        <ThemedText style={styles.optionText}>{o.label}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable onPress={() => setStep('handoff')} hitSlop={8} style={styles.ghost}>
                    <ThemedText style={styles.ghostText}>skip</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : step === 'handoff' && goal ? (
              <View style={styles.overlay}>
                <View style={styles.ovCard}>
                  <View style={styles.handoffCard}>
                    <ThemedText style={styles.ovTitle}>Tempo Ladder, set up for you</ThemedText>
                    <ThemedText style={styles.handoffLine}>
                      Start <ThemedText style={styles.handoffStrong}>{ladderStart}</ThemedText>, a
                      notch below the tempo you locked in, so the first rungs feel easy
                    </ThemedText>
                    <ThemedText style={styles.handoffLine}>
                      Goal <ThemedText style={styles.handoffStrong}>{goal}</ThemedText>
                      {inherited != null && goal === inherited.bpm
                        ? ', shared with its section'
                        : ', your goal tempo'}
                    </ThemedText>
                  </View>
                  <Pressable onPress={finishHandoff} disabled={saving} style={styles.cta}>
                    <ThemedText style={styles.ctaText}>
                      {saving ? 'Saving…' : 'Set up my ladder'}
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => router.back()} hitSlop={8} style={styles.ghost}>
                    <ThemedText style={styles.ghostText}>or pick a tool yourself</ThemedText>
                  </Pressable>
                  <ThemedText style={styles.footnote}>
                    From now on, every tool on this passage comes pre-filled with these numbers.
                  </ThemedText>
                </View>
              </View>
            ) : step === 'done' && goal ? (
              <View style={styles.overlay}>
                <View style={styles.ovCard}>
                  <View style={styles.doneCard}>
                    <ThemedText style={styles.ovTitle}>
                      That's it. Nothing to practice here.
                    </ThemedText>
                    <ThemedText style={styles.handoffLine}>
                      Marked performance-ready at {goal}. That rep is in your practice log.
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => router.back()} style={styles.cta}>
                    <ThemedText style={styles.ctaText}>Back to the page</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <RotateForPractice />
          </>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  hdr: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 2,
    gap: 2,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  hdrRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backLink: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
  },
  prog: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center' },
  seg: { width: 8, height: 8, borderRadius: 4, backgroundColor: Palette.borderStrong },
  segOn: { width: 34, backgroundColor: Palette.accent },
  passageName: {
    fontSize: Type.size.sm,
    color: Palette.textSecondary,
    fontWeight: Type.weight.semibold,
    maxWidth: 140,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  subtitle: { fontSize: Type.size.sm, color: Palette.textSecondary, lineHeight: 18 },
  body: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  col: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  muted: { color: Palette.textMuted },

  // Full-bleed: the score spans the device edge to edge, same as the
  // practice screens (Ralph's call — the column look shrank his music).
  // Mirrors index.tsx's heroScore card (same material, radius, border).
  scoreCard: {
    width: '100%',
    backgroundColor: Palette.inset,
    borderRadius: Radii.xl,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    overflow: 'hidden',
    position: 'relative',
  },
  scoreImage: { width: '100%', height: '100%' },
  scoreFoot: { position: 'absolute', bottom: 6, right: 12 },
  pinchHint: { fontSize: Type.size.xs, color: Palette.textMuted },

  hintLabel: {
    fontSize: Type.size.sm,
    color: Palette.textMuted,
    fontWeight: Type.weight.semibold,
    paddingHorizontal: 2,
  },
  suggestCard: {
    backgroundColor: Palette.card,
    borderWidth: 2,
    borderColor: Palette.accent,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  suggestCardOff: { borderColor: Palette.border, borderWidth: Borders.thin },
  suggestNum: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    fontVariant: ['tabular-nums'],
  },
  suggestWhy: { fontSize: Type.size.sm, fontWeight: Type.weight.bold, color: Palette.text },
  suggestFrom: { fontSize: Type.size.xs, color: Palette.textMuted },
  checkDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDotOff: { backgroundColor: Palette.surfaceSunk },
  checkGlyph: { fontSize: 14, fontWeight: Type.weight.heavy, color: '#fff', lineHeight: 17 },
  checkGlyphOff: { color: Palette.textMuted },

  metroCard: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    // On phone widths the slider wraps to its own full-width second row
    // instead of squeezing the play button and readout off the screen.
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    ...Lift,
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnRunning: { backgroundColor: Palette.danger },
  playGlyph: { fontSize: 20, lineHeight: 24, color: '#fff' },
  readout: { alignItems: 'center', minWidth: 108 },
  readoutRow: { flexDirection: 'row', alignItems: 'baseline' },
  readoutPre: { fontSize: 17, fontWeight: Type.weight.bold, color: Palette.textSecondary },
  readoutBpm: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  readoutWord: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: Palette.textMuted,
    fontWeight: Type.weight.bold,
  },
  nudgeBtn: {
    width: 44,
    height: 40,
    borderRadius: Radii.md,
    backgroundColor: Palette.surfaceSunk,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeGlyph: { fontSize: 20, lineHeight: 24, fontWeight: Type.weight.bold, color: Palette.text },
  // −/slider/+ travel as one unit: on phone widths the whole group wraps to
  // its own full-width row under the play button and readout.
  sliderGroup: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sliderWrap: { flex: 1, minWidth: 120, justifyContent: 'center' },
  // Vertical-only compaction for the phone-landscape strip: same widths and
  // slider, shorter everything, so the score above keeps more height.
  metroCardShort: { paddingVertical: 4 },
  playBtnShort: { width: 40, height: 40, borderRadius: 20 },
  readoutBpmShort: { fontSize: 26, lineHeight: 30 },
  nudgeBtnShort: { height: 32 },

  wayCard: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    gap: 4,
    ...Lift,
  },
  wayTitle: { fontSize: Type.size.md, fontWeight: Type.weight.bold, color: Palette.text },
  wayBody: { fontSize: Type.size.sm, color: Palette.textSecondary, lineHeight: 19 },

  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    gap: 2,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  cta: {
    backgroundColor: Palette.accent,
    borderRadius: Radii.xl,
    paddingVertical: 13,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaGreen: { backgroundColor: Palette.success },
  ctaPair: { flexDirection: 'row', gap: Spacing.sm },
  ctaHalf: { flex: 1 },
  ctaMiss: {
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.dangerGhostBorder,
  },
  ctaText: { fontSize: Type.size.lg, fontWeight: Type.weight.heavy, color: '#fff' },
  ctaMissText: { color: Palette.danger },
  ghost: { alignSelf: 'center', paddingVertical: 6 },
  ghostText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold, color: Palette.accent },
  footnote: {
    fontSize: Type.size.xs,
    color: Palette.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },

  phoneBack: { position: 'absolute', zIndex: 6, padding: 6 },
  phoneBackText: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
  },
  phoneTitleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  phoneTitlePill: {
    backgroundColor: '#000000aa',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    maxWidth: '76%',
  },
  phoneTitleText: {
    color: '#fff',
    fontSize: Type.size.sm,
    fontWeight: Type.weight.bold,
    textAlign: 'center',
  },
  // One bottom row on phone landscape: [left action] [metronome] [commit].
  phoneBottomRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 6,
  },
  phonePill: {
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    ...Lift,
  },
  phonePillAccent: { backgroundColor: Palette.accent },
  phonePillGreen: { backgroundColor: Palette.success },
  phonePillGhost: { backgroundColor: '#000000aa' },
  phonePillMiss: {
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.dangerGhostBorder,
  },
  phonePillText: { color: '#fff', fontSize: Type.size.md, fontWeight: Type.weight.heavy },
  phonePillMissText: {
    color: Palette.danger,
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(21,25,26,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    zIndex: 10,
  },
  ovCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii['2xl'],
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 440,
    maxHeight: '94%',
    gap: Spacing.sm,
    ...Lift,
  },
  ovTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
  },
  // Landscape phone: the five deadline options can't stack (taller than the
  // sideways screen), so they flow as a two-column grid on a wider card.
  ovCardWide: { maxWidth: 700 },
  dueStack: { gap: Spacing.sm },
  dueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optionChip: { flexGrow: 1, flexBasis: '45%', paddingVertical: 10, minHeight: 40 },
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
    borderWidth: Borders.thin,
    borderColor: Palette.accent,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    gap: 6,
  },
  handoffLine: { fontSize: Type.size.md, color: Palette.textSecondary, lineHeight: 22 },
  handoffStrong: { fontWeight: Type.weight.heavy, color: Palette.text },
  doneCard: {
    backgroundColor: Palette.successSoft,
    borderWidth: Borders.thin,
    borderColor: Palette.success,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    gap: 6,
  },
});
