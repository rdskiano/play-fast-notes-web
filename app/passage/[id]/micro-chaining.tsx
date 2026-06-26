import Feather from '@expo/vector-icons/Feather';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image as RNImage,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BpmStepper } from '@/components/BpmStepper';
import { Button } from '@/components/Button';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeToolsBar } from '@/components/PracticeToolsBar';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { RotateForPractice } from '@/components/RotateForPractice';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import {
  SCORE_MARK_LIFT,
  ScoreWithMarkers,
  markerTapRadius,
  nearestMarkerNormalized,
} from '@/components/ScoreWithMarkers';
import { ZoomableImage } from '@/components/ZoomableImage';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { Colors, Fonts } from '@/constants/theme';
import { Lift, Palette } from '@/constants/palette';
import { Borders, Opacity, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { MIN_MICRO_MARKS, useMicroChainSession } from '@/hooks/useMicroChainSession';
import { useScreenTour } from '@/components/tour/TourContext';
import { tourTag, type TourStep } from '@/components/tour/types';
import {
  activeSpanMarks,
  formatActiveNotes,
  type MicroMode,
} from '@/lib/strategies/microChain';
import {
  actionButtonStyle,
  configColumnStyle,
  HELP_CLEARANCE,
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';

const MODE_CARDS: { key: MicroMode; title: string; subtitle: string }[] = [
  {
    key: 'forward',
    title: 'Forward',
    subtitle: 'Start on note 1, add one note to the end each step.',
  },
  {
    key: 'backward',
    title: 'Backward',
    subtitle: 'Start on the last note, add one note to the front each step.',
  },
  {
    key: 'problem',
    title: 'Problem chaining',
    subtitle: 'Start on a muddy transition, expand outward both ways.',
  },
];

// Web-only guided tour of the marking screen (no-op on native, where the
// TutorialStep modal covers it instead).
const MC_MARKING_STEPS: TourStep[] = [
  {
    target: 'mc-score',
    title: 'Mark each note',
    body:
      'Micro-Chaining builds a short, muddy fragment back up one note at a time — always at your performance tempo — so each connection gets clean reps in context.\n\n' +
      'Tap right on each note to add a link to the chain — the number drops in above it. Pinch to zoom in so you can place each mark accurately. Use UNDO / CLEAR up top to fix a mistake.',
  },
  {
    target: 'mc-next',
    title: 'Choose how to build',
    hideDot: true,
    body:
      `When you've marked your notes, tap NEXT → to pick Forward, Backward, or Problem chaining and set your tempo.`,
  },
];

export default function MicroChainingScreen() {
  const { id, guided } = useLocalSearchParams<{ id: string; guided?: string }>();
  const isGuided = guided === '1';
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors } = useStrategyColors();
  // Micro-Chaining's strategy color (indigo by default; respects a user
  // override). Themes the run-screen Next button, title dot, and Done link.
  const ACCENT = colors.micro_chaining;
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isPhone = Math.min(winWidth, winHeight) < 600;
  const insets = useSafeAreaInsets();
  const isPhoneLandscape = isPhone && winWidth > winHeight;
  const isTouch = useIsTouchDevice();
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const session = useMicroChainSession(id, isGuided);

  useEffect(() => {
    if (session.passage?.source_uri) {
      RNImage.getSize(
        session.passage.source_uri,
        (w, h) => {
          if (h > 0) setImageAspect(w / h);
        },
        () => setImageAspect(1.4),
      );
    }
  }, [session.passage?.source_uri]);

  const {
    phase,
    passage,
    marks,
    mode,
    problemA,
    problemB,
    performanceTempo,
    storedConfig,
    currentIndex,
    celebrating,
    loadError,
    metronome,
    setMode,
    setPerformanceTempo,
    selectProblemNote,
    undoProblemNote,
    goToProblemSelect,
    placeMark,
    undoMark,
    clearMarks,
    commitMarksAndConfigure,
    startPlaying,
    onNext,
    onPrev,
    exitSession,
    doneSession,
    dismissCelebration,
    goBackToMarking,
    goBackToConfig,
    resumePlaying,
    confirmPerformanceTempo,
    goBackToTempo,
    finishGuidedToLibrary,
  } = session;

  const ann = useScoreAnnotation(passage);

  useScreenTour(
    'micro-chaining-marking',
    phase === 'marking' && !isGuided ? MC_MARKING_STEPS : null,
  );

  // Note marks sit close together, so every tap PLACES a mark — there's no
  // tap-to-remove here (it kept erasing the previous mark when two notes were
  // close). UNDO / CLEAR up top handle mistakes instead.
  function onMarkTap(point: { x: number; y: number }) {
    placeMark(point);
  }

  // ── PERFORMANCE TEMPO (guided onboarding only) ──────────────────────────
  // The quiz drops a brand-new user straight here. One question — how fast the
  // spot ultimately needs to be (micro-chaining is full-speed) — then marking.
  if (isGuided && phase === 'tempo') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: Spacing.lg }}>
          <Pressable onPress={exitSession} hitSlop={8}>
            <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
              ‹ Back
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.configContainer,
            configColumnStyle,
            { paddingTop: Spacing.md },
          ]}>
          <ThemedText type="title">How fast does it need to be?</ThemedText>
          <ThemedText style={{ opacity: 0.7 }}>
            Micro-chaining rebuilds your tricky spot one note at a time, always at
            full speed. Set that target speed — press ▶ to hear it.
          </ThemedText>
          <BpmStepper
            value={performanceTempo}
            onChange={setPerformanceTempo}
            metronome={metronome}
            accent={ACCENT}
          />
        </ScrollView>
        <View style={{ padding: 20, gap: 10 }}>
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Button
              label="Next: mark the notes →"
              onPress={confirmPerformanceTempo}
              style={actionButtonStyle}
            />
          </View>
        </View>
      </ThemedView>
    );
  }

  // ── MARKING ────────────────────────────────────────────────────────────
  if (phase === 'marking') {
    if (!passage) return <ThemedView style={{ flex: 1 }} />;
    const canContinue = marks.length >= MIN_MICRO_MARKS;

    // Guided onboarding: a clean, quiz-consistent marking screen — only the
    // user's score, light chrome, marks placed by tapping. Start practicing
    // jumps straight into play (Forward mode), skipping the config + problem
    // screens.
    if (isGuided) {
      return (
        <ThemedView style={{ flex: 1 }}>
          <Stack.Screen options={{ headerShown: false }} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: insets.top + 10,
              paddingHorizontal: Spacing.lg,
              paddingBottom: Spacing.sm,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: C.icon + '33',
            }}>
            <Pressable onPress={goBackToTempo} hitSlop={8}>
              <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
                ‹ Back
              </ThemedText>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: Spacing.lg }}>
              <Pressable onPress={undoMark} hitSlop={6} disabled={marks.length === 0}>
                <ThemedText
                  style={{
                    color: C.tint,
                    fontWeight: Type.weight.bold,
                    opacity: marks.length === 0 ? 0.35 : 1,
                  }}>
                  Undo
                </ThemedText>
              </Pressable>
              <Pressable onPress={clearMarks} hitSlop={6} disabled={marks.length === 0}>
                <ThemedText
                  style={{
                    color: Palette.danger,
                    fontWeight: Type.weight.bold,
                    opacity: marks.length === 0 ? 0.35 : 1,
                  }}>
                  Clear
                </ThemedText>
              </Pressable>
            </View>
          </View>
          <View style={{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm }}>
            <ThemedText style={{ fontSize: Type.size.lg, fontWeight: Type.weight.bold }}>
              Mark the notes to lock in
            </ThemedText>
            <ThemedText style={{ opacity: 0.7, fontSize: Type.size.sm, lineHeight: 18 }}>
              Tap right on each note in your tricky spot — the number drops in
              above it. Pinch to zoom for accuracy.
            </ThemedText>
          </View>
          <View
            style={{
              flex: 1,
              marginHorizontal: Spacing.lg,
              marginBottom: Spacing.sm,
              borderRadius: 8,
              overflow: 'hidden',
            }}>
            <ZoomableImage
              style={StyleSheet.absoluteFill}
              persistKey={`${passage.id}:mark`}
              tapAspectRatio={imageAspect ?? undefined}
              onTapPoint={onMarkTap}>
              <ScoreWithMarkers
                uri={passage.source_uri}
                markers={marks}
                mode="place"
                captureTaps={false}
                compact
                placeLiftPx={SCORE_MARK_LIFT}
              />
            </ZoomableImage>
          </View>
          <View style={{ padding: 20 }}>
            <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
              <Button
                label={
                  canContinue
                    ? 'Start practicing →'
                    : `Mark ${MIN_MICRO_MARKS - marks.length} more to start`
                }
                onPress={() => {
                  if (canContinue) void startPlaying();
                }}
                disabled={!canContinue}
                style={actionButtonStyle}
              />
            </View>
          </View>
        </ThemedView>
      );
    }
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={exitSession}
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Mark notes — {marks.length} placed
            </ThemedText>
          }
          right={
            <>
              <Pressable
                onPress={undoMark}
                hitSlop={6}
                disabled={marks.length === 0}
                style={[styles.topBtn, { opacity: marks.length === 0 ? 0.35 : 1 }]}>
                <ThemedText style={[styles.topBtnText, { color: C.tint }]}>UNDO</ThemedText>
              </Pressable>
              <Pressable
                onPress={clearMarks}
                hitSlop={6}
                disabled={marks.length === 0}
                style={[styles.topBtn, { opacity: marks.length === 0 ? 0.35 : 1 }]}>
                <ThemedText style={[styles.topBtnText, { color: Palette.danger }]}>CLEAR</ThemedText>
              </Pressable>
              <Pressable
                onPress={canContinue ? commitMarksAndConfigure : undefined}
                hitSlop={6}
                disabled={!canContinue}
                {...tourTag('mc-next')}
                style={[
                  styles.topBtn,
                  { backgroundColor: canContinue ? Palette.success : C.icon + '55' },
                ]}>
                <ThemedText style={[styles.topBtnText, { color: '#fff' }]}>NEXT →</ThemedText>
              </Pressable>
            </>
          }
        />
        <ScrollView contentContainerStyle={styles.markingContent}>
          <ThemedText style={styles.helper}>
            Tap right on each note to add a link to the chain — the number drops in
            above it. Pinch to zoom in for accuracy. Use UNDO to fix a mistake.
          </ThemedText>
          <View
            {...tourTag('mc-score')}
            style={{
              height: imageAspect ? (winWidth - 32) / imageAspect : 500,
              borderRadius: 8,
            }}>
            <ZoomableImage
              style={StyleSheet.absoluteFill}
              persistKey={`${passage.id}:mark`}
              tapAspectRatio={imageAspect ?? undefined}
              onTapPoint={onMarkTap}>
              <ScoreWithMarkers
                uri={passage.source_uri}
                markers={marks}
                mode="place"
                captureTaps={false}
                compact
                placeLiftPx={SCORE_MARK_LIFT}
              />
            </ZoomableImage>
          </View>
        </ScrollView>

        <TutorialStep
          id="micro-chaining-marking"
          visible={Platform.OS !== 'web'}
          title="Micro-Chaining — mark each note"
          body={
            'Micro-Chaining builds a short, muddy fragment back up one note at a time, always at your performance tempo. Each connection gets clean, in-context reps so the whole fragment locks in.\n\n' +
            'Mark each note: tap right on each note head to add a link to the chain — the number drops in above it. Pinch to zoom in so you can place each mark accurately.\n\n' +
            'Fixing marks: tap UNDO to remove the last one, or CLEAR to start over. When you\'re done, tap NEXT → to choose Forward, Backward, or Problem chaining.'
          }
        />
      </ThemedView>
    );
  }

  // ── CONFIG ─────────────────────────────────────────────────────────────
  if (phase === 'config') {
    const isProblem = mode === 'problem';
    const canPickProblem = marks.length >= 3;
    const canStart = marks.length >= MIN_MICRO_MARKS;
    const resuming = !!storedConfig && currentIndex > 0;
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView
          contentContainerStyle={[
            styles.configContainer,
            configColumnStyle,
            { paddingTop: insets.top + 10 },
          ]}>
          {!isPhone && <ThemedText type="title">How should it build?</ThemedText>}
          <ThemedText style={{ opacity: 0.7 }}>
            {marks.length} notes marked.
          </ThemedText>

          <View style={styles.modeGrid}>
            {MODE_CARDS.map((m) => (
              <ModeCard
                key={m.key}
                title={m.title}
                subtitle={m.subtitle}
                selected={mode === m.key}
                accent={ACCENT}
                onPress={() => setMode(m.key)}
              />
            ))}
          </View>

          {isProblem && (
            <ThemedText style={styles.subLabel}>
              {canPickProblem
                ? 'Next you’ll pick the two notes of the problem spot on the music, then it expands outward from there.'
                : 'Problem chaining needs at least 3 notes — go back to marking and add more.'}
            </ThemedText>
          )}

          <ThemedText style={[styles.label, { marginTop: Spacing.sm }]}>
            Performance Tempo
          </ThemedText>
          <ThemedText style={styles.subLabel}>
            Micro-Chaining stays at one tempo — your performance tempo. This sets the
            metronome; you can still adjust it during practice.
          </ThemedText>
          <BpmStepper
            value={performanceTempo}
            onChange={setPerformanceTempo}
            metronome={metronome}
            accent={ACCENT}
          />
        </ScrollView>

        <View style={{ padding: 20, gap: 10 }}>
          {loadError && (
            <ThemedText style={{ color: Status.danger, textAlign: 'center' }}>
              {loadError}
            </ThemedText>
          )}
          {resuming && (
            <Button
              label={`Resume — Step ${currentIndex + 1} of ${storedConfig!.steps.length}`}
              onPress={resumePlaying}
              style={actionButtonStyle}
            />
          )}
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            {isProblem ? (
              <Button
                label="Pick problem notes →"
                onPress={goToProblemSelect}
                disabled={!canPickProblem}
                style={[actionButtonStyle, { backgroundColor: ACCENT, opacity: canPickProblem ? 1 : 0.4 }]}
              />
            ) : (
              <Button
                label={resuming ? 'Start over from Step 1' : 'Start practicing'}
                variant={resuming ? 'outline' : 'primary'}
                onPress={startPlaying}
                disabled={!canStart}
                style={[
                  actionButtonStyle,
                  { opacity: canStart ? 1 : 0.4 },
                  !resuming && { backgroundColor: ACCENT },
                ]}
              />
            )}
          </View>
          <Button
            label="← Back to marking"
            variant="ghost"
            onPress={goBackToMarking}
            style={actionButtonStyle}
          />
        </View>
      </ThemedView>
    );
  }

  // ── PROBLEM SELECT ─────────────────────────────────────────────────────
  if (phase === 'problem') {
    if (!passage) return <ThemedView style={{ flex: 1 }} />;
    const bothPicked = problemA != null && problemB != null;
    const lo = bothPicked ? Math.min(problemA!, problemB!) : null;
    const hi = bothPicked ? Math.max(problemA!, problemB!) : null;
    const prompt = bothPicked
      ? `Problem spot: notes ${lo}–${hi}. Tap a note on the staff to change it (not its number), or Start practicing.`
      : problemA != null
        ? 'Now tap the second note of the problem spot on the staff (next to it, or further along) — tap the note, not its number.'
        : 'Tap the first note of the muddy spot on the staff — tap the note itself, not the number above it.';
    const highlights = [problemA, problemB].filter((n): n is number => n != null);
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={exitSession}
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Pick the problem spot
            </ThemedText>
          }
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable
                onPress={undoProblemNote}
                hitSlop={6}
                disabled={highlights.length === 0}
                style={[styles.topBtn, { opacity: highlights.length === 0 ? 0.35 : 1 }]}>
                <ThemedText style={[styles.topBtnText, { color: C.tint }]}>UNDO</ThemedText>
              </Pressable>
              <Pressable
                onPress={goBackToConfig}
                hitSlop={6}
                accessibilityLabel="Back to setup"
                style={styles.topBtn}>
                <ThemedText style={[styles.topBtnText, { color: C.tint }]}>← Setup</ThemedText>
              </Pressable>
            </View>
          }
        />
        <ScrollView contentContainerStyle={styles.markingContent}>
          <ThemedText style={styles.helper}>{prompt}</ThemedText>
          <View
            style={{
              height: imageAspect ? (winWidth - 32) / imageAspect : 500,
              borderRadius: 8,
            }}>
            <ZoomableImage
              style={StyleSheet.absoluteFill}
              persistKey={`${passage.id}:mark`}
              tapAspectRatio={imageAspect ?? undefined}
              onTapPoint={(point, scale) => {
                // Selection only (a miss does nothing), so the radius can be
                // finger-sized — unlike the placement phase, where dense note
                // marks need precision.
                const hit = nearestMarkerNormalized(
                  marks,
                  point,
                  markerTapRadius(winWidth - 32, scale, 0.05),
                );
                if (hit != null) selectProblemNote(hit);
              }}>
              <ScoreWithMarkers
                uri={passage.source_uri}
                markers={marks}
                mode="place"
                captureTaps={false}
                compact
                highlightIndices={highlights}
                placeLiftPx={SCORE_MARK_LIFT}
              />
            </ZoomableImage>
          </View>
        </ScrollView>
        <View style={{ padding: 20, gap: 10 }}>
          {loadError && (
            <ThemedText style={{ color: Status.danger, textAlign: 'center' }}>
              {loadError}
            </ThemedText>
          )}
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Button
              label="Start practicing"
              onPress={startPlaying}
              disabled={!bothPicked}
              style={[actionButtonStyle, { opacity: bothPicked ? 1 : 0.4 }]}
            />
          </View>
        </View>
      </ThemedView>
    );
  }

  // ── PLAYING ────────────────────────────────────────────────────────────
  if (!storedConfig || !passage) return <ThemedView style={{ flex: 1 }} />;
  const step = storedConfig.steps[currentIndex];
  const activeMarks = activeSpanMarks(marks, step);
  const noteLabel = formatActiveNotes(step);

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Guided onboarding: light, quiz-consistent banner instead of the full
          session chrome. The user plays the highlighted notes and taps NEXT. */}
      {isGuided && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: Spacing.md,
            paddingTop: insets.top + 10,
            paddingHorizontal: Spacing.lg,
            paddingBottom: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: C.icon + '33',
          }}>
          <ThemedText
            style={{ flex: 1, fontSize: Type.size.sm, fontWeight: Type.weight.semibold }}
            numberOfLines={2}>
            Play from the first arrow ▼ to the last, and repeat until it feels
            comfortable.
          </ThemedText>
          <Pressable onPress={() => setNotePromptVisible(true)} hitSlop={8}>
            <ThemedText
              style={{ color: C.tint, fontWeight: Type.weight.bold, fontSize: Type.size.md }}>
              Done
            </ThemedText>
          </Pressable>
        </View>
      )}
      {/* ── Reskinned run top bar (all devices) — coral Exit (left) ·
          centered "{noteLabel} · n/N" tracker. Tools pill floats top-right
          (rendered at root, below). Mirrors Tempo Ladder / Click-Up. */}
      {!isGuided && (
        <>
          <View style={[styles.runTopBar, { paddingTop: insets.top + 10 }]}>
            <View style={styles.runSide}>
              <Pressable onPress={exitSession} hitSlop={8} style={styles.runExit}>
                <Feather name="log-out" size={15} color={Palette.danger} />
                <ThemedText style={styles.runExitText}>Exit</ThemedText>
              </Pressable>
            </View>
            <View style={styles.runCenter}>
              {/* Strategy + passage title — desktop / iPad only. Dropped on
                  phone to save a row (practice runs in landscape there). */}
              {!isPhone && (
                <View style={styles.runTitleRow}>
                  <View style={[styles.runAccentDot, { backgroundColor: ACCENT }]} />
                  <ThemedText style={styles.runTitleText} numberOfLines={1}>
                    Micro-Chaining
                  </ThemedText>
                  {!!passage?.title && (
                    <ThemedText style={styles.runTitleMeta} numberOfLines={1}>
                      {'  ·  '}
                      {passage.title}
                    </ThemedText>
                  )}
                </View>
              )}
              <View style={styles.runStatPill}>
                {!!noteLabel && (
                  <>
                    <ThemedText style={styles.runStatLabelStrong} numberOfLines={1}>
                      {noteLabel}
                    </ThemedText>
                    <View style={styles.runStatDivider} />
                  </>
                )}
                <ThemedText style={styles.runStatCount}>
                  {currentIndex + 1}/{storedConfig.steps.length}
                </ThemedText>
              </View>
            </View>
            <View style={styles.runSide} />
          </View>

          {!isPhoneLandscape && (
            <ThemedText style={styles.playHelper}>
              Play from the first arrow ▼ to the last, then tap NEXT → to extend the chain.
            </ThemedText>
          )}
        </>
      )}

      <PedalCatcher
        active={!notePromptVisible && !celebrating}
        onAdvance={onNext}
        onBack={onPrev}
      />

      <View
        style={[
          styles.contentArea,
          !isPhone && {
            paddingHorizontal: SCORE_SIDE_BUFFER,
            paddingVertical: SCORE_VERT_BUFFER,
            backgroundColor: SCORE_FRAME_BG,
          },
        ]}>
        <View style={{ flex: 1, width: '100%', position: 'relative' }}>
          {isTouch ? (
            <ZoomableImage style={StyleSheet.absoluteFill} persistKey={passage.id}>
              <ScoreWithMarkers
                uri={passage.source_uri}
                markers={activeMarks}
                mode="play"
                compact
                phoneArrows={isPhone}
                playLiftPx={SCORE_MARK_LIFT}
              />
            </ZoomableImage>
          ) : (
            <ScoreWithMarkers
              uri={passage.source_uri}
              markers={activeMarks}
              mode="play"
              compact
              phoneArrows={isPhone}
            />
          )}
          {ann.canvas}
        </View>
        {/* Guided: a collapsed metronome tab (no note → starts closed) so a
            first-timer can pop it open for a steady pulse at the performance
            tempo. Non-guided uses the floating PracticeToolsBar (rendered at
            root, below) instead of the edge dock. */}
        {isGuided && (
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

      {/* ── BACK / NEXT (+ quiet Setup / Done links) ──────────────────
          Guided keeps the original centred nav row. Non-guided gets the
          reskinned bottom: big ← Back / Next → (corner-split in phone
          landscape), with Setup and Done — log it demoted to quiet links. */}
      {isGuided ? (
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
              <ThemedText style={styles.nextBtnText}>NEXT →</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : isPhoneLandscape ? (
        <>
          {/* +64 inward so the Next clears the global help "i" in the
              bottom-right; Back matches it so the pair stays symmetric. */}
          <Pressable
            onPress={currentIndex === 0 ? undefined : onPrev}
            disabled={currentIndex === 0}
            hitSlop={6}
            accessibilityLabel="Previous step"
            style={[
              styles.cornerBtn,
              styles.runBackBtn,
              {
                bottom: insets.bottom + 4,
                left: insets.left + 16 + 64,
                opacity: currentIndex === 0 ? 0.4 : 1,
              },
            ]}>
            <ThemedText style={styles.runBackBtnText}>← Back</ThemedText>
          </Pressable>
          <Pressable
            onPress={onNext}
            hitSlop={6}
            accessibilityLabel="Next step"
            style={[
              styles.cornerBtn,
              { backgroundColor: ACCENT },
              { bottom: insets.bottom + 4, right: insets.right + 16 + 64 },
            ]}>
            <ThemedText style={styles.runNextBtnText}>Next →</ThemedText>
          </Pressable>
          <View style={[styles.runLinksLandscape, { bottom: insets.bottom + 8 }]}>
            <Pressable onPress={goBackToConfig} hitSlop={6}>
              <ThemedText style={[styles.runLink, { color: ACCENT }]}>← Setup</ThemedText>
            </Pressable>
            <ThemedText style={styles.runLinkDot}>·</ThemedText>
            <Pressable onPress={() => setNotePromptVisible(true)} hitSlop={6}>
              <ThemedText style={[styles.runLink, { color: ACCENT }]}>Done — log it</ThemedText>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={[styles.runBottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.runBtnRow}>
            <Pressable
              onPress={currentIndex === 0 ? undefined : onPrev}
              disabled={currentIndex === 0}
              accessibilityLabel="Previous step"
              style={[
                styles.bottomBtn,
                styles.runBackBtn,
                { opacity: currentIndex === 0 ? 0.4 : 1 },
              ]}>
              <ThemedText style={styles.runBackBtnText}>← Back</ThemedText>
            </Pressable>
            <Pressable
              onPress={onNext}
              accessibilityLabel="Next step"
              style={[styles.bottomBtn, styles.runNextBtnWide, { backgroundColor: ACCENT }]}>
              <ThemedText style={styles.runNextBtnText}>Next →</ThemedText>
            </Pressable>
          </View>
          <View style={styles.runLinks}>
            <Pressable onPress={goBackToConfig} hitSlop={6}>
              <ThemedText style={[styles.runLink, { color: ACCENT }]}>← Setup</ThemedText>
            </Pressable>
            <Pressable onPress={() => setNotePromptVisible(true)} hitSlop={6}>
              <ThemedText style={[styles.runLink, { color: ACCENT }]}>Done — log it</ThemedText>
            </Pressable>
          </View>
          {!isPhone && (
            <ThemedText style={styles.runHintShortcut}>
              Space / Enter / right pedal = NEXT · ← / Backspace / left pedal = BACK
            </ThemedText>
          )}
        </View>
      )}

      {/* Tools pill — floats top-right (non-guided). Guided keeps the inline
          collapsed metronome tab (in the content area above). */}
      {!isGuided && (
        <PracticeToolsBar
          metronome={metronome}
          metronomeNote="Micro-Chaining stays at your performance tempo — play the highlighted notes, then tap Next."
          pencil={{ ...ann.pencil, onUndo: ann.undo }}
          recorderPassageId={passage?.id}
        />
      )}

      {/* Guided onboarding: a single celebratory overlay (no mood/note form)
          that logs the session and lands the first-timer in their library. */}
      {isGuided && (celebrating || notePromptVisible) && (
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
            zIndex: 100,
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
              You rebuilt the whole spot!
            </ThemedText>
            <ThemedText style={{ textAlign: 'center', opacity: 0.8 }}>
              Note by note, at full speed — your first session is saved to your
              practice log.
            </ThemedText>
            <View style={{ width: '100%', marginTop: 8 }}>
              <Button
                label="See my library →"
                onPress={() => {
                  void finishGuidedToLibrary();
                }}
                style={actionButtonStyle}
              />
            </View>
          </ThemedView>
        </View>
      )}

      <PracticeLogNotePrompt
        visible={!isGuided && (celebrating || notePromptVisible)}
        emoji={celebrating ? '🎉' : undefined}
        title={
          celebrating
            ? `Chain complete — all ${storedConfig.steps.length} steps!`
            : 'How did that go?'
        }
        subtitle={passage?.title ?? 'Micro-Chaining'}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note, remindNext }) => {
          setNotePromptVisible(false);
          dismissCelebration();
          doneSession({ mood, note, remindNext });
        }}
        onSkip={() => {
          setNotePromptVisible(false);
          dismissCelebration();
          doneSession();
        }}
      />

      {!isGuided && (
      <TutorialStep
        id="micro-chaining-play"
        visible={false}
        title="Running a Micro-Chain"
        body={
          'The score marks the span you play right now with two arrows ▼ — the first note and the current end note. Play from the first to the last at your performance tempo, then tap NEXT → to extend the chain by one note.\n\n' +
          'Forward grows from the first note; Backward grows from the last; Problem starts on the muddy transition and expands both ways. ← BACK shrinks the chain one link (handy if you advanced too soon).\n\n' +
          'Run your own metronome from the tools — Micro-Chaining keeps you at one tempo on purpose. The session logs when you reach the last step; tap Done — log it (below the Next button) to log it early, or Exit (top-left) to leave without logging.' +
          `\n\n${PRACTICE_TOOLS_HELP}`
        }
      />
      )}
      {/* Phone: practice runs in landscape. Portrait → "rotate" prompt. */}
      <RotateForPractice />
    </ThemedView>
  );
}

function ModeCard({
  title,
  subtitle,
  selected,
  accent,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  /** Strategy color — themes the selected border / tint / title / check. */
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeCard,
        {
          borderWidth: selected ? Borders.thick : Borders.thin,
          borderColor: selected ? accent : Palette.border,
          backgroundColor: selected
            ? accent + '14'
            : pressed
              ? Palette.surfaceSunk
              : Palette.card,
        },
      ]}>
      {selected && (
        <View style={styles.modeCardCheck}>
          <Feather name="check" size={16} color={accent} />
        </View>
      )}
      <ThemedText
        style={[styles.modeCardTitle, { color: selected ? accent : Palette.text }]}
        numberOfLines={2}>
        {title}
      </ThemedText>
      <ThemedText
        style={[styles.modeCardSubtitle, { color: Palette.textSecondary }]}
        numberOfLines={3}>
        {subtitle}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  configContainer: { flexGrow: 1, padding: 20, gap: 14, paddingBottom: HELP_CLEARANCE + 20 },

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
  runCenter: { alignItems: 'center', gap: 6 },
  runTitleRow: { flexDirection: 'row', alignItems: 'center' },
  runAccentDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  runTitleText: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.2,
  },
  runTitleMeta: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    color: Palette.textMuted,
  },
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
  runStatLabelStrong: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
  },
  runStatDivider: { width: 1, height: 14, backgroundColor: Palette.border },
  runStatCount: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // ── Reskinned bottom BACK / NEXT + quiet links ───────────────────
  runBottomBar: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: 8,
  },
  runBtnRow: { flexDirection: 'row', gap: 14, alignItems: 'center', justifyContent: 'center' },
  bottomBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    ...Lift,
  },
  runNextBtnWide: { minWidth: 200 },
  runBackBtn: {
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.borderStrong,
  },
  runBackBtnText: { color: Palette.text, fontWeight: Type.weight.heavy, fontSize: 17 },
  runNextBtnText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 17 },
  runLinks: { flexDirection: 'row', gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' },
  runLink: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  runLinkDot: { color: Palette.textMuted, fontSize: Type.size.sm },
  runLinksLandscape: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  runHintShortcut: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: Type.weight.semibold,
    color: Palette.textSecondary,
  },
  cornerBtn: {
    position: 'absolute',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    ...Lift,
    zIndex: 5,
  },

  topBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.md },
  topBtnText: { fontWeight: Type.weight.heavy, fontSize: Type.size.sm },
  topCenter: { textAlign: 'center', fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  topCenterHint: { fontWeight: '400', opacity: Opacity.muted },
  markingContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['2xl'] },
  helper: {
    textAlign: 'center',
    fontSize: 12,
    opacity: Opacity.muted,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  playHelper: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    opacity: Opacity.muted,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    lineHeight: 18,
  },
  label: { opacity: 0.7, fontWeight: Type.weight.bold },
  subLabel: { opacity: Opacity.muted, fontSize: Type.size.sm, lineHeight: 18 },
  doneBtn: { backgroundColor: Status.danger },
  bottomBar: {
    paddingHorizontal: HELP_CLEARANCE,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  pedalNote: { textAlign: 'center', fontSize: 12, opacity: Opacity.muted },
  nextBtn: {
    backgroundColor: Palette.success,
    paddingVertical: 16,
    borderRadius: Radii.md,
    alignItems: 'center',
  },
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
  contentArea: { flex: 1 },
  // ── Mode picker card grid (mirrors Tempo Ladder) ─────────────────
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  modeCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 140,
    minHeight: 84,
    borderWidth: 1.5,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  modeCardTitle: { fontSize: Type.size.sm, fontWeight: Type.weight.heavy, paddingRight: 18 },
  modeCardSubtitle: { fontSize: Type.size.xs, lineHeight: 16 },
  modeCardCheck: { position: 'absolute', top: 8, right: 8 },
});
