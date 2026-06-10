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

import { ActionSheet } from '@/components/ActionSheet';
import { BpmStepper } from '@/components/BpmStepper';
import { Button } from '@/components/Button';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { ScoreWithMarkers, nearestMarkerNormalized } from '@/components/ScoreWithMarkers';
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
      'Tap just above each note to add a link to the chain. Pinch to zoom in so you can place each mark accurately. Use UNDO / CLEAR up top to fix a mistake.',
  },
  {
    target: 'mc-next',
    title: 'Choose how to build',
    hideDot: true,
    body:
      `Once you have at least ${MIN_MICRO_MARKS} notes marked, NEXT → lights up — tap it to pick Forward, Backward, or Problem chaining and set your tempo.`,
  },
];

export default function MicroChainingScreen() {
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
  const session = useMicroChainSession(id);

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
  } = session;

  const ann = useScoreAnnotation(passage);

  useScreenTour(
    'micro-chaining-marking',
    phase === 'marking' ? MC_MARKING_STEPS : null,
  );

  // Note marks sit close together, so every tap PLACES a mark — there's no
  // tap-to-remove here (it kept erasing the previous mark when two notes were
  // close). UNDO / CLEAR up top handle mistakes instead.
  function onMarkTap(point: { x: number; y: number }) {
    placeMark(point);
  }

  // ── MARKING ────────────────────────────────────────────────────────────
  if (phase === 'marking') {
    if (!passage) return <ThemedView style={{ flex: 1 }} />;
    const canContinue = marks.length >= MIN_MICRO_MARKS;
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
                <ThemedText style={[styles.topBtnText, { color: '#c0392b' }]}>CLEAR</ThemedText>
              </Pressable>
              <Pressable
                onPress={canContinue ? commitMarksAndConfigure : undefined}
                hitSlop={6}
                disabled={!canContinue}
                {...tourTag('mc-next')}
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
            Tap just above each note to add a link to the chain. Pinch to zoom in for
            accuracy. You need at least {MIN_MICRO_MARKS} notes. Use UNDO to fix a mistake.
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
            'Mark each note: tap just above each note head to add a link to the chain. Pinch to zoom in so you can place each mark accurately. You need at least ' +
            String(MIN_MICRO_MARKS) +
            ' notes.\n\n' +
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
                style={[actionButtonStyle, { opacity: canPickProblem ? 1 : 0.4 }]}
              />
            ) : (
              <Button
                label={resuming ? 'Start over from Step 1' : 'Start practicing'}
                variant={resuming ? 'outline' : 'primary'}
                onPress={startPlaying}
                disabled={!canStart}
                style={[actionButtonStyle, { opacity: canStart ? 1 : 0.4 }]}
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
      ? `Problem spot: notes ${lo}–${hi}. Tap a note to change it, or Start practicing.`
      : problemA != null
        ? 'Now tap the second note of the problem spot (next to it, or further along).'
        : 'Tap the first note of the muddy spot.';
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
                const hit = nearestMarkerNormalized(marks, point, 0.05 / scale);
                if (hit != null) selectProblemNote(hit);
              }}>
              <ScoreWithMarkers
                uri={passage.source_uri}
                markers={marks}
                mode="place"
                captureTaps={false}
                compact
                highlightIndices={highlights}
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
      <SessionTopBar
        onExit={exitSession}
        exitLabel="EXIT"
        center={
          isPhoneLandscape ? (
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              {currentIndex + 1}/{storedConfig.steps.length}
              <ThemedText style={styles.topCenterHint}>
                {'   ·   Play from the first ▼ to the last.'}
              </ThemedText>
            </ThemedText>
          ) : (
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              {noteLabel} · {currentIndex + 1}/{storedConfig.steps.length}
            </ThemedText>
          )
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

      {!isPhoneLandscape && (
        <ThemedText style={styles.playHelper}>
          Play from the first arrow ▼ to the last, then tap NEXT → to extend the chain.
        </ThemedText>
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
        <PracticeToolsLayer
          metronome={metronome}
          metronomeNote="Micro-Chaining stays at your performance tempo — play the highlighted notes, then tap Next."
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

      <TutorialStep
        id="micro-chaining-play"
        visible={false}
        title="Running a Micro-Chain"
        body={
          'The score marks the span you play right now with two arrows ▼ — the first note and the current end note. Play from the first to the last at your performance tempo, then tap NEXT → to extend the chain by one note.\n\n' +
          'Forward grows from the first note; Backward grows from the last; Problem starts on the muddy transition and expands both ways. ← BACK shrinks the chain one link (handy if you advanced too soon).\n\n' +
          'Run your own metronome from the tools — Micro-Chaining keeps you at one tempo on purpose. The session logs when you reach the last step; tap DONE to log it early, or EXIT to leave without logging.' +
          `\n\n${PRACTICE_TOOLS_HELP}`
        }
      />
    </ThemedView>
  );
}

function ModeCard({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeCard,
        {
          borderColor: selected ? C.tint : C.icon + '55',
          backgroundColor: selected
            ? C.tint + '11'
            : pressed
              ? C.icon + '11'
              : 'transparent',
        },
      ]}>
      <ThemedText
        style={[styles.modeCardTitle, { color: selected ? C.tint : C.text }]}
        numberOfLines={2}>
        {title}
      </ThemedText>
      <ThemedText style={[styles.modeCardSubtitle, { color: C.icon }]} numberOfLines={3}>
        {subtitle}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  configContainer: { flexGrow: 1, padding: 20, gap: 14, paddingBottom: HELP_CLEARANCE + 20 },
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
  modeCardTitle: { fontSize: Type.size.sm, fontWeight: Type.weight.heavy },
  modeCardSubtitle: { fontSize: Type.size.xs, lineHeight: 16 },
});
