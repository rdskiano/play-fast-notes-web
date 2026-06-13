import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image as RNImage,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { BpmStepper } from '@/components/BpmStepper';
import { Button } from '@/components/Button';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import {
  ScoreWithMarkers,
  markerTapRadius,
  nearestMarkerNormalized,
} from '@/components/ScoreWithMarkers';
import { ZoomableImage } from '@/components/ZoomableImage';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { MIN_MACRO_MARKS, useMacroChainSession } from '@/hooks/useMacroChainSession';
import { useScreenTour } from '@/components/tour/TourContext';
import { tourTag, type TourStep } from '@/components/tour/types';
import { getSetting, setSetting } from '@/lib/db/repos/settings';
import {
  chunkBoundaryMarks,
  formatMacroInfo,
  formatMacroInfoTitle,
  formatMacroInstruction,
  generateMacroSteps,
  isolateChunkMarks,
  macroInfoKey,
} from '@/lib/strategies/macroChain';
import {
  actionButtonStyle,
  configColumnStyle,
  HELP_CLEARANCE,
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';

// Persisted set of step-kind keys whose ⓘ has auto-opened once already.
const MACRO_INFO_SEEN_KEY = 'macro_info_seen';

const MC_MARKING_STEPS: TourStep[] = [
  {
    target: 'mac-score',
    title: 'Mark each beat',
    body:
      'Macro-Chaining works the passage in chunks at your goal tempo. At each chunk size you first drill each chunk on its own, then chain them together with full beats of rest between — and you remove those rests, then grow the chunks, until it\'s continuous.\n\n' +
      'First, tap just above the start of each beat, and add one mark at the very end. Pinch to zoom in for accuracy. Tap a mark again to remove it.',
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isPhone = Math.min(winWidth, winHeight) < 600;
  const insets = useSafeAreaInsets();
  const isPhoneLandscape = isPhone && winWidth > winHeight;
  const isTouch = useIsTouchDevice();
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
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

  // Auto-open the ⓘ the first time (ever) the user reaches each KIND of step,
  // like the tutorials. Two layers of dedup:
  //  - persistedSeenRef: keys seen in a PAST session (loaded from settings) —
  //    so it never auto-fires again after the first real attempt.
  //  - openedThisSessionRef: keys auto-opened THIS session, mutated
  //    synchronously so rapid re-renders / async state can't double-fire it.
  const persistedSeenRef = useRef<Set<string>>(new Set());
  const openedThisSessionRef = useRef<Set<string>>(new Set());
  const [seenLoaded, setSeenLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getSetting(MACRO_INFO_SEEN_KEY).then((raw) => {
      if (cancelled) return;
      try {
        if (raw) for (const k of JSON.parse(raw) as string[]) persistedSeenRef.current.add(k);
      } catch {
        // ignore malformed
      }
      setSeenLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const liveStep =
    phase === 'playing' && storedConfig ? storedConfig.steps[currentIndex] : undefined;
  const liveInfoKey = liveStep ? macroInfoKey(liveStep) : null;
  useEffect(() => {
    if (!seenLoaded || !liveInfoKey || celebrating) return;
    if (
      openedThisSessionRef.current.has(liveInfoKey) ||
      persistedSeenRef.current.has(liveInfoKey)
    )
      return;
    // Auto-open the tip the first time (ever) the user reaches each new KIND
    // of step: the first rep, chaining at each rest count (rest dropped, …),
    // and when the chunk size doubles. macroInfoKey() defines those kinds.
    openedThisSessionRef.current.add(liveInfoKey); // synchronous — no double-fire
    persistedSeenRef.current.add(liveInfoKey);
    setSetting(MACRO_INFO_SEEN_KEY, JSON.stringify([...persistedSeenRef.current])).catch(() => {});
    setInfoOpen(true);
  }, [seenLoaded, liveInfoKey, celebrating]);

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
                style={[styles.topBtn, { opacity: marks.length === 0 ? 0.35 : 1 }]}>
                <ThemedText style={[styles.topBtnText, { color: C.tint }]}>UNDO</ThemedText>
              </Pressable>
              <Pressable
                onPress={clearMarks}
                hitSlop={6}
                disabled={marks.length === 0}
                style={[styles.topBtn, { opacity: marks.length === 0 ? 0.35 : 1 }]}>
                <ThemedText style={[styles.topBtnText, { color: '#c0392b' }]}>CLEAR</ThemedText>
              </Pressable>
              <Pressable
                onPress={canContinue ? commitMarksAndConfigure : undefined}
                hitSlop={6}
                disabled={!canContinue}
                {...tourTag('mac-next')}
                style={[
                  styles.topBtn,
                  { backgroundColor: canContinue ? '#2ecc71' : C.icon + '55' },
                ]}>
                <ThemedText style={[styles.topBtnText, { color: '#fff' }]}>NEXT →</ThemedText>
              </Pressable>
            </>
          }
        />
        <ScrollView contentContainerStyle={styles.markingContent}>
          <ThemedText style={styles.helper}>
            Tap just above the start of each beat, and add one mark at the very end.
            Pinch to zoom in for accuracy. Tap a mark to remove it.
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
            'First, mark the beats: tap just above the start of each beat, and drop one mark at the very end. Pinch to zoom in for accuracy.\n\n' +
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

          <ThemedText style={[styles.label, { marginTop: Spacing.sm }]}>
            Goal Tempo
          </ThemedText>
          <ThemedText style={styles.subLabel}>
            Macro-Chaining is practiced at your goal tempo throughout — the inserted rests
            are what make that sustainable. This sets the metronome; you stay in control of
            it during practice.
          </ThemedText>
          <BpmStepper value={goalTempo} onChange={setGoalTempo} metronome={metronome} />
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
              style={[actionButtonStyle, { opacity: canStart ? 1 : 0.4 }]}
            />
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

  // ── PLAYING ────────────────────────────────────────────────────────────
  if (!storedConfig || !passage) return <ThemedView style={{ flex: 1 }} />;
  const beatCount = storedConfig.marks.length - 1;
  const step = storedConfig.steps[currentIndex];
  const instruction = formatMacroInstruction(step);
  const info = formatMacroInfo(step, beatCount);
  const infoTitle = formatMacroInfoTitle(step);
  // Isolate steps bracket the one chunk being drilled; chain steps flag every
  // chunk boundary so the grouping/sequence shows.
  const scoreMarks = !step
    ? marks
    : step.kind === 'isolate'
      ? isolateChunkMarks(marks, step.chunkSize, step.chunkIndex)
      : chunkBoundaryMarks(marks, step.chunkSize);

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={exitSession}
        exitLabel="EXIT"
        center={
          <View style={styles.instructionRow}>
            <ThemedText style={styles.topInstruction} numberOfLines={2}>
              {instruction}
            </ThemedText>
            {info ? (
              <Pressable
                onPress={() => setInfoOpen(true)}
                hitSlop={10}
                accessibilityLabel="More about this step"
                style={[styles.infoBtn, { backgroundColor: C.tint }]}>
                <ThemedText style={styles.infoBtnText}>i</ThemedText>
              </Pressable>
            ) : null}
          </View>
        }
        right={
          isPhone ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable
                onPress={() => setNotePromptVisible(true)}
                hitSlop={6}
                style={[styles.topBtn, styles.doneBtn]}>
                <ThemedText style={[styles.topBtnText, { color: '#fff' }]}>DONE</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setPhoneMenuOpen(true)}
                hitSlop={6}
                accessibilityLabel="More actions"
                style={styles.topBtn}>
                <ThemedText style={[styles.topBtnText, { color: C.tint }]}>⋯</ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable
                onPress={goBackToConfig}
                hitSlop={6}
                accessibilityLabel="Back to setup"
                style={styles.topBtn}>
                <ThemedText style={[styles.topBtnText, { color: C.tint }]}>← Setup</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setNotePromptVisible(true)}
                hitSlop={6}
                style={[styles.topBtn, styles.doneBtn]}>
                <ThemedText style={[styles.topBtnText, { color: '#fff' }]}>DONE</ThemedText>
              </Pressable>
            </View>
          )
        }
      />

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
              <ScoreWithMarkers uri={passage.source_uri} markers={scoreMarks} mode="play" compact phoneArrows={isPhone} />
            </ZoomableImage>
          ) : (
            <ScoreWithMarkers uri={passage.source_uri} markers={scoreMarks} mode="play" compact phoneArrows={isPhone} />
          )}
          {ann.canvas}
        </View>
        <PracticeToolsLayer
          metronome={metronome}
          metronomeNote="Macro-Chaining stays at your goal tempo — set the metronome, play the chunk, rest the beats, then tap Next."
          pencil={ann.pencil}
          recorderPassageId={passage?.id}
        />
      </View>

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

      <PracticeLogNotePrompt
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

      <ActionSheet
        visible={phoneMenuOpen}
        items={[
          {
            label: '← Back to setup',
            onPress: () => {
              setPhoneMenuOpen(false);
              goBackToConfig();
            },
          },
        ]}
        onCancel={() => setPhoneMenuOpen(false)}
      />

      <Modal
        visible={infoOpen}
        transparent
        animationType="fade"
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        onRequestClose={() => setInfoOpen(false)}>
        <Pressable style={styles.infoBackdrop} onPress={() => setInfoOpen(false)}>
          <Pressable style={styles.infoCard} onPress={(e) => e.stopPropagation()}>
            <ThemedText style={styles.infoEyebrow}>QUICK TIP</ThemedText>
            <ThemedText style={styles.infoTitle}>{infoTitle}</ThemedText>
            <ThemedText style={styles.infoBody}>{info}</ThemedText>
            <Pressable
              onPress={() => setInfoOpen(false)}
              style={styles.gotItBtn}
              accessibilityLabel="Dismiss tip">
              <ThemedText style={styles.gotItText}>Got it</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <TutorialStep
        id="macro-chaining-play"
        visible={false}
        title="Running a Macro-Chain"
        body={
          'Work through the passage in chunks that grow over time. At each chunk size there are two phases:\n\n' +
          'ISOLATE — the top bar names one chunk and the green arrows on the score bracket it. Play just that chunk (into the first note of the next beat) and repeat until it\'s comfortable, then tap NEXT → for the next chunk.\n\n' +
          'CHAIN — once you\'ve drilled each chunk, you play them in a row with rest beats between. NEXT → removes a rest beat (2 → 1 → 0). When you reach the whole passage with no rests, you\'re playing it continuously at goal tempo.\n\n' +
          'The chunk size doubles each round (1 → 2 → 4 → …). ← BACK steps back. Run your own metronome from the tools. The session logs at the last step; tap DONE to log early, or EXIT to leave without logging.' +
          `\n\n${PRACTICE_TOOLS_HELP}`
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  configContainer: { flexGrow: 1, padding: 20, gap: 14, paddingBottom: HELP_CLEARANCE + 20 },
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
  infoBackdrop: {
    flex: 1,
    backgroundColor: '#0008',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  // Matches the guided-tour coachmark card (slate-800 + site orange).
  infoCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radii['2xl'],
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: '#1e293b',
  },
  infoEyebrow: {
    color: '#e67e22',
    fontSize: Type.size.xs,
    fontWeight: Type.weight.heavy,
    letterSpacing: 1,
  },
  infoTitle: { color: '#f8fafc', fontSize: Type.size.lg, fontWeight: Type.weight.bold },
  infoBody: { color: '#cbd5e1', fontSize: Type.size.md, lineHeight: 22 },
  gotItBtn: {
    alignSelf: 'flex-end',
    marginTop: Spacing.xs,
    backgroundColor: '#e67e22',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
  },
  gotItText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  bottomBar: {
    paddingHorizontal: HELP_CLEARANCE,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  pedalNote: { textAlign: 'center', fontSize: 12, opacity: Opacity.muted },
  nextBtn: {
    backgroundColor: '#2ecc71',
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
