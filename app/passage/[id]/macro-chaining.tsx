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
import { RotateForPractice } from '@/components/RotateForPractice';
import { ScorePeekModal } from '@/components/ScorePeekModal';
import { TempoNudgeChip } from '@/components/TempoNudgeChip';
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
import { Colors } from '@/constants/theme';
import { Lift, Palette } from '@/constants/palette';
import { Borders, Opacity, PhoneTap, PhoneTapH, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePracticeClock } from '@/hooks/usePracticeClock';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { MIN_MACRO_MARKS, useMacroChainSession } from '@/hooks/useMacroChainSession';
import { useScreenTour } from '@/components/tour/TourContext';
import { tourTag, type TourStep } from '@/components/tour/types';
import { getSetting, setSetting } from '@/lib/db/repos/settings';
import { MacroScoreView } from '@/components/MacroScoreView';
import {
  formatMacroInstruction,
  generateMacroSteps,
} from '@/lib/strategies/macroChain';
import {
  actionButtonStyle,
  configColumnStyle,
  HELP_CLEARANCE,
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';

// Persisted run-screen view choice: 'overlay' (rests float on the whole
// score — default) or 'sliced' (the photo is cut apart at the beat marks).
// (The per-step auto-opening QUICK TIP card retired with the 2026-09-13
// visual redesign — the score now shows what the tips described in words.
// Its persisted seen-keys setting 'macro_info_seen' is simply unused.)
const MACRO_VIEW_KEY = 'macro_view_mode';
type MacroView = 'overlay' | 'sliced';

const MC_MARKING_STEPS: TourStep[] = [
  {
    target: 'mac-score',
    title: 'Mark each beat',
    body:
      'Macro-Chaining works the passage in chunks at your goal tempo. At each chunk size you first drill each chunk on its own, then chain them together with full beats of rest between — and you remove those rests, then grow the chunks, until it\'s continuous.\n\n' +
      'First, tap right on the start of each beat, and add one mark at the very end — the number lands where you tap. Pinch to zoom in for accuracy. Tap a mark again to remove it.',
  },
  {
    target: 'mac-next',
    title: 'Set your goal tempo',
    hideDot: true,
    body:
      `When you've marked your beats, tap NEXT → to set your goal tempo and start.`,
  },
];

export default function MacroChainingScreen() {
  usePracticeClock();
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors } = useStrategyColors();
  // Macro-Chaining's strategy color (plum by default; respects a user
  // override). Themes the run-screen Next button, info button, and Done link.
  const ACCENT = colors.macro_chaining;
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isPhone = Math.min(winWidth, winHeight) < 600;
  const insets = useSafeAreaInsets();
  const isPhoneLandscape = isPhone && winWidth > winHeight;
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  // Momentary look at the source page while setting the tempo (config phase).
  const [peekOpen, setPeekOpen] = useState(false);
  // Run-screen view (2026-09-13 redesign): rests-on-score overlay by default,
  // sliced-apart as the saved alternative. Persisted per account.
  const [viewMode, setViewMode] = useState<MacroView>('overlay');
  useEffect(() => {
    getSetting(MACRO_VIEW_KEY).then((v) => {
      if (v === 'sliced' || v === 'overlay') setViewMode(v);
    });
  }, []);
  function pickView(v: MacroView) {
    setViewMode(v);
    setSetting(MACRO_VIEW_KEY, v).catch(() => {});
  }
  const session = useMacroChainSession(id);

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
    goalTempo,
    storedConfig,
    currentIndex,
    celebrating,
    loadError,
    metronome,
    setGoalTempo,
    tempoNudge,
    acceptTempoNudge,
    placeMark,
    removeMark,
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
  } = session;

  const ann = useScoreAnnotation(passage);

  // Tutorial temporarily disabled (it was misbehaving on web). The marking
  // spotlight tour is off for now — re-enable by restoring:
  //   phase === 'marking' ? MC_MARKING_STEPS : null
  useScreenTour('macro-chaining-marking', null);

  // Beats are spaced well apart, so tap-to-place AND tap-to-remove both work
  // here (like Click-Up's beat marking, unlike Micro's close notes).
  function onMarkTap(point: { x: number; y: number }, scale: number) {
    const hit = nearestMarkerNormalized(marks, point, 0.04 / scale);
    if (hit != null) removeMark(hit);
    else placeMark(point);
  }

  // ── MARKING ────────────────────────────────────────────────────────────
  if (phase === 'marking') {
    if (!passage) return <ThemedView style={{ flex: 1 }} />;
    const canContinue = marks.length >= MIN_MACRO_MARKS;
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={exitSession}
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Mark beats — {marks.length} placed
            </ThemedText>
          }
          right={
            <>
              <Pressable
                onPress={undoMark}
                hitSlop={6}
                disabled={marks.length === 0}
                style={[
                  styles.topBtn,
                  isPhone && styles.tapPhoneH,
                  { opacity: marks.length === 0 ? 0.35 : 1 },
                ]}>
                <ThemedText style={[styles.topBtnText, { color: C.tint }]}>UNDO</ThemedText>
              </Pressable>
              <Pressable
                onPress={clearMarks}
                hitSlop={6}
                disabled={marks.length === 0}
                style={[
                  styles.topBtn,
                  isPhone && styles.tapPhoneH,
                  { opacity: marks.length === 0 ? 0.35 : 1 },
                ]}>
                <ThemedText style={[styles.topBtnText, { color: Palette.danger }]}>CLEAR</ThemedText>
              </Pressable>
              <Pressable
                onPress={canContinue ? commitMarksAndConfigure : undefined}
                hitSlop={6}
                disabled={!canContinue}
                {...tourTag('mac-next')}
                style={[
                  styles.topBtn,
                  isPhone && styles.tapPhoneH,
                  { backgroundColor: canContinue ? Palette.success : C.icon + '55' },
                ]}>
                <ThemedText style={[styles.topBtnText, { color: '#fff' }]}>NEXT →</ThemedText>
              </Pressable>
            </>
          }
        />
        <ScrollView contentContainerStyle={styles.markingContent}>
          <ThemedText style={styles.helper}>
            Tap the start of each beat, and add one mark at the very end —
            the number lands where you tap. Pinch to zoom in for accuracy. Tap a mark to remove it.
          </ThemedText>
          <View
            {...tourTag('mac-score')}
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
                placeLiftPx={SCORE_MARK_LIFT}
              />
            </ZoomableImage>
          </View>
        </ScrollView>

        {/* The web spotlight tour is disabled for Macro-Chaining (it was
            misbehaving), so this modal is the first-run tutorial on BOTH web
            and native — auto-fire it once on the marking phase. */}
        <TutorialStep
          id="macro-chaining-marking"
          visible
          title="Macro-Chaining — mark each beat"
          body={
            'Macro-Chaining works the passage in chunks at your goal tempo. At each chunk size you first drill each chunk on its own, then chain them together with full beats of rest between, removing the rests one at a time. Then the chunks grow and you repeat — until the whole passage is continuous. High-quality reps at speed without fatigue.\n\n' +
            'First, mark the beats: tap right on the start of each beat, and drop one mark at the very end — the number lands where you tap. Pinch to zoom in for accuracy.\n\n' +
            'Fixing marks: tap a mark to remove it, UNDO for the last one, or CLEAR to start over. When you\'re done, tap NEXT → to set your goal tempo.'
          }
        />
      </ThemedView>
    );
  }

  // ── CONFIG ─────────────────────────────────────────────────────────────
  if (phase === 'config') {
    const beatCount = Math.max(0, marks.length - 1);
    const stepCount = generateMacroSteps(beatCount).length;
    const canStart = marks.length >= MIN_MACRO_MARKS;
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
          {!isPhone && <ThemedText type="title">Set your goal tempo</ThemedText>}
          <ThemedText style={{ opacity: 0.7 }}>
            {beatCount} beats marked → {stepCount} steps (drill each chunk, then chain with
            rests; chunks double up to the whole passage).
          </ThemedText>

          <View style={[styles.peekLabelRow, { marginTop: Spacing.sm }]}>
            <ThemedText style={styles.label}>Goal Tempo</ThemedText>
            {passage != null && (
              <Button
                label="View score"
                icon="eye"
                variant="outline"
                size="xs"
                onPress={() => setPeekOpen(true)}
              />
            )}
          </View>
          <ThemedText style={styles.subLabel}>
            Macro-Chaining is practiced at your goal tempo throughout — the inserted rests
            are what make that sustainable. This sets the metronome; you stay in control of
            it during practice.
          </ThemedText>
          {tempoNudge != null && (
            <TempoNudgeChip bpm={tempoNudge} onAccept={acceptTempoNudge} accent={ACCENT} />
          )}
          <BpmStepper value={goalTempo} onChange={setGoalTempo} metronome={metronome} accent={ACCENT} />
        </ScrollView>

        <View style={{ padding: 20, gap: 10 }}>
          {loadError && (
            <ThemedText style={{ color: Status.danger, textAlign: 'center' }}>
              {loadError}
            </ThemedText>
          )}
          {resuming && (
            <Button
              label={`Resume — Level ${currentIndex + 1} of ${storedConfig!.steps.length}`}
              onPress={resumePlaying}
              style={actionButtonStyle}
            />
          )}
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Button
              label={resuming ? 'Start over from Level 1' : 'Start practicing'}
              variant={resuming ? 'outline' : 'primary'}
              onPress={startPlaying}
              disabled={!canStart}
              style={[
                actionButtonStyle,
                { opacity: canStart ? 1 : 0.4 },
                !resuming && { backgroundColor: ACCENT },
              ]}
            />
          </View>
          <Button
            label="← Back to marking"
            variant="ghost"
            onPress={goBackToMarking}
            style={actionButtonStyle}
          />
        </View>

        <ScorePeekModal
          visible={peekOpen}
          passage={passage}
          onClose={() => setPeekOpen(false)}
        />
      </ThemedView>
    );
  }

  // ── PLAYING ────────────────────────────────────────────────────────────
  if (!storedConfig || !passage) return <ThemedView style={{ flex: 1 }} />;
  const step = storedConfig.steps[currentIndex];
  const instruction = formatMacroInstruction(step);

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* ── Reskinned run top bar — coral Exit (left) · centered step
          instruction + info ⓘ (centre) · spacer reserving room for the
          floating tools pill (right). Mirrors Tempo Ladder / Click-Up. */}
      <View
        style={[
          styles.runTopBar,
          {
            paddingTop: insets.top + 10,
            // Pad by the safe-area insets so the fixed right reserve lines up
            // with the floating tools pill (anchored at insets.right + 12) —
            // otherwise the centred instruction runs under the pill on a
            // notched landscape phone.
            paddingLeft: insets.left + Spacing.md,
            paddingRight: insets.right + Spacing.md,
          },
        ]}>
        <Pressable onPress={exitSession} hitSlop={8} style={[styles.runExit, isPhone && styles.tapPhoneH]}>
          <Feather name="log-out" size={15} color={Palette.danger} />
          <ThemedText style={styles.runExitText}>Exit</ThemedText>
        </Pressable>
        <View style={styles.runInstructionWrap}>
          {/* No manual ⓘ here — it duplicated the global help "i" (bottom-
              right). paddingRight reserves room for the floating 4-icon tools
              pill so the instruction wraps BEFORE it instead of underneath. */}
          <ThemedText style={styles.runInstruction} numberOfLines={2}>
            {instruction}
          </ThemedText>
        </View>
      </View>

      <PedalCatcher
        active={!notePromptVisible && !celebrating}
        onAdvance={onNext}
        onBack={onPrev}
      />

      {/* View switch + step position. Small on purpose — the score area below
          is the real instruction now. */}
      <View style={styles.viewRow}>
        <View style={styles.viewSegGroup}>
          <Pressable
            onPress={() => pickView('overlay')}
            accessibilityRole="button"
            accessibilityState={{ selected: viewMode === 'overlay' }}
            style={[
              styles.viewSeg,
              styles.viewSegLeft,
              viewMode === 'overlay' && { backgroundColor: ACCENT, borderColor: ACCENT },
            ]}>
            <ThemedText
              style={[styles.viewSegText, viewMode === 'overlay' && styles.viewSegTextOn]}>
              Rests on the score
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => pickView('sliced')}
            accessibilityRole="button"
            accessibilityState={{ selected: viewMode === 'sliced' }}
            style={[
              styles.viewSeg,
              styles.viewSegRight,
              viewMode === 'sliced' && { backgroundColor: ACCENT, borderColor: ACCENT },
            ]}>
            <ThemedText
              style={[styles.viewSegText, viewMode === 'sliced' && styles.viewSegTextOn]}>
              Sliced apart
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText style={styles.stepCount}>
          Step {currentIndex + 1} of {storedConfig.steps.length}
        </ThemedText>
      </View>

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
          <MacroScoreView
            uri={passage.source_uri}
            aspect={imageAspect}
            marks={storedConfig.marks}
            step={step}
            view={viewMode}
            accent={ACCENT}
            isPhone={isPhone}
            zoomPersistKey={passage.id}
          />
          {viewMode === 'overlay' && ann.canvas}
        </View>
      </View>

      {/* ── BACK / NEXT (+ quiet Setup / Done links) — big ← Back / Next →
          (corner-split in phone landscape), with Setup and Done — log it
          demoted to quiet links. Mirrors Click-Up. */}
      {isPhoneLandscape ? (
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
            <Pressable onPress={goBackToConfig} hitSlop={6} style={isPhone && styles.tapPhoneH}>
              <ThemedText style={[styles.runLink, { color: ACCENT }]}>← Setup</ThemedText>
            </Pressable>
            <ThemedText style={styles.runLinkDot}>·</ThemedText>
            <Pressable
              onPress={() => setNotePromptVisible(true)}
              hitSlop={6}
              style={isPhone && styles.tapPhoneH}>
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
            <Pressable onPress={goBackToConfig} hitSlop={6} style={isPhone && styles.tapPhoneH}>
              <ThemedText style={[styles.runLink, { color: ACCENT }]}>← Setup</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setNotePromptVisible(true)}
              hitSlop={6}
              style={isPhone && styles.tapPhoneH}>
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

      {/* Tools pill — floats top-right, panels drop below it. */}
      <PracticeToolsBar
        metronome={metronome}
        metronomeNote="Macro-Chaining stays at your goal tempo — set the metronome, play the chunk, rest the beats, then tap Next."
        pencil={{ ...ann.pencil, onUndo: ann.undo }}
        recorderPassageId={passage?.id}
      />

      <PracticeLogNotePrompt
        metronome={metronome}
        sessionOutcome={{}}
        strategy="macro_chaining"
        visible={celebrating || notePromptVisible}
        emoji={celebrating ? '🎉' : undefined}
        title={
          celebrating
            ? `Macro-Chaining complete — all ${storedConfig.steps.length} levels!`
            : 'How did that go?'
        }
        subtitle={passage?.title ?? 'Macro-Chaining'}
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

      <TutorialStep
        id="macro-chaining-play"
        visible={false}
        title="Running a Macro-Chain"
        body={
          'Work through the passage in chunks that grow over time. At each chunk size there are two phases:\n\n' +
          'ISOLATE — the top bar names one chunk and the green arrows on the score bracket it. Play just that chunk (into the first note of the next beat) and repeat until it\'s comfortable, then tap NEXT → for the next chunk.\n\n' +
          'CHAIN — once you\'ve drilled each chunk, you play them in a row with rest beats between. NEXT → removes a rest beat (2 → 1 → 0). When you reach the whole passage with no rests, you\'re playing it continuously at goal tempo.\n\n' +
          'The chunk size doubles each round (1 → 2 → 4 → …). ← BACK steps back. Run your own metronome from the tools. The session logs at the last step; tap Done — log it (below the Next button) to log early, or Exit (top-left) to leave without logging.' +
          `\n\n${PRACTICE_TOOLS_HELP}`
        }
      />
      {/* Phone: practice runs in landscape. Portrait → "rotate" prompt. */}
      <RotateForPractice />
    </ThemedView>
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
  runExit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  runExitText: {
    color: Palette.danger,
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.md,
  },
  runInstructionWrap: {
    flex: 1,
    // minWidth:0 lets this flex child shrink below its content size on RN-Web
    // (min-width defaults to auto) so the long instruction wraps INSIDE the
    // bar instead of overflowing.
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: Spacing.md,
    // Reserve room for the floating tools pill (4 icons ≈ 146 wide, anchored at
    // insets.right + 12) so the centered instruction wraps before it. The
    // runTopBar's safe-area padding handles insets.right; this clears the pill.
    paddingRight: 150,
    gap: 8,
  },
  runInstruction: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
    fontWeight: Type.weight.semibold,
    fontSize: Type.size.sm,
    lineHeight: 18,
    color: Palette.text,
  },

  // ── Run-screen view switch (rests-on-score / sliced) + step count ──
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 4,
  },
  viewSegGroup: { flexDirection: 'row' },
  viewSeg: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: Palette.borderStrong,
    backgroundColor: Palette.card,
  },
  viewSegLeft: { borderTopLeftRadius: 999, borderBottomLeftRadius: 999 },
  viewSegRight: {
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
    borderLeftWidth: 0,
  },
  viewSegText: {
    fontSize: 11,
    fontWeight: Type.weight.heavy,
    color: Palette.textSecondary,
  },
  viewSegTextOn: { color: '#fff' },
  stepCount: {
    fontSize: 11,
    fontWeight: Type.weight.bold,
    color: Palette.textMuted,
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

  // ── Phone tap targets (B-093) ──────────────────────────────────────────
  // hitSlop is a NO-OP in react-native-web, so on phone the box itself has to
  // carry the 44px house minimum (DESIGN_RULES §12). Phone only — the iPad
  // layouts are deliberately tight.
  tapPhone: PhoneTap,
  tapPhoneH: { ...PhoneTapH, minWidth: 44, alignItems: 'center' },
  topBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.md },
  topBtnText: { fontWeight: Type.weight.heavy, fontSize: Type.size.sm },
  topCenter: { textAlign: 'center', fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  topInstruction: {
    flexShrink: 1,
    textAlign: 'center',
    fontWeight: Type.weight.semibold,
    fontSize: Type.size.sm,
    lineHeight: 18,
  },
  markingContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['2xl'] },
  helper: {
    textAlign: 'center',
    fontSize: 12,
    opacity: Opacity.muted,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  label: { opacity: 0.7, fontWeight: Type.weight.bold },
  peekLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  subLabel: { opacity: Opacity.muted, fontSize: Type.size.sm, lineHeight: 18 },
  doneBtn: { backgroundColor: Status.danger },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  infoBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 16,
    fontStyle: 'italic',
    fontWeight: Type.weight.bold,
  },
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
});
