import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AbcStaffView } from '@/components/AbcStaffView';
import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useMetronome } from '@/lib/audio/useMetronome';
import {
  isInstrumentReady,
  playMelody,
  preloadInstrument,
  SAMPLER_AVAILABLE,
  stopMelody,
} from '@/lib/audio/sampler';
import { buildExerciseAbc } from '@/lib/notation/buildExerciseAbc';
import { buildPitchAbc } from '@/lib/notation/buildPitchAbc';
import { logOnboardingStep } from '@/lib/onboarding/telemetry';
import { setPendingHandoff, type HandoffIntent } from '@/lib/onboarding/pendingHandoff';
import { seedBumblebeePiece } from '@/lib/onboarding/seedBumblebee';
import { useSession } from '@/lib/supabase/auth';
import {
  bucketForInstrument,
  bucketPatternPlayback,
  bucketPatternSchedule,
  bucketRunFreqs,
  bucketRunSchedule,
  bucketWrittenPitches,
  clefFor,
  gmForInstrument,
  keySignatureFor,
  ONBOARDING_INSTRUMENTS,
  soundShiftForInstrument,
  STARTER_GROUPING,
  STARTER_TEMPO,
  VARIATION_PATTERNS,
  type BumblebeeBucket,
} from '@/lib/onboarding/bumblebee';
import type { RhythmPattern } from '@/lib/strategies/rhythmPatterns';

// Value-first onboarding. A brand-new user feels the rhythm-variation strategy
// on Flight of the Bumblebee — the one strategy you can experience with empty
// hands — BEFORE being asked for any of their own music. Fixes the funnel leak
// where ~61% of signups never added a piece because step one demanded their
// instrument + sheet music up front. See [[project_onboarding_rhythm_redesign]].
//
// Flow: pick instrument (sets the written version) → hear the run → flip
// through rhythm variations (pitched playback) → payoff (1 of 6 strategies) →
// soft handoff to "add your own music".

type Step = 'instrument' | 'hook' | 'variations' | 'payoff';
const STEP_ORDER: Step[] = ['instrument', 'hook', 'variations', 'payoff'];

const STRATEGIES = [
  { name: 'Rhythm variations', hero: true },
  { name: 'Tempo ladder', hero: false },
  { name: 'Interleaved click-up', hero: false },
  { name: 'Micro-chaining', hero: false },
  { name: 'Macro-chaining', hero: false },
  { name: 'Rep rotator', hero: false },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ passageId?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const session = useSession();
  const signedIn = !!session;

  const metronome = useMetronome(STARTER_TEMPO);

  const [step, setStep] = useState<Step>('instrument');
  const [bucket, setBucket] = useState<BumblebeeBucket | null>(null);
  const [instrumentName, setInstrumentName] = useState<string | null>(null);
  // Which sound is playing: 'run' for the hook, or a variation pattern id.
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  // Which sound is still loading its samples (shows a spinner on that control).
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  // Variations reveal in batches so the full list doesn't overwhelm.
  const [shownVariations, setShownVariations] = useState(4);

  const gm = instrumentName ? gmForInstrument(instrumentName) : null;
  const soundShift = instrumentName ? soundShiftForInstrument(instrumentName) : 0;

  // If we came back from the user's own photo/mark round-trip (?passageId),
  // they've already added music — drop them into the guided rhythm tool on
  // their passage rather than replaying the Bumblebee intro.
  useEffect(() => {
    if (params.passageId) {
      router.replace(`/passage/${params.passageId}/rhythmic?guided=1` as never);
    }
  }, [params.passageId, router]);

  useEffect(() => {
    void logOnboardingStep('rhythm_intro_started');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop any playback when the screen unmounts.
  useEffect(() => {
    return () => {
      metronome.stopPitchSequence();
      stopMelody();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On the synth fallback (native), clear the active highlight when the
  // metronome sequence finishes. With the sampler (web), an onEnd callback
  // clears it instead — so this must NOT run there, or it would clear the
  // highlight immediately (the metronome never plays on web).
  useEffect(() => {
    if (!SAMPLER_AVAILABLE && !metronome.playingSequence && playingKey !== null) {
      setPlayingKey(null);
    }
  }, [metronome.playingSequence, playingKey]);

  function stopAllAudio() {
    metronome.stopPitchSequence();
    stopMelody();
  }

  function goStep(next: Step) {
    stopAllAudio();
    setPlayingKey(null);
    setLoadingKey(null);
    setStep(next);
  }

  function pickInstrument(name: string) {
    const b = bucketForInstrument(name);
    setInstrumentName(name);
    setBucket(b);
    // Warm the instrument's samples so the hook's ▶ plays without a wait.
    if (SAMPLER_AVAILABLE) preloadInstrument(gmForInstrument(name));
    void logOnboardingStep('instrument_picked', { instrument: name, bucket: b.id });
    goStep('hook');
  }

  // Start a sampled melody (web) or fall back to the synth (native). Manages
  // the playing + loading highlight for `key`.
  function startMelody(key: string, schedule: () => void, synthFallback: () => void) {
    stopAllAudio();
    setPlayingKey(key);
    if (SAMPLER_AVAILABLE && gm) {
      if (!isInstrumentReady(gm)) setLoadingKey(key);
      schedule();
    } else {
      synthFallback();
    }
  }

  function toggleRun() {
    if (!bucket) return;
    if (playingKey === 'run') {
      stopAllAudio();
      setPlayingKey(null);
      setLoadingKey(null);
      return;
    }
    void logOnboardingStep('heard_run');
    // A fast, even run — "here's what fast sounds like" before we slow it down.
    startMelody(
      'run',
      () => {
        void playMelody(gm!, bucketRunSchedule(bucket, 0.11, soundShift), () =>
          setPlayingKey((k) => (k === 'run' ? null : k)),
        ).finally(() => setLoadingKey((k) => (k === 'run' ? null : k)));
      },
      () => metronome.playPitchSequence(bucketRunFreqs(bucket), 0.09),
    );
  }

  function toggleVariation(pattern: RhythmPattern) {
    if (!bucket) return;
    const key = `v${pattern.id}`;
    if (playingKey === key) {
      stopAllAudio();
      setPlayingKey(null);
      setLoadingKey(null);
      return;
    }
    void logOnboardingStep('played_variation', { pattern: pattern.id });
    startMelody(
      key,
      () => {
        void playMelody(
          gm!,
          bucketPatternSchedule(bucket, pattern, STARTER_TEMPO, soundShift),
          () => setPlayingKey((k) => (k === key ? null : k)),
        ).finally(() => setLoadingKey((k) => (k === key ? null : k)));
      },
      () => {
        const { freqs, tokens, beatDenom } = bucketPatternPlayback(bucket, pattern);
        if (freqs.length === 0) return;
        metronome.playPitchRhythm(freqs, tokens, beatDenom);
      },
    );
  }

  const [leaving, setLeaving] = useState(false);

  // The payoff handoff. Signed-in (rare — an existing empty account that landed
  // here): do it directly. Signed-out (the normal value-first path): stash the
  // intent + instrument and send them to create an account; the sign-in screen
  // finishes the job (seed Bumblebee, then land them where they intended).
  async function handoff(intent: HandoffIntent) {
    if (leaving) return;
    setLeaving(true);
    stopAllAudio();
    void logOnboardingStep(intent === 'upload' ? 'chose_add_music' : 'chose_later');
    if (signedIn) {
      if (bucket) {
        try {
          await seedBumblebeePiece(bucket);
        } catch {
          // best-effort
        }
      }
      router.replace((intent === 'upload' ? '/upload?coach=1' : '/library') as never);
    } else {
      if (bucket) setPendingHandoff({ intent, bucketId: bucket.id });
      router.replace('/sign-in' as never);
    }
  }

  const staffWidth = Math.min(width, 520) - Spacing.lg * 2;
  const progress = (STEP_ORDER.indexOf(step) / (STEP_ORDER.length - 1)) * 100;

  // ── instrument picker ──────────────────────────────────────────────────────
  function InstrumentList() {
    let lastGroup = '';
    return (
      <View style={styles.actions}>
        {ONBOARDING_INSTRUMENTS.map((it) => {
          const header = it.group !== lastGroup ? it.group : null;
          lastGroup = it.group;
          return (
            <View key={it.name}>
              {header ? (
                <ThemedText style={[styles.group, { color: Palette.textMuted }]}>
                  {header}
                </ThemedText>
              ) : null}
              <Pressable
                onPress={() => pickInstrument(it.name)}
                style={({ pressed }) => [
                  styles.option,
                  { backgroundColor: pressed ? Palette.accentSoft : Palette.card },
                ]}>
                <ThemedText style={styles.optionTitle}>{it.name}</ThemedText>
              </Pressable>
            </View>
          );
        })}
      </View>
    );
  }

  // ── one variation card ─────────────────────────────────────────────────────
  function VariationCard({ pattern, num }: { pattern: RhythmPattern; num: number }) {
    if (!bucket) return null;
    const playing = playingKey === `v${pattern.id}`;
    const loading = loadingKey === `v${pattern.id}`;
    const abc = buildExerciseAbc(
      bucketWrittenPitches(bucket),
      keySignatureFor(bucket),
      clefFor(bucket),
      pattern,
    );
    return (
      <View style={[styles.varCard, { borderColor: Palette.border }, Lift]}>
        <View style={styles.varHeader}>
          <Pressable
            onPress={() => toggleVariation(pattern)}
            hitSlop={8}
            style={[
              styles.playBtn,
              { backgroundColor: playing ? Palette.danger : Palette.accent },
            ]}>
            <ThemedText style={styles.playText}>
              {loading ? '⋯' : playing ? '■' : '▶'}
            </ThemedText>
          </Pressable>
          <ThemedText style={[styles.varNum, { color: Palette.textSecondary }]}>
            {num}
          </ThemedText>
        </View>
        <AbcStaffView
          abc={abc}
          width={staffWidth - 24}
          height={130}
          autoHeight
          wrap
          centered
          fallbackText={pattern.notes.join('  ')}
        />
      </View>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topRow, { paddingTop: insets.top + 10 }]}>
        {step !== 'instrument' ? (
          <Pressable
            onPress={() => goStep(STEP_ORDER[STEP_ORDER.indexOf(step) - 1])}
            hitSlop={8}
            style={styles.backBtn}>
            <ThemedText style={[styles.backText, { color: Palette.accent }]}>
              ‹ Back
            </ThemedText>
          </Pressable>
        ) : (
          <View style={{ width: 48 }} />
        )}
        <View style={[styles.track, { backgroundColor: Palette.track }]}>
          <View
            style={[styles.fill, { backgroundColor: Palette.accent, width: `${progress}%` }]}
          />
        </View>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {step === 'instrument' && (
          <View>
            <ThemedText style={[styles.kicker, { color: Palette.accent }]}>
              WELCOME TO PLAY FAST NOTES
            </ThemedText>
            <ThemedText style={styles.h1}>First — what do you play?</ThemedText>
            <ThemedText style={[styles.lead, { color: Palette.textSecondary }]}>
              We’ll show you everything in your instrument’s clef and key.
            </ThemedText>
            <InstrumentList />
            {!signedIn ? (
              <Pressable
                onPress={() => router.push('/sign-in' as never)}
                hitSlop={8}
                style={styles.signInRow}>
                <ThemedText style={[styles.signInText, { color: Palette.textSecondary }]}>
                  Already have an account?{' '}
                  <ThemedText style={{ color: Palette.accent, fontWeight: Type.weight.bold }}>
                    Sign in
                  </ThemedText>
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        )}

        {step === 'hook' && bucket && (
          <View>
            <ThemedText style={[styles.kicker, { color: Palette.accent }]}>
              EVER TRIED TO PLAY SOMETHING FAST?
            </ThemedText>
            <ThemedText style={styles.h1}>Here’s Flight of the Bumblebee.</ThemedText>
            <ThemedText style={[styles.lead, { color: Palette.textSecondary }]}>
              Your part — written for {instrumentName?.toLowerCase()}.
            </ThemedText>
            <View style={[styles.scoreCard, { borderColor: Palette.border }, Lift]}>
              <AbcStaffView
                abc={buildPitchAbc(
                  bucketWrittenPitches(bucket),
                  keySignatureFor(bucket),
                  clefFor(bucket),
                  { beamGroup: STARTER_GROUPING },
                )}
                width={staffWidth - 24}
                height={120}
                autoHeight
                centered
                fitWidth
              />
            </View>
            <View style={[styles.nudge, { backgroundColor: Palette.accentSoft }]}>
              <ThemedText style={[styles.nudgeText, { color: Palette.accentDeep }]}>
                🔊 Turn your sound on.
              </ThemedText>
            </View>
            <View style={styles.actions}>
              <Button
                label={
                  loadingKey === 'run'
                    ? 'Loading sound…'
                    : playingKey === 'run'
                      ? '■ Stop'
                      : '▶ Hear it at speed'
                }
                onPress={toggleRun}
                fullWidth
              />
              <Button
                label="Too fast? That’s the point →"
                variant="ghost"
                onPress={() => goStep('variations')}
              />
            </View>
          </View>
        )}

        {step === 'variations' && bucket && (
          <View>
            <ThemedText style={[styles.kicker, { color: Palette.accent }]}>
              THE TRICK
            </ThemedText>
            <ThemedText style={styles.h1}>Practice it in different rhythms.</ThemedText>
            <ThemedText style={[styles.lead, { color: Palette.textSecondary }]}>
              Tap play, then play along — or just listen.
            </ThemedText>
            <View style={styles.varList}>
              {VARIATION_PATTERNS.slice(0, shownVariations).map((p, i) => (
                <VariationCard key={p.id} pattern={p} num={i + 1} />
              ))}
            </View>
            <View style={styles.actions}>
              {shownVariations < VARIATION_PATTERNS.length ? (
                <Button
                  label="Show me more variations →"
                  variant="outline"
                  onPress={() =>
                    setShownVariations((n) =>
                      Math.min(n + 4, VARIATION_PATTERNS.length),
                    )
                  }
                  fullWidth
                />
              ) : null}
              <Button label="I get it →" onPress={() => goStep('payoff')} fullWidth />
            </View>
          </View>
        )}

        {step === 'payoff' && (
          <View style={styles.centered}>
            <View style={[styles.cele, { backgroundColor: Palette.successSoft }]}>
              <ThemedText style={[styles.celeMark, { color: Palette.success }]}>✓</ThemedText>
            </View>
            <ThemedText style={[styles.h1, { textAlign: 'center' }]}>
              That’s rhythm variations.
            </ThemedText>
            <ThemedText
              style={[styles.lead, { color: Palette.textSecondary, textAlign: 'center' }]}>
              One of six guided strategies in here — all backed by practice science,
              all better than just playing it over and over. And you can build
              exercises like these from the music you’re actually learning.
            </ThemedText>
            <View style={styles.chips}>
              {STRATEGIES.map((s) => (
                <View
                  key={s.name}
                  style={[
                    styles.chip,
                    s.hero
                      ? { backgroundColor: Palette.accent }
                      : { backgroundColor: Palette.surfaceSunk },
                  ]}>
                  <ThemedText
                    style={[
                      styles.chipText,
                      { color: s.hero ? '#fff' : Palette.textSecondary },
                    ]}>
                    {s.name}
                  </ThemedText>
                </View>
              ))}
            </View>
            <View style={styles.actions}>
              <Button
                label="Now try it on your own music"
                onPress={() => void handoff('upload')}
                disabled={leaving}
                fullWidth
              />
              <Button
                label={
                  leaving
                    ? 'One sec…'
                    : signedIn
                      ? 'Maybe later'
                      : 'Save it for later'
                }
                variant="ghost"
                onPress={() => void handoff('library')}
                disabled={leaving}
              />
              {!signedIn ? (
                <ThemedText style={[styles.fineprint, { color: Palette.textMuted }]}>
                  Free account — keeps Flight of the Bumblebee and your progress.
                </ThemedText>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backBtn: { width: 48 },
  backText: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  body: {
    flexGrow: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  centered: { gap: Spacing.sm },
  kicker: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xs,
    fontWeight: Type.weight.heavy,
    letterSpacing: 1,
    marginBottom: 2,
  },
  h1: {
    fontFamily: Fonts.rounded,
    fontSize: 24,
    fontWeight: Type.weight.bold,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: Palette.text,
  },
  lead: { fontSize: Type.size.md, lineHeight: 22, marginTop: 2 },
  group: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  actions: { gap: Spacing.sm, marginTop: Spacing.lg },
  option: {
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    paddingVertical: 13,
    paddingHorizontal: 16,
    ...Lift,
  },
  optionTitle: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
    color: Palette.text,
  },
  scoreCard: {
    borderWidth: Borders.thin,
    borderRadius: Radii['2xl'],
    backgroundColor: Palette.card,
    padding: Spacing.md,
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  nudge: {
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  nudgeText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold },
  varList: { gap: Spacing.md, marginTop: Spacing.md },
  varCard: {
    borderWidth: Borders.thin,
    borderRadius: Radii['2xl'],
    backgroundColor: Palette.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  varHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.md,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { color: '#fff', fontSize: Type.size.lg, fontWeight: Type.weight.bold },
  varNum: { fontSize: Type.size.md, fontWeight: Type.weight.heavy },
  cele: {
    width: 56,
    height: 56,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  celeMark: { fontSize: 28, fontWeight: Type.weight.heavy },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  chip: {
    borderRadius: Radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold },
  fineprint: {
    fontSize: Type.size.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 16,
  },
  signInRow: { alignSelf: 'center', marginTop: Spacing.lg, padding: Spacing.sm },
  signInText: { fontSize: Type.size.sm },
});
