import Feather from '@expo/vector-icons/Feather';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AbcStaffView } from '@/components/AbcStaffView';
import { Button } from '@/components/Button';
import { RhythmBar } from '@/components/RhythmBar';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeToolsBar } from '@/components/PracticeToolsBar';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { RotateForPractice } from '@/components/RotateForPractice';
import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { ScoreWithMarkers } from '@/components/ScoreWithMarkers';
import { SessionTopBar } from '@/components/SessionTopBar';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { ZoomableImage } from '@/components/ZoomableImage';
import { Colors } from '@/constants/theme';
import { Lift, Palette } from '@/constants/palette';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { buildRhythmAbc } from '@/lib/notation/buildAbc';
import { isToolsOnly } from '@/lib/strategies/toolsMode';
import { TOOLS_RHYTHMIC_HELP } from '@/constants/toolsHelp';
import { useMetronome } from '@/lib/audio/useMetronome';
import {
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';
import {
  parseBeatDenominator,
  patternsByGrouping,
  RHYTHM_PATTERNS,
  type Grouping,
  type RhythmPattern,
} from '@/lib/strategies/rhythmPatterns';

const GROUPING_CHOICES: { n: Grouping; abc: string; w: number }[] = [
  { n: 3, abc: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB', w: 70 },
  { n: 4, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBB', w: 90 },
  { n: 5, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBB', w: 100 },
  { n: 6, abc: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB BBB', w: 120 },
  { n: 7, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBBBB', w: 130 },
  { n: 8, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBBBBB', w: 140 },
];

function groupingCounts(): Record<Grouping, number> {
  const out = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 } as Record<Grouping, number>;
  for (const p of RHYTHM_PATTERNS) out[p.grouping] += 1;
  return out;
}

export default function RhythmicScreen() {
  const params = useLocalSearchParams<{ id: string; grouping?: string; guided?: string }>();
  const id = params.id;
  // Guided onboarding: the quiz routes "even & running" passages here with
  // ?guided=1. The flow is an intro screen → play with a sensible default
  // grouping (4-note / even sixteenths) → a single guided celebration → library.
  const rawGuided = Array.isArray(params.guided) ? params.guided[0] : params.guided;
  const isGuided = rawGuided === '1';
  // Tools mode: reached from the library Tools hub via the sentinel id, no
  // piece attached. The rhythm patterns come from a built-in library, so the
  // tool runs identically; we just skip the score backdrop and the
  // passage-keyed practice-log write.
  const toolsOnly = isToolsOnly(id);
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors } = useStrategyColors();
  // Rhythmic Variation's strategy color (violet by default; respects a user
  // override). Themes the run-screen tracker chip + the Done link.
  const ACCENT = colors.rhythmic;
  const insets = useSafeAreaInsets();
  // Phone density flag — drives the scrollable score below.
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  const isTouch = useIsTouchDevice();

  const rawGrouping = Array.isArray(params.grouping)
    ? params.grouping[0]
    : params.grouping;
  const parsedGrouping = rawGrouping ? parseInt(rawGrouping, 10) : NaN;
  const initialGrouping =
    parsedGrouping >= 3 && parsedGrouping <= 8 ? (parsedGrouping as Grouping) : null;

  const [phase, setPhase] = useState<'intro' | 'group' | 'config' | 'playing'>(
    isGuided ? 'intro' : initialGrouping ? 'playing' : 'config',
  );
  const [passage, setPassage] = useState<Passage | null>(null);
  const [grouping, setGrouping] = useState<Grouping | null>(initialGrouping);
  const [patterns, setPatterns] = useState<RhythmPattern[]>(
    initialGrouping ? patternsByGrouping(initialGrouping) : [],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  // When true, re-show the grouping picker overlay so the user can switch
  // groupings mid-session without leaving the screen.
  const [pickerOpen, setPickerOpen] = useState(false);

  const metronome = useMetronome(80);
  const microbreak = useMicrobreakTimer();

  const ann = useScoreAnnotation(passage);

  useEffect(() => {
    let cancelled = false;
    // Skip the passage fetch in Tools mode — the sentinel id is not a real
    // piece, and there's no score to show.
    if (id && !toolsOnly) {
      getPassage(id).then((p) => {
        if (!cancelled) setPassage(p);
      });
    }
    return () => {
      cancelled = true;
      metronome.stop();
      metronome.stopRhythmLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, toolsOnly]);

  // Microbreak cadence is work-based, not wall-clock: fire after advancing
  // through N patterns (N from the Micro timer settings). trigger() self-gates
  // on the Micro timer being enabled.
  const advanceCountRef = useRef(0);

  function startWithGrouping(g: Grouping) {
    const list = patternsByGrouping(g);
    if (list.length === 0) return;
    // Stop any in-flight rhythm loop — the pattern being looped is about
    // to disappear from the visible card.
    metronome.stopRhythmLoop();
    setGrouping(g);
    setPatterns(list);
    setCurrentIndex(0);
    advanceCountRef.current = 0;
    setPhase('playing');
    setPickerOpen(false);
  }

  function doneSession() {
    // Tools-only mode has no piece to log against — just leave, no log prompt.
    if (toolsOnly) {
      exitSession();
      return;
    }
    setNotePromptVisible(true);
  }

  async function finishLog(
    mood: string | null,
    note: string | null,
    remindNext: boolean = false,
  ) {
    setNotePromptVisible(false);
    if (id && !toolsOnly) {
      await stampLastUsed(id, 'rhythmic');
      const data: Record<string, unknown> = {};
      if (mood) data.mood = mood;
      if (note) data.note = note;
      if (remindNext) data.remindNext = true;
      await logPractice(
        id,
        'rhythmic',
        Object.keys(data).length > 0 ? data : undefined,
      );
    }
    metronome.stop();
    metronome.stopRhythmLoop();
    router.back();
  }

  function exitSession() {
    metronome.stop();
    metronome.stopRhythmLoop();
    router.back();
  }

  // Guided onboarding finish: log the session, then land the first-timer in
  // their library (with the one-time orientation overlay) instead of
  // router.back() into the murky replace-stack.
  async function finishGuidedToLibrary() {
    if (id && !toolsOnly) {
      await stampLastUsed(id, 'rhythmic');
      await logPractice(id, 'rhythmic', undefined);
    }
    metronome.stop();
    metronome.stopRhythmLoop();
    router.replace('/(tabs)/library?welcome=1' as never);
  }

  function onPrev() {
    const next = Math.max(0, currentIndex - 1);
    if (next === currentIndex) return;
    setCurrentIndex(next);
    if (metronome.rhythmLooping && patterns[next]) {
      metronome.startRhythmLoop(
        patterns[next].notes,
        parseBeatDenominator(patterns[next].timeSig),
      );
    }
  }
  function onNext() {
    const next = Math.min(patterns.length - 1, currentIndex + 1);
    if (next === currentIndex) return;
    setCurrentIndex(next);
    advanceCountRef.current += 1;
    const everyN = microbreak.config.rhythmicPatterns || 4;
    if (advanceCountRef.current % everyN === 0) microbreak.trigger();
    if (metronome.rhythmLooping && patterns[next]) {
      metronome.startRhythmLoop(
        patterns[next].notes,
        parseBeatDenominator(patterns[next].timeSig),
      );
    }
  }

  function toggleRhythm() {
    const current = patterns[currentIndex];
    if (!current) return;
    metronome.toggleRhythmLoop(
      current.notes,
      parseBeatDenominator(current.timeSig),
    );
  }

  // In Tools mode there's no passage to wait for — render straight through.
  if (!passage && !toolsOnly) return <ThemedView style={{ flex: 1 }} />;

  // ── INTRO (guided onboarding only) ──────────────────────────────────────
  // A clean quiz-style framing screen for the alien-but-powerful idea, then
  // straight to play with a sensible default grouping. All the how-to lives
  // here so the playing screen needs no modal.
  if (isGuided && phase === 'intro') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: Spacing.lg }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
              ‹ Back
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{
            padding: Spacing.lg,
            gap: Spacing.md,
            maxWidth: 480,
            width: '100%',
            alignSelf: 'center',
            flexGrow: 1,
          }}>
          <ThemedText type="title">A trick for evening it out</ThemedText>
          <ThemedText style={{ opacity: 0.85, lineHeight: 22 }}>
            When a fast run sounds lumpy, practicing it in lopsided rhythms —
            long-short, short-long, and stranger ones — forces every note to be
            even. It’s one of the quickest ways to clean up a passage.
          </ThemedText>
          <ThemedText style={{ opacity: 0.85, lineHeight: 22 }}>
            You’ll get a new rhythm each time. Tap{' '}
            <ThemedText style={{ fontWeight: Type.weight.heavy }}>▶ Loop</ThemedText>{' '}
            to hear it, play your passage that way a few times, then tap{' '}
            <ThemedText style={{ fontWeight: Type.weight.heavy }}>Next</ThemedText>{' '}
            for another.
          </ThemedText>
        </ScrollView>
        <View style={{ padding: 20, gap: 10 }}>
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Button
              label="Next: choose a grouping →"
              onPress={() => setPhase('group')}
              fullWidth
            />
          </View>
        </View>
      </ThemedView>
    );
  }

  // ── CHOOSE A GROUPING (guided onboarding only) ──────────────────────────
  // Grouping is passage-dependent (sixteenths = 4, sextuplets = 6, triplets =
  // 3…), so it can't be defaulted — the user has to match it to their music.
  // Present the same illustrated chips as the normal picker, but as a clean
  // full-screen step with plainer language.
  if (isGuided && phase === 'group') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: Spacing.lg }}>
          <Pressable onPress={() => setPhase('intro')} hitSlop={8}>
            <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
              ‹ Back
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{
            padding: Spacing.lg,
            gap: Spacing.md,
            maxWidth: 480,
            width: '100%',
            alignSelf: 'center',
          }}>
          <ThemedText type="title">How are the notes grouped?</ThemedText>
          <ThemedText style={{ opacity: 0.85, lineHeight: 22 }}>
            Look at your fast run — how many notes are beamed together in one
            group? Tap the picture that matches.
          </ThemedText>
          <View style={styles.groupingGrid}>
            {GROUPING_CHOICES.map(({ n, abc, w }) => (
              <Pressable
                key={n}
                onPress={() => startWithGrouping(n)}
                style={[styles.groupingChip, { borderColor: Palette.border, backgroundColor: Palette.card }]}>
                <AbcStaffView
                  abc={abc}
                  width={w}
                  height={isPhone ? 44 : 60}
                  hideStaffLines
                  centered
                />
                <ThemedText style={styles.groupingNum}>{n}</ThemedText>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  const counts = groupingCounts();

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      {phase === 'playing' && grouping ? (
        <>
          {/* ── Reskinned run top bar (all devices) — coral Exit (left) ·
              centered "Pattern n/N · grouping ▾" tracker (centre). The tools
              pill floats top-right (rendered at root, below). Mirrors Tempo
              Ladder / Click-Up. */}
          <View style={[styles.runTopBar, { paddingTop: insets.top + 10 }]}>
            <View style={styles.runSide}>
              <Pressable onPress={exitSession} hitSlop={8} style={styles.runExit}>
                <Feather name="log-out" size={15} color={Palette.danger} />
                <ThemedText style={styles.runExitText}>Exit</ThemedText>
              </Pressable>
            </View>
            <View style={styles.runCenter}>
              <View style={styles.runStatPill}>
                <ThemedText style={styles.runStatLabel}>Pattern</ThemedText>
                <ThemedText style={styles.runStatCount}>
                  {currentIndex + 1}/{patterns.length}
                </ThemedText>
                <View style={styles.runStatDivider} />
                <Pressable
                  onPress={() => setPickerOpen(true)}
                  hitSlop={6}
                  accessibilityLabel="Change note grouping"
                  style={[styles.groupingChipRun, { backgroundColor: ACCENT + '1A' }]}>
                  <ThemedText style={[styles.groupingChipRunText, { color: ACCENT }]}>
                    {grouping}-note
                  </ThemedText>
                  <Feather name="chevron-down" size={13} color={ACCENT} />
                </Pressable>
              </View>
            </View>
            <View style={styles.runSide} />
          </View>

          {/* Loop band — ▶ Loop · ‹ · rhythm notation · › (no score in Tools
              mode, where the staff is the centerpiece in the body instead). */}
          {!toolsOnly && patterns.length > 0 && (
            <RhythmBar
              pattern={patterns[currentIndex]}
              rhythmLooping={metronome.rhythmLooping}
              onToggleRhythm={toggleRhythm}
              onPrev={onPrev}
              onNext={onNext}
              canPrev={currentIndex > 0}
              canNext={currentIndex < patterns.length - 1}
              compact={isPhone}
            />
          )}
        </>
      ) : (
        <SessionTopBar
          onExit={() => router.back()}
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Rhythmic Variation
            </ThemedText>
          }
        />
      )}

      <View
        style={[
          styles.contentArea,
          // Laptop: inset the score from the screen edges so it clears the
          // edge-docked tool tabs and gets top/bottom breathing room. The
          // score lives in an inner flex child (an absolutely-filled score
          // ignores this padding on web); PracticeToolsLayer stays a
          // sibling at the true screen edge. Phone keeps full-bleed zoom.
          !isPhone && {
            paddingHorizontal: SCORE_SIDE_BUFFER,
            paddingVertical: SCORE_VERT_BUFFER,
            backgroundColor: SCORE_FRAME_BG,
          },
        ]}>
        <View style={{ flex: 1, width: '100%', position: 'relative' }}>
          {/* No score in Tools mode — the rhythm bar + metronome are all the
              tool needs; the body stays empty. */}
          {passage &&
            (isTouch ? (
              // Phone: show the full passage by default, let the user pinch
              // in (and one-finger pan) to read notes up close. Replaces the
              // earlier horizontal-scroll-only approach so the user can
              // also zoom vertically when a passage has tall barlines or
              // multi-line systems.
              <ZoomableImage
                uri={passage.source_uri}
                style={StyleSheet.absoluteFill}
                persistKey={passage.id}
              />
            ) : (
              <ScoreWithMarkers
                uri={passage.source_uri}
                markers={[]}
                mode="play"
                activePair={null}
              />
            ))}
          {/* Tools mode: no score, so make the rhythm itself the centerpiece —
              a large, centered staff with the Loop / Prev / Next controls right
              beneath it. (In a piece these live in the RhythmBar up top.) */}
          {toolsOnly && phase === 'playing' && grouping && patterns.length > 0 && (
            <View style={styles.toolsStage} pointerEvents="box-none">
              <AbcStaffView
                abc={buildRhythmAbc(patterns[currentIndex], { bare: true })}
                width={Math.round(
                  Math.max(
                    220,
                    Math.min(
                      (50 + patterns[currentIndex].notes.length * 42) * (2 / 1.1),
                      vpW - 48,
                    ),
                  ),
                )}
                height={150}
                scale={2}
                fallbackText={patterns[currentIndex].notes.join('  ·  ')}
              />
              <View style={styles.toolsControls}>
                <Pressable
                  onPress={toggleRhythm}
                  hitSlop={6}
                  accessibilityLabel={metronome.rhythmLooping ? 'Stop rhythm' : 'Loop rhythm'}
                  style={[
                    styles.toolsLoopBtn,
                    { backgroundColor: metronome.rhythmLooping ? Palette.danger : C.tint },
                  ]}>
                  <ThemedText style={styles.toolsLoopText}>
                    {metronome.rhythmLooping ? '■ Stop' : '▶ Loop'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={onPrev}
                  disabled={currentIndex === 0}
                  hitSlop={6}
                  accessibilityLabel="Previous pattern"
                  style={[
                    styles.toolsNavBtn,
                    { borderColor: C.tint, opacity: currentIndex === 0 ? 0.3 : 1 },
                  ]}>
                  <ThemedText style={[styles.toolsNavText, { color: C.tint }]}>← Prev</ThemedText>
                </Pressable>
                <Pressable
                  onPress={onNext}
                  disabled={currentIndex >= patterns.length - 1}
                  hitSlop={6}
                  accessibilityLabel="Next pattern"
                  style={[
                    styles.toolsNavBtn,
                    styles.toolsNextBtn,
                    // Match the Rhythm Variations strategy color (the pill), not
                    // the old hardcoded purple.
                    { backgroundColor: colors.rhythmic, borderColor: colors.rhythmic },
                    { opacity: currentIndex >= patterns.length - 1 ? 0.4 : 1 },
                  ]}>
                  <ThemedText style={[styles.toolsNavText, { color: '#fff' }]}>Next →</ThemedText>
                </Pressable>
              </View>
            </View>
          )}
          {/* Annotation canvas stays mounted on tablet/desktop. On phone
              it's hidden during rhythmic — the canvas would have to scroll
              with the score to stay aligned, and the user's ask was about
              seeing notes clearly, not annotating in this flow. */}
          {!isPhone && !toolsOnly && ann.canvas}
        </View>
        {/* Guided onboarding keeps the surface minimal — only a collapsed
            metronome tab (no note → starts closed) so the user can add a
            steady pulse alongside the RhythmBar's ▶ Loop if they want.
            Non-guided uses the floating PracticeToolsBar (rendered at root,
            below) instead of the edge dock. */}
        {phase === 'playing' && isGuided && (
          <PracticeToolsLayer
            metronome={metronome}
            tools={
              isPhone
                ? { left: [], right: ['metronome'] }
                : { left: ['metronome'], right: [] }
            }
          />
        )}
      </View>

      {/* Done — log it. Rhythmic Variation doesn't auto-log, so this is the
          SOLE way to save the session — so it's a real filled button, not a
          quiet link (which was too easy to miss down here). */}
      {phase === 'playing' && (
        <View style={[styles.runDoneRow, { paddingBottom: insets.bottom + 8 }]}>
          <Pressable
            onPress={doneSession}
            hitSlop={8}
            style={[styles.runDoneBtn, { backgroundColor: ACCENT }]}>
            <ThemedText style={styles.runDoneBtnText}>✓ Done — log it</ThemedText>
          </Pressable>
        </View>
      )}

      {/* Tools pill — floats top-right (non-guided). Guided keeps the inline
          collapsed metronome tab (in the content area above). */}
      {!isGuided && phase === 'playing' && (
        <PracticeToolsBar
          metronome={metronome}
          pencil={{ ...ann.pencil, onUndo: ann.undo }}
          recorderPassageId={passage?.id}
        />
      )}

      {(phase === 'config' || pickerOpen) && (
        <Pressable
          style={styles.overlay}
          onPress={() => {
            // Tapping the dim backdrop closes a re-opened picker. Don't
            // dismiss when the user is in the initial config phase — they
            // need to pick before they can practice.
            if (phase === 'playing') setPickerOpen(false);
          }}>
          <Pressable
            style={[
              styles.pickerCard,
              // Phone: cap the card to the viewport so the grid below can
              // scroll instead of the bottom choices falling off-screen with
              // no way to reach them (B-002).
              isPhone && styles.pickerCardPhone,
              { backgroundColor: C.background, borderColor: C.icon },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              {pickerOpen && phase === 'playing' ? 'Change note grouping' : 'Choose a note grouping'}
            </ThemedText>
            <ThemedText style={styles.pickerHelp}>
              Each grouping shows rhythms of that note count from the pattern library.
            </ThemedText>
            <ScrollView
              style={styles.groupingScroll}
              contentContainerStyle={styles.groupingGrid}
              showsVerticalScrollIndicator={isPhone}>
              {GROUPING_CHOICES.map(({ n, abc, w }) => (
                <Pressable
                  key={n}
                  onPress={() => startWithGrouping(n)}
                  style={[
                    styles.groupingChip,
                    {
                      borderColor: grouping === n ? ACCENT : Palette.border,
                      borderWidth: grouping === n ? 2 : 1,
                      backgroundColor: grouping === n ? ACCENT + '14' : Palette.card,
                    },
                  ]}>
                  {/* Smaller illustration on phone so all six chips pack into
                      the bounded card with little or no scrolling. */}
                  <AbcStaffView
                    abc={abc}
                    width={w}
                    height={isPhone ? 44 : 60}
                    hideStaffLines
                    centered
                  />
                  <ThemedText style={styles.groupingNum}>{n}</ThemedText>
                  <ThemedText style={[styles.groupingCount, { color: C.icon }]}>
                    {counts[n]} patterns
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            {pickerOpen && phase === 'playing' && (
              <Pressable
                onPress={() => setPickerOpen(false)}
                style={styles.cancelChange}>
                <ThemedText style={[styles.cancelChangeText, { color: C.tint }]}>
                  Cancel
                </ThemedText>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      )}

      {/* Keyboard / foot-pedal advance: Space, Enter, Page Down, ArrowDown
          (or any pedal key) call onNext, the same action as the card's
          Next → button. Silent during the config / grouping-picker overlay
          and the practice-log prompt so it can't fire behind a modal.
          PedalCatcher already ignores keystrokes aimed at text inputs. */}
      <PedalCatcher
        active={phase === 'playing' && !notePromptVisible && !pickerOpen}
        onAdvance={onNext}
      />

      <PracticeLogNotePrompt
        visible={notePromptVisible && !isGuided}
        emoji="🎉"
        title="Rhythmic Variation — session complete"
        subtitle={passage?.title ?? undefined}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note, remindNext }) => finishLog(mood, note, remindNext)}
        onSkip={() => finishLog(null, null)}
      />

      {/* Guided onboarding: DONE fires a single celebratory overlay (no
          mood/note form) that logs the session and lands the first-timer in
          their library. */}
      {isGuided && notePromptVisible && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 700,
          }}>
          <ThemedView
            style={{
              borderRadius: Radii.xl,
              padding: 24,
              width: '100%',
              maxWidth: 360,
              alignItems: 'center',
              gap: 10,
            }}>
            <ThemedText style={{ fontSize: 40 }}>🎉</ThemedText>
            <ThemedText
              style={{ fontSize: 20, fontWeight: Type.weight.bold, textAlign: 'center' }}>
              Nice — you tried Rhythm Variations!
            </ThemedText>
            <ThemedText style={{ textAlign: 'center', opacity: 0.8 }}>
              That’s one of the fastest ways to clean up a passage. Your first
              session is saved to your practice log.
            </ThemedText>
            <View style={{ width: '100%', marginTop: 8 }}>
              <Button
                label="See my library →"
                fullWidth
                onPress={() => {
                  void finishGuidedToLibrary();
                }}
              />
            </View>
          </ThemedView>
        </View>
      )}

      {toolsOnly ? (
        // Tools mode: one tools-specific tutorial, auto-firing once on the
        // setup (grouping-picker) phase; the "?" reopens it anytime.
        <TutorialStep
          id="tools-rhythmic"
          visible={phase === 'config'}
          title={TOOLS_RHYTHMIC_HELP.title}
          body={TOOLS_RHYTHMIC_HELP.body}
        />
      ) : phase === 'config' ? (
        // Rhythmic Variation has no guided web tour, so (unlike Click-Up /
        // Tempo Ladder) this setup card is the first-run tutorial on BOTH
        // web and native. Auto-fire it once on the grouping-pick phase.
        <TutorialStep
          id="rhythmic-config"
          visible
          title="Rhythmic Variation — pick a grouping"
          body={
            "How many notes are in each rhythmic unit of your passage? Count the notes in one beat or one measure — whatever feels like a natural repeating chunk — then pick that number.\n\n" +
            "The app pulls every rhythm pattern matching that grouping from its library. You'll cycle through them on the next screen."
          }
        />
      ) : (
        // The real-passage flow picks a grouping in the passage sheet and lands
        // straight here in the playing phase, so this is the first screen the
        // user sees — and Rhythmic Variation has no web tour. Auto-fire it once
        // (but NOT in the guided flow, where the intro screen already taught it;
        // still registered so the ? button works).
        <TutorialStep
          id="rhythmic-play"
          visible={!isGuided}
          title="Rhythmic Variation"
          body={
            "Play the passage with a different rhythm pattern each time — dotted, swung, reversed, anything that breaks your default groove. Strengthens internal pulse and exposes weak spots that playing as written can hide.\n\n" +
            "The rhythm bar across the top shows the current pattern: tap ▶ Loop to hear it (■ Stop to silence it), and ← / → to move through the patterns. The music fills the rest of the screen — pinch to zoom in on the notes.\n\n" +
            "Use the N-note ▾ chip in the top bar to switch to a different note grouping, and DONE to finish and log the session. Best when you already know the notes and want to even out your technique." +
            `\n\n${PRACTICE_TOOLS_HELP}`
          }
        />
      )}
      {/* Phone: practice runs in landscape. Portrait → "rotate" prompt.
          Tools-only mode has no score, so portrait is fine. */}
      <RotateForPractice disabled={toolsOnly} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.sm, textAlign: 'center' },
  contentArea: { flex: 1 },

  // ── Reskinned run top bar (mirrors Tempo Ladder / Click-Up) ──────
  runTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  runSide: { flex: 1, justifyContent: 'center' },
  runExit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
  },
  runExitText: {
    color: Palette.danger,
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.md,
  },
  runCenter: { alignItems: 'center' },
  runStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    backgroundColor: Palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    ...Lift,
  },
  runStatLabel: {
    fontSize: 10,
    fontWeight: Type.weight.bold,
    letterSpacing: 0.5,
    color: Palette.textMuted,
    textTransform: 'uppercase',
  },
  runStatCount: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    fontVariant: ['tabular-nums'],
  },
  runStatDivider: { width: 1, height: 14, backgroundColor: Palette.border },
  groupingChipRun: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
  },
  groupingChipRunText: { fontSize: Type.size.sm, fontWeight: Type.weight.heavy },
  runDoneRow: { alignItems: 'center', paddingTop: Spacing.xs },
  runDoneBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radii.pill,
  },
  runDoneBtnText: { fontSize: Type.size.md, fontWeight: Type.weight.heavy, color: '#fff' },
  // Tools-mode hero: the staff + its controls, centered in the empty body.
  toolsStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
    padding: Spacing.lg,
  },
  toolsControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  toolsLoopBtn: {
    borderRadius: Radii.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolsLoopText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  toolsNavBtn: {
    minWidth: 64,
    borderWidth: Borders.thick,
    borderRadius: Radii.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Color applied inline from the rhythmic strategy color; amber default here
  // so there's no purple fallback.
  toolsNextBtn: { backgroundColor: Palette.rhythmic, borderColor: Palette.rhythmic },
  toolsNavText: { fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000066',
    padding: 20,
    // Sit above the rhythm bar and the floating practice tools so the
    // picker modal cleanly covers them.
    zIndex: 500,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 540,
    borderRadius: Radii['2xl'],
    borderWidth: Borders.thin,
    padding: 18,
    gap: Spacing.md,
  },
  // Phone caps the card to the viewport; the grouping grid scrolls inside.
  pickerCardPhone: { maxHeight: '85%' },
  // flexShrink lets the grid give up height to the title/help above when the
  // card is height-capped, so the ScrollView actually has something to scroll.
  groupingScroll: { alignSelf: 'stretch', flexShrink: 1 },
  pickerHelp: { opacity: 0.65, fontSize: 12, textAlign: 'center' },
  groupingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  groupingChip: {
    width: '47%',
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    paddingVertical: 6,
    alignItems: 'center',
  },
  groupingNum: { fontSize: Type.size.xl, fontWeight: Type.weight.heavy, marginTop: -4 },
  groupingCount: { fontSize: 10, marginTop: 2 },
  cancelChange: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  cancelChangeText: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
  },
});
