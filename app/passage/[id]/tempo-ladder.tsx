import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BpmStepper } from '@/components/BpmStepper';
import { Button } from '@/components/Button';
import { CelebrationModal } from '@/components/CelebrationModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CustomPatternDots } from '@/components/CustomPatternDots';
import { CustomPatternEditor } from '@/components/CustomPatternEditor';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { useScreenTour } from '@/components/tour/TourContext';
import { tourTag, type TourStep } from '@/components/tour/types';
import { ZoomableImage } from '@/components/ZoomableImage';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { isToolsOnly } from '@/lib/strategies/toolsMode';
import { TOOLS_TEMPO_LADDER_HELP } from '@/constants/toolsHelp';
import { ToolsMetronome } from '@/components/ToolsMetronome';
import {
  REP_TARGETS,
  useTempoLadderSession,
  type Increment,
  type RepTarget,
} from '@/hooks/useTempoLadderSession';
import {
  summarizePattern,
  totalRepsInPattern,
  type CustomPattern,
} from '@/lib/strategies/customPatterns';
import {
  createCustomPattern,
  deleteCustomPattern,
  updateCustomPattern,
} from '@/lib/supabase/customPatterns';
import {
  actionButtonStyle,
  configColumnStyle,
  HELP_CLEARANCE,
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
  tempoStacks,
} from '@/lib/layout/configForm';

const INCREMENTS: Increment[] = [2, 5, 10];

// Guided tour for the Tempo Ladder setup screen (web only — see
// useScreenTour / TourContext.web). Each step spotlights one tagged
// control (tourTag below). The "reps to advance" step is skipped
// automatically in Custom mode, where that control isn't shown.
// Module-level const so its reference stays stable across renders.
const TL_SETUP_STEPS: TourStep[] = [
  {
    target: 'tl-mode',
    title: 'Pick a mode',
    dotOffset: { y: -6 },
    body:
      '**Step click-up** — the traditional 5 or 10× in a row without a mistake, all at the same tempo. Then the tempo increments.\n\n' +
      '**Cluster** — within a given range, you’ll play a random new tempo each rep. After a set number of clean reps, the range increments.\n\n' +
      '**Custom** — create your own sequence. Once you complete it successfully, the tempo increments.',
  },
  {
    target: 'tl-tempo',
    title: 'Set your tempo range',
    body:
      'Start well below your target (around half speed is a good rule of thumb) and set your goal to your performance tempo. The ladder climbs between the two.',
  },
  {
    target: 'tl-increment',
    title: 'Choose your step size',
    body:
      'How much should the tempo increase after each set? Enough to feel the difference, not so much that the passage suddenly becomes hard.',
  },
  {
    target: 'tl-reps',
    title: 'Reps to advance',
    body:
      'How many clean reps in a row before you climb. Pick a number that adds a little pressure — nailing 9 in a row makes the 10th feel like a performance. Imagine the pressure at 19!!',
  },
  {
    target: 'tl-start',
    title: 'Start practicing',
    hideDot: true,
    body:
      'When it’s set, tap Start. Mark each rep Clean ✓ or Miss ✗ — honesty with yourself pays dividends.',
  },
];

export default function TempoLadderScreen() {
  const { id, guided } = useLocalSearchParams<{ id: string; guided?: string }>();
  const isGuided = guided === '1';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  // Pattern editor sheet — opens for "+ Build a custom pattern" or
  // "Edit pattern" on the selected Custom card. `initial` non-null = edit
  // mode; null = new-build.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState<CustomPattern | null>(null);
  // Saved custom pattern queued for deletion — drives the confirm dialog.
  const [pendingDelete, setPendingDelete] = useState<CustomPattern | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Phone density check — hoisted ABOVE all early returns so the hook
  // count stays stable across renders (config → loading → play phases).
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  const isTouch = useIsTouchDevice();
  const isLandscape = vpW > vpH;
  // Where the floating ✗ / ✓ rep buttons sit above the bottom. Portrait keeps
  // them lifted clear of the help button; landscape drops them down onto the
  // help-button line (the ✓ is shifted left of the help button — see below)
  // so they don't float high and waste the short screen.
  const repBottomLift = isPhone && isLandscape ? 16 : HELP_CLEARANCE;
  // Extra right offset for the ✓ in landscape so it seats just left of the
  // bottom-right help button instead of on top of it.
  const cleanRightExtra = isPhone && isLandscape ? 60 : 0;

  // Tools mode: reached from the library Tools hub via the sentinel id, with
  // no piece attached. The score backdrop already collapses (it only renders
  // when `passage?.source_uri` exists); the hook handles skipping all
  // passage-keyed persistence.
  const toolsOnly = isToolsOnly(id);
  const session = useTempoLadderSession(id, toolsOnly, isGuided);
  const {
    phase,
    passage,
    progress,
    celebrating,
    mode,
    startTempo,
    goalTempo,
    clusterHigh,
    finalTempo,
    increment,
    targetReps,
    metronome,
    completedSets,
    customPatterns,
    customPatternId,
    customPattern,
    customBlockIndex,
    customRepInBlock,
    customBase,
    setMode,
    setStartTempo,
    setGoalTempo,
    setClusterHigh,
    setFinalTempo,
    setIncrement,
    setTargetReps,
    selectCustomPattern,
    reloadCustomPatterns,
    startSession,
    onClean,
    onMiss,
    advanceAfterCelebration,
    dismissCelebration,
    endSession,
    confirmPerformanceTempo,
    goBackToTempo,
    startGuidedPlaying,
    finishGuidedToLibrary,
  } = session;

  const ann = useScoreAnnotation(passage);

  // Web-only guided tour of the setup screen (the 'config' phase — its
  // tagged controls only exist there). No-op on native, where the help
  // modal still covers Tempo Ladder.
  // The web spotlight tour points at the in-passage setup controls; in Tools
  // mode we show a plain tutorial modal instead (no score, different copy).
  useScreenTour(
    'tempo-ladder-setup',
    phase === 'config' && !toolsOnly && !isGuided ? TL_SETUP_STEPS : null,
  );

  // Live validation for the setup form, so the Start button can say WHY it
  // won't start instead of silently doing nothing — e.g. a cluster window set
  // above the Final performance tempo. Mirrors the guards inside
  // useTempoLadderSession.startSession.
  const configError: string | null = (() => {
    if (mode === 'cluster') {
      const low = parseInt(startTempo, 10);
      const high = parseInt(clusterHigh, 10);
      const final = parseInt(finalTempo, 10);
      if (!low || !high || !final) return 'Enter a Low, High, and Final BPM.';
      if (high <= low) return 'High BPM must be above Low BPM.';
      if (final < high) return 'Final BPM must be at or above the cluster’s High BPM.';
      return null;
    }
    if (mode === 'custom') {
      if (!customPattern) return null; // covered by the pick-a-pattern hint
      const base = parseInt(startTempo, 10);
      const goal = parseInt(goalTempo, 10);
      if (!base || !goal) return 'Enter a Base and Performance BPM.';
      if (goal <= base) return 'Performance BPM must be above Base BPM.';
      return null;
    }
    const start = parseInt(startTempo, 10);
    const goal = parseInt(goalTempo, 10);
    if (!start || !goal) return 'Enter a Start and Goal BPM.';
    if (goal <= start) return 'Goal BPM must be above Start BPM.';
    return null;
  })();

  // ── PERFORMANCE TEMPO (guided onboarding only) ──────────────────────────
  // The quiz drops a brand-new user straight here. One friendly question —
  // how fast it ultimately needs to be — with a hear-it preview; start tempo
  // auto-sets to half and the rest of the setup is skipped.
  if (isGuided && phase === 'tempo') {
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
          contentContainerStyle={[
            styles.configContainer,
            configColumnStyle,
            { paddingTop: Spacing.md },
          ]}>
          <ThemedText type="title">How fast does it need to be?</ThemedText>
          <ThemedText style={{ opacity: 0.7 }}>
            Set your performance tempo — the speed you’ll play it for real. Press
            ▶ to hear it. We’ll start you well below that and climb from there.
          </ThemedText>
          <BpmStepper value={goalTempo} onChange={setGoalTempo} metronome={metronome} />
        </ScrollView>
        <View style={{ padding: 20, gap: 10 }}>
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Button
              label="Next →"
              onPress={confirmPerformanceTempo}
              style={actionButtonStyle}
            />
          </View>
        </View>
      </ThemedView>
    );
  }

  // ── HERE'S THE PLAN (guided onboarding only) ────────────────────────────
  // A short framing screen between the tempo question and play. It also lets
  // the start/goal state settle before startSession reads it.
  if (isGuided && phase === 'ready') {
    const startBpm = parseInt(startTempo, 10) || 60;
    const goalBpm = parseInt(goalTempo, 10) || 120;
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: Spacing.lg }}>
          <Pressable onPress={goBackToTempo} hitSlop={8}>
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
          <ThemedText type="title">Here’s the plan</ThemedText>
          <ThemedText style={{ opacity: 0.85, lineHeight: 22 }}>
            You’ll start at{' '}
            <ThemedText style={{ fontWeight: Type.weight.heavy }}>{startBpm} BPM</ThemedText>{' '}
            — comfortably below your {goalBpm} target. Play the passage along with
            the metronome and mark each try:
          </ThemedText>
          <ThemedText style={{ opacity: 0.85, lineHeight: 22 }}>
            ✓ Clean if you nailed it · ✗ Miss if you didn’t.
          </ThemedText>
          <ThemedText style={{ opacity: 0.85, lineHeight: 22 }}>
            Get{' '}
            <ThemedText style={{ fontWeight: Type.weight.heavy }}>
              5 clean in a row
            </ThemedText>{' '}
            and you’ve done it — the metronome climbs from there.
          </ThemedText>
        </ScrollView>
        <View style={{ padding: 20, gap: 10 }}>
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Button
              label="Start practicing →"
              onPress={() => {
                void startGuidedPlaying();
              }}
              style={actionButtonStyle}
            />
          </View>
        </View>
      </ThemedView>
    );
  }

  if (phase === 'config') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View
          style={[
            styles.topBar,
            {
              borderBottomColor: C.icon + '44',
              paddingTop: insets.top + Spacing.sm,
            },
          ]}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.endBtn}>
            <ThemedText style={[styles.endBtnText, { color: C.tint }]}>EXIT</ThemedText>
          </Pressable>
          <ThemedText style={styles.topTitle}>Tempo Ladder</ThemedText>
        </View>

        <ScrollView contentContainerStyle={[styles.configContainer, configColumnStyle]}>
          {!isPhone && (
            <>
              <ThemedText type="title">Tempo Ladder</ThemedText>
              <ThemedText style={{ opacity: 0.7 }}>
                Slow-practice with graduated tempos. Pick a mode, set your goal, and play.
              </ThemedText>
            </>
          )}

          {/* Strategy explainer now lives behind the ? button (auto-opens for
              first-timers); no inline panel here. */}

          {/* ── Mode picker (top of the form) ───────────────────────── */}
          <ThemedText type="subtitle" style={{ marginTop: Spacing.sm }}>Mode</ThemedText>
          <View style={styles.modeGrid} {...tourTag('tl-mode')}>
            <ModeCard
              title="Step click-up"
              subtitle="Climb one step after N clean reps."
              selected={mode === 'step'}
              onPress={() => setMode('step')}
            />
            <ModeCard
              title="Randomized cluster"
              subtitle="Random tempo in a sliding band."
              selected={mode === 'cluster'}
              onPress={() => setMode('cluster')}
            />
            {customPatterns.map((p) => (
              <ModeCard
                key={p.id}
                title={p.name}
                subtitle={summarizePattern(p)}
                selected={mode === 'custom' && customPatternId === p.id}
                onPress={async () => {
                  await selectCustomPattern(p.id);
                  setMode('custom');
                }}
                onEdit={() => {
                  setEditorInitial(p);
                  setEditorOpen(true);
                }}
                onDelete={() => setPendingDelete(p)}
              />
            ))}
            <ModeCard
              title="+ Build a custom pattern"
              subtitle="9 + 1 patterns, climbs, anything."
              selected={false}
              dashed
              onPress={() => {
                setEditorInitial(null);
                setEditorOpen(true);
              }}
            />
          </View>
          <View style={[styles.divider, { backgroundColor: C.icon + '33' }]} />

          {/* ── Shared config: BPM range + increment ─────────────────── */}
          {/* Cluster mode shows three BPM cards — they never fit across the
              capped column, so always stack. Step/Custom have two and go
              2-across when the column is wide enough (e.g. landscape). */}
          <View
            style={mode === 'cluster' || tempoStacks(vpW) ? styles.rowPhone : styles.row}
            {...tourTag('tl-tempo')}>
            <View style={styles.field}>
              <ThemedText style={styles.label}>
                {mode === 'cluster' ? 'Low BPM' : mode === 'custom' ? 'Base BPM' : 'Start BPM'}
              </ThemedText>
              <BpmStepper
                value={startTempo}
                onChange={setStartTempo}
                metronome={metronome}
              />
            </View>
            <View style={styles.field}>
              <ThemedText style={styles.label}>
                {mode === 'cluster' ? 'High BPM' : mode === 'custom' ? 'Performance BPM' : 'Goal BPM'}
              </ThemedText>
              <BpmStepper
                value={mode === 'cluster' ? clusterHigh : goalTempo}
                onChange={mode === 'cluster' ? setClusterHigh : setGoalTempo}
                metronome={metronome}
              />
            </View>
            {mode === 'cluster' && (
              <View style={styles.field}>
                <ThemedText style={styles.label}>Final BPM</ThemedText>
                <BpmStepper
                  value={finalTempo}
                  onChange={setFinalTempo}
                  metronome={metronome}
                />
              </View>
            )}
          </View>

          <ThemedText style={styles.label}>
            {mode === 'cluster' ? 'Shift window by, per advance' : 'Increment per advance'}
          </ThemedText>
          <View style={styles.chipRow} {...tourTag('tl-increment')}>
            {INCREMENTS.map((n) => (
              <Pressable
                key={n}
                onPress={() => setIncrement(n)}
                style={[
                  styles.chip,
                  {
                    borderColor: C.icon,
                    backgroundColor: increment === n ? C.tint : 'transparent',
                  },
                ]}>
                <ThemedText style={{ color: increment === n ? '#fff' : C.text }}>
                  +{n}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {/* ── Mode-specific extras ────────────────────────────────── */}
          {mode === 'cluster' && (
            <ThemedText style={{ opacity: 0.6, fontSize: 13 }}>
              Each rep picks a random tempo in the current window. On reaching your streak
              target, the window slides up by the increment.
            </ThemedText>
          )}
          {mode !== 'custom' && (
            <>
              <ThemedText style={styles.label}>Clean reps in a row to advance</ThemedText>
              <View style={styles.chipRow} {...tourTag('tl-reps')}>
                {REP_TARGETS.map((n: RepTarget) => (
                  <Pressable
                    key={n}
                    onPress={() => setTargetReps(n)}
                    style={[
                      styles.chip,
                      {
                        borderColor: C.icon,
                        backgroundColor: targetReps === n ? C.tint : 'transparent',
                      },
                    ]}>
                    <ThemedText style={{ color: targetReps === n ? '#fff' : C.text }}>
                      {n}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {mode === 'custom' && customPattern && (
            <View style={[styles.customPreviewBox, { borderColor: C.icon + '33' }]}>
              <ThemedText style={[styles.label, { marginBottom: 4 }]}>
                Pattern: {customPattern.name}
              </ThemedText>
              <CustomPatternDots
                pattern={customPattern}
                base={parseInt(startTempo, 10) || 60}
                performance={parseInt(goalTempo, 10) || 120}
                size="small"
                accent={C.tint}
              />
              <ThemedText style={{ opacity: 0.6, fontSize: 13, marginTop: 6 }}>
                {summarizePattern(customPattern)} — {totalRepsInPattern(customPattern)} reps per set.
                One clean run bumps the tempo by your increment. A miss restarts the pattern.
              </ThemedText>
              <Pressable
                onPress={() => {
                  setEditorInitial(customPattern);
                  setEditorOpen(true);
                }}
                style={[styles.editPatternBtn, { borderColor: C.tint }]}>
                <ThemedText style={{ color: C.tint, fontWeight: Type.weight.heavy }}>
                  Edit pattern
                </ThemedText>
              </Pressable>
            </View>
          )}

          {mode === 'custom' && !customPattern && (
            <ThemedText style={{ opacity: 0.6, fontSize: 13 }}>
              Pick a saved pattern above, or tap{' '}
              <ThemedText style={styles.blurbBold}>+ Build a custom pattern</ThemedText> to
              create one.
            </ThemedText>
          )}

        </ScrollView>

        <View style={styles.startBar}>
          {configError && (
            <ThemedText style={styles.configError}>{configError}</ThemedText>
          )}
          {/* Tag a wrapper sized to the button (not the full-width bar) so
              the tour spotlight + ⓘ dot land on the Start button itself,
              not the far-right screen edge. */}
          <View
            style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}
            {...tourTag('tl-start')}>
            <Button
              label="Start"
              onPress={startSession}
              disabled={(mode === 'custom' && !customPattern) || configError !== null}
              style={actionButtonStyle}
            />
          </View>
        </View>

        <CustomPatternEditor
          visible={editorOpen}
          initial={editorInitial}
          previewBase={parseInt(startTempo, 10) || 60}
          previewPerformance={parseInt(goalTempo, 10) || 120}
          onCancel={() => setEditorOpen(false)}
          onSave={async (name, blocks) => {
            const saved = editorInitial
              ? await updateCustomPattern(editorInitial.id, { name, blocks })
              : await createCustomPattern(name, blocks);
            await reloadCustomPatterns();
            await selectCustomPattern(saved.id);
            setMode('custom');
            setEditorOpen(false);
          }}
        />

        <ConfirmModal
          visible={pendingDelete !== null}
          title="Delete this pattern?"
          message={
            pendingDelete
              ? `"${pendingDelete.name}" will be removed from your saved patterns. This can't be undone.`
              : undefined
          }
          confirmLabel={deleting ? 'Deleting…' : 'Delete'}
          cancelLabel="Cancel"
          destructive
          onConfirm={async () => {
            if (!pendingDelete || deleting) return;
            setDeleting(true);
            try {
              const deletedId = pendingDelete.id;
              await deleteCustomPattern(deletedId);
              // If the deleted pattern was the active selection, fall back
              // to Step mode so the form isn't stuck on a missing pattern.
              if (mode === 'custom' && customPatternId === deletedId) {
                setMode('step');
              }
              await reloadCustomPatterns();
              setPendingDelete(null);
            } finally {
              setDeleting(false);
            }
          }}
          onCancel={() => {
            if (!deleting) setPendingDelete(null);
          }}
        />

        {/* Tools mode: plain tutorial modal with tools-specific copy,
            auto-firing once on every platform (there's no web tour here). */}
        {toolsOnly && (
          <TutorialStep
            id="tools-tempo-ladder"
            visible
            title={TOOLS_TEMPO_LADDER_HELP.title}
            body={TOOLS_TEMPO_LADDER_HELP.body}
          />
        )}
        {/* Native (iPad) keeps the one-shot help modal. On web the
            guided spotlight tour (useScreenTour above) covers this
            screen instead, so the modal's auto-fire is suppressed there
            to avoid showing both. The ? button still reaches this
            content's tour on web; on native it opens this modal. */}
        {!toolsOnly && (
        <TutorialStep
          id="tempo-ladder-setup"
          visible={Platform.OS !== 'web'}
          title="Set up your Tempo Ladder"
          body={
            "Tempo Ladder helps you track the slow process of clicking up the metronome over time. Start well below your target (maybe 50%), play the passage with the metronome, and after each rep mark Clean ✓ (accurate) or Miss ✗ (not). The goal is to get through the sequence of reps without making a mistake. Make sure the passage is PLAYABLE - short enough or slow enough for you to play accurately.\n\n" +
            "Three modes to pick from:\n\n" +
            "Step click-up — the metronome bumps up after N clean reps in a row. Best place to start.\n\n" +
            "Randomized cluster — each rep is a random tempo between two tempos you choose. Keeps you sharp because you never know what's coming. Choose how many you have to get in a row to bump up the cluster. This introduces a slight amount of variability which enhances your learning.\n\n" +
            "Custom — build your own sequence (like 9 reps at base + 1 rep at base+10). One clean run bumps the tempo; one miss restarts the pattern. Tap + Build a custom pattern to create one, or the ✎ on a saved card to edit it.\n\n" +
            "Choose an increment large enough that you can feel the difference, but not so large that the passage suddenly becomes difficult. Choose a number of clean reps to advance that feels like it will simulate some performance anxiety — if you've played it 9 times without mistake, you may feel pressure on number 10 to avoid starting over again. Even more so if you've played 19 clean reps!"
          }
        />
        )}
      </ThemedView>
    );
  }

  if (!progress) return <ThemedView style={{ flex: 1 }} />;

  const reachedGoal = celebrating?.reached ?? false;
  // Custom mode: position in the expanded rep list = sum of reps in
  // earlier blocks + customRepInBlock. The dot ring sits on the rep the
  // user is ABOUT to play. expandPatternToReps is also called internally
  // by CustomPatternDots to lay out the strip — kept in sync via the
  // same helper.
  const customPosition =
    progress.mode === 'custom' && customPattern
      ? customPattern.blocks
          .slice(0, customBlockIndex)
          .reduce((acc, b) => acc + b.count, 0) + customRepInBlock
      : null;
  const nextPreviewTempo =
    progress.mode === 'cluster'
      ? null
      : progress.mode === 'custom'
        ? Math.min(progress.goal_tempo, customBase + (progress.increment ?? 5))
        : Math.min(progress.goal_tempo, progress.current_tempo + (progress.increment ?? 5));
  const celebrationBody = reachedGoal
    ? `You reached your goal tempo of ${progress.goal_tempo} BPM.`
    : progress.mode === 'cluster'
      ? `Ready to slide the cluster up by ${progress.increment ?? 5} BPM?`
      : progress.mode === 'custom'
        ? `Pattern clean! Bump the base up to ${nextPreviewTempo} BPM?`
        : `Ready to step up to ${nextPreviewTempo} BPM?`;

  // Phone: hide the chunky top bar and float the controls. The
  // streak dots sit center-top of the score, the Miss / Clean targets
  // become small circular buttons in opposite bottom corners (so a
  // mis-tap can't accidentally fire the wrong call), and End shrinks
  // to a top-left × glyph. Desktop keeps the original layout.
  // (isPhone is derived once at the top of the component — see above.)

  function onEndPress() {
    // Tools-only mode has no piece to log against — just end, no log prompt.
    if (!toolsOnly && completedSets > 0) setNotePromptVisible(true);
    else endSession();
  }

  return (
    <View style={[styles.playRoot, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Keyboard / foot-pedal shortcuts so users don't have to keep clicking:
          right pedal / Space = ✓ Clean, left pedal / X = ✗ Miss. Suppressed
          while a celebration / log-prompt modal is showing so it can't fire a
          rep behind the modal. No-op on native (iPad relies on its
          floating buttons + Apple Pencil + foot pedal). */}
      <PedalCatcher
        active={!notePromptVisible && celebrating === null}
        onAdvance={onClean}
        onBack={onMiss}
        secondaryKey="x"
        onSecondary={onMiss}
      />
      {!isPhone && (
        <View
          style={[
            styles.activeTopBar,
            { borderBottomColor: C.icon + '44', paddingTop: insets.top + 10 },
          ]}>
          <Pressable onPress={onEndPress} hitSlop={8} style={styles.endBtn}>
            <ThemedText style={[styles.endBtnText, { color: C.tint }]}>EXIT</ThemedText>
          </Pressable>
          <View style={styles.streakDots}>
            {progress.mode === 'custom' && customPattern ? (
              <CustomPatternDots
                pattern={customPattern}
                base={customBase}
                performance={progress.goal_tempo}
                position={customPosition}
                state="playing"
                size="medium"
                accent="#2ecc71"
              />
            ) : (
              Array.from({ length: progress.target_reps }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i < progress.current_streak
                      ? styles.dotFilled
                      : { borderColor: C.icon },
                  ]}
                />
              ))
            )}
          </View>
          <Pressable
            onPress={onMiss}
            hitSlop={6}
            style={[styles.repBtn, styles.missBtn]}>
            <ThemedText style={styles.repBtnText}>Miss ✗</ThemedText>
          </Pressable>
          <View style={styles.repGap} />
          <Pressable
            onPress={onClean}
            hitSlop={6}
            style={[styles.repBtn, styles.cleanBtn]}>
            <ThemedText style={styles.repBtnText}>Clean ✓</ThemedText>
          </Pressable>
        </View>
      )}

      {/* Tiny keyboard hint on laptop / desktop so users discover that
          they can mark reps without clicking. Hidden on phone — no
          keyboard there, so the line would just steal vertical space
          from the score. */}
      {!isPhone && (
        <ThemedText style={[styles.kbdHint, { color: C.text }]}>
          Space or foot pedal = Clean ✓ · X = Miss ✗
        </ThemedText>
      )}

      <View
        style={[
          styles.contentArea,
          // Trim just enough off the score's bottom so the floating
          // ✗ / ✓ buttons don't sit on top of notes. In PORTRAIT there's
          // plenty of height, so reserve the full band (buttons are ~56
          // tall and lifted to clear the help button). In LANDSCAPE the
          // screen is short and that fixed band eats a third of it — so
          // reserve almost nothing and let the score fill the height; the
          // ✗ / ✓ buttons float over the lower corners and the user can
          // pinch to nudge notes clear.
          isPhone &&
            (vpW > vpH
              ? { paddingBottom: insets.bottom + 8 }
              : { paddingBottom: insets.bottom + HELP_CLEARANCE + 36 }),
          // Laptop: inset the score from the screen edges so it clears the
          // edge-docked tool tabs and gets top/bottom breathing room. The
          // score lives in an inner flex child (an absolutely-filled score
          // ignores this padding on web); PracticeToolsLayer + the phone
          // overlays stay siblings at the true screen edge.
          !isPhone && {
            paddingHorizontal: SCORE_SIDE_BUFFER,
            paddingVertical: SCORE_VERT_BUFFER,
            backgroundColor: SCORE_FRAME_BG,
          },
        ]}>
        <View style={{ flex: 1, width: '100%', position: 'relative' }}>
          {passage?.source_uri &&
            (isTouch ? (
              <ZoomableImage
                uri={passage.source_uri}
                style={styles.scoreContain}
                persistKey={passage.id}
              />
            ) : (
              <Image
                source={{ uri: passage.source_uri }}
                style={styles.scoreContain}
                contentFit="contain"
              />
            ))}
          {/* Tools mode: no score, so show the metronome inline and centered
              (bigger on iPad/laptop) instead of leaving it off in an edge tab.
              The rep controls sit in the top bar (non-phone) or float at the
              corners (phone) around it. */}
          {toolsOnly && (
            <View style={styles.toolsMetroWrap} pointerEvents="box-none">
              <ToolsMetronome metronome={metronome} />
            </View>
          )}
          {ann.canvas}
        </View>
        {/* Guided onboarding keeps the surface minimal — no edge tool tabs.
            The metronome auto-runs (startGuidedPlaying), so audio is fine. */}
        {!isGuided && (
          <PracticeToolsLayer
            metronome={metronome}
            metronomeNote="Tempo Ladder controls the tempo — no need to adjust it. Just press play."
            pencil={ann.pencil}
            recorderPassageId={passage?.id}
            // Tools mode renders the metronome inline (above), so drop it from
            // the edge tabs to avoid two; keep just the practice timers.
            tools={toolsOnly ? { left: [], right: ['timer'] } : undefined}
          />
        )}

        {/* Phone overlays — float on top of the score so the practice
            controls don't steal vertical space. */}
        {isPhone && (
          <>
            <View
              pointerEvents="none"
              style={[styles.phoneDotsWrap, { top: insets.top + 10 }]}>
              <View style={styles.phoneDotsPill}>
                {progress.mode === 'custom' && customPattern ? (
                  <CustomPatternDots
                    pattern={customPattern}
                    base={customBase}
                    performance={progress.goal_tempo}
                    position={customPosition}
                    state="playing"
                    size="small"
                    accent="#2ecc71"
                  />
                ) : (
                  Array.from({ length: progress.target_reps }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.phoneDot,
                        i < progress.current_streak
                          ? styles.phoneDotFilled
                          : styles.phoneDotEmpty,
                      ]}
                    />
                  ))
                )}
              </View>
            </View>

            <Pressable
              onPress={onEndPress}
              hitSlop={6}
              accessibilityLabel="Exit session"
              style={[
                styles.phoneEndBtn,
                { top: insets.top + 8, left: insets.left + 8 },
              ]}>
              <ThemedText style={[styles.phoneEndGlyph, { color: C.tint }]}>EXIT</ThemedText>
            </Pressable>

            <Pressable
              onPress={onMiss}
              hitSlop={6}
              accessibilityLabel="Mark as miss"
              style={[
                styles.phoneRepBtn,
                styles.phoneMissBtn,
                // Lifted to clear the global help button's bottom-right
                // corner (the ✓ sits directly above it; both raised so
                // the pair stays level). `insets.left` keeps it clear of the
                // notch / camera / speaker on the side edge in landscape.
                // `cleanRightExtra` mirrors the ✓ button's inward shift so the
                // pair sits symmetrically (B-009).
                {
                  bottom: insets.bottom + repBottomLift,
                  left: insets.left + 16 + cleanRightExtra,
                },
              ]}>
              <ThemedText style={styles.phoneRepGlyph}>✗</ThemedText>
            </Pressable>
            <Pressable
              onPress={onClean}
              hitSlop={6}
              accessibilityLabel="Mark as clean"
              style={[
                styles.phoneRepBtn,
                styles.phoneCleanBtn,
                {
                  bottom: insets.bottom + repBottomLift,
                  right: insets.right + 16 + cleanRightExtra,
                },
              ]}>
              <ThemedText style={styles.phoneRepGlyph}>✓</ThemedText>
            </Pressable>
          </>
        )}
      </View>

      {/* Guided onboarding: completing one clean set IS the finish line. Show
          a single celebratory overlay (no "step up" / log-note forms) that
          logs the session and lands the first-timer in their library. */}
      {isGuided && (celebrating !== null || notePromptVisible) && (
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
              {progress.target_reps} clean in a row — you did it!
            </ThemedText>
            <ThemedText style={{ textAlign: 'center', opacity: 0.8 }}>
              Nice work — your first session is saved to your practice log.
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

      <CelebrationModal
        // Tools-only mode never shows the log prompt, so the celebration also
        // covers the goal-reached case here (and its End just exits).
        visible={!isGuided && celebrating !== null && (toolsOnly || !reachedGoal)}
        title={
          reachedGoal
            ? `Goal tempo reached — ${progress.goal_tempo} BPM!`
            : progress.mode === 'custom'
              ? 'Pattern clean!'
              : `${progress.target_reps} clean in a row!`
        }
        body={celebrationBody}
        primary={{
          label: toolsOnly ? 'Done' : 'End session',
          onPress: () => {
            dismissCelebration();
            if (toolsOnly) endSession();
            else setNotePromptVisible(true);
          },
        }}
        secondary={
          reachedGoal
            ? undefined
            : { label: 'Step up tempo', onPress: advanceAfterCelebration }
        }
      />

      <PracticeLogNotePrompt
        visible={
          !toolsOnly &&
          !isGuided &&
          ((celebrating !== null && reachedGoal) || notePromptVisible)
        }
        emoji={reachedGoal && celebrating ? '🎉' : undefined}
        title={
          reachedGoal && celebrating
            ? `Goal tempo reached — ${progress.goal_tempo} BPM!`
            : 'How did that go?'
        }
        subtitle={passage?.title ?? 'Tempo Ladder'}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note, remindNext }) => {
          setNotePromptVisible(false);
          dismissCelebration();
          endSession({ mood, note, remindNext });
        }}
        onSkip={() => {
          setNotePromptVisible(false);
          dismissCelebration();
          endSession();
        }}
      />

      {toolsOnly ? (
        // "?" content during play (the tools intro already auto-fired in setup).
        <TutorialStep
          id="tools-tempo-ladder"
          visible={false}
          title={TOOLS_TEMPO_LADDER_HELP.title}
          body={TOOLS_TEMPO_LADDER_HELP.body}
        />
      ) : (
        <TutorialStep
          id="tempo-ladder-play"
          visible={false}
          title="Running a Tempo Ladder"
          body={
            "Play a rep at the current tempo, then mark it:\n\n" +
            "✓ Clean — counts toward your target reps in a row (the dots up top track your streak). Once you hit your target, the metronome bumps up by your increment.\n\n" +
            "✗ Miss — resets your streak (Step / Cluster) or restarts the pattern (Custom).\n\n" +
            "Keyboard shortcuts on laptop: Space = Clean ✓, X = Miss ✗. Foot pedals work the same. Tap EXIT at the top-left to end the session and log it." +
            `\n\n${PRACTICE_TOOLS_HELP}`
          }
        />
      )}
    </View>
  );
}

// Mode picker card. Used for both built-in modes (Step / Cluster) and
// saved Custom patterns. `dashed` renders the "+ Build" affordance with
// a dashed border so it's visibly an add-action, not a selectable mode.
// `onEdit` (Custom-only) adds a small pencil button to the corner.
function ModeCard({
  title,
  subtitle,
  selected,
  onPress,
  onEdit,
  onDelete,
  dashed = false,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  dashed?: boolean;
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
          borderStyle: dashed ? 'dashed' : 'solid',
          backgroundColor: selected
            ? C.tint + '11'
            : pressed
              ? C.icon + '11'
              : 'transparent',
        },
      ]}>
      <ThemedText
        style={[
          styles.modeCardTitle,
          { color: selected ? C.tint : C.text },
        ]}
        numberOfLines={2}>
        {title}
      </ThemedText>
      <ThemedText
        style={[styles.modeCardSubtitle, { color: C.icon }]}
        numberOfLines={2}>
        {subtitle}
      </ThemedText>
      {(onEdit || onDelete) && (
        <View style={styles.modeCardActions}>
          {onEdit && (
            <Pressable
              onPress={onEdit}
              hitSlop={8}
              style={styles.modeCardActionBtn}
              accessibilityLabel="Edit pattern">
              <ThemedText style={[styles.modeCardEditGlyph, { color: C.icon }]}>
                ✎
              </ThemedText>
            </Pressable>
          )}
          {onDelete && (
            <Pressable
              onPress={onDelete}
              hitSlop={8}
              style={styles.modeCardActionBtn}
              accessibilityLabel="Delete pattern">
              <ThemedText style={[styles.modeCardEditGlyph, { color: Status.danger }]}>
                🗑
              </ThemedText>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  backText: { fontSize: 17, fontWeight: Type.weight.semibold },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
  },

  configContainer: {
    padding: 20,
    gap: 14,
    paddingBottom: Spacing['2xl'],
  },
  // Fixed footer holding the "Start" button. Symmetric padding keeps the
  // capped button centred on the window (aligned with the card column
  // above); the side padding equals the help-button corner reserve, so on
  // a narrow viewport the button still clears the bottom-right "?" button.
  startBar: {
    paddingTop: Spacing.md,
    paddingBottom: 20,
    paddingHorizontal: HELP_CLEARANCE,
  },
  configError: {
    color: Status.danger,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  divider: { height: 1, marginVertical: Spacing.sm, borderRadius: 1 },
  row: { flexDirection: 'row', gap: Spacing.md },
  rowPhone: { flexDirection: 'column', gap: Spacing.md },
  field: { flex: 1, gap: 6 },
  label: { opacity: Opacity.subtle },
  blurbText: { opacity: Opacity.muted, fontSize: Type.size.md, lineHeight: 20 },
  blurbBold: { fontWeight: Type.weight.heavy, opacity: 1 },
  chipRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  chip: {
    borderWidth: Borders.thin,
    borderRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minWidth: 56,
    alignItems: 'center',
  },
  // ── Mode picker card grid ────────────────────────────────────────
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  // Each card sits ~half the row at the typical phone/tablet width, with
  // wrap so a third or fourth card (saved Custom patterns) flows to the
  // next row. minWidth keeps them legible on narrow phones.
  modeCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 140,
    minHeight: 78,
    borderWidth: 1.5,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 4,
    position: 'relative',
  },
  modeCardTitle: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
  },
  modeCardSubtitle: {
    fontSize: Type.size.xs,
    lineHeight: 16,
  },
  modeCardActions: {
    position: 'absolute',
    top: 4,
    right: 6,
    flexDirection: 'row',
    gap: 2,
  },
  modeCardActionBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeCardEditGlyph: {
    fontSize: 14,
  },
  // ── Custom-mode preview box ──────────────────────────────────────
  customPreviewBox: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: 6,
  },
  editPatternBtn: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },

  playRoot: { flex: 1 },
  activeTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: 14,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#ffffffd0',
    zIndex: 1,
  },
  endBtn: { paddingHorizontal: 6, paddingVertical: Spacing.xs },
  // Mirrors SessionTopBar's exitText so every EXIT reads the same.
  endBtnText: { fontSize: Type.size.sm, fontWeight: Type.weight.heavy },
  streakDots: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: '#2ecc71', borderColor: '#2ecc71' },
  contentArea: { flex: 1 },
  scoreContain: { flex: 1, width: '100%' },
  toolsMetroWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repBtn: {
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 12,
    minWidth: 104,
    alignItems: 'center',
  },
  repGap: { width: 28 },
  cleanBtn: { backgroundColor: '#2ecc71' },
  missBtn: { backgroundColor: '#c0392b' },
  repBtnText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 17 },

  // Small one-line keyboard / pedal hint under the top bar (laptop +
  // tablet). Kept high-contrast so it's legible on an iPad screen rather
  // than fading into the background.
  kbdHint: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: Type.weight.semibold,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    opacity: 0.9,
  },

  // Phone overlays. Z-indexed above the score but below modals.
  phoneDotsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  phoneDotsPill: {
    flexDirection: 'row',
    // Wrap to a second row when there are too many dots for the phone width
    // (e.g. a 20-rep target) instead of overflowing off-screen. maxWidth fits
    // ~10 dots per row, so 20 lands as two tidy rows of 10.
    flexWrap: 'wrap',
    maxWidth: 248,
    justifyContent: 'center',
    rowGap: 6,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#000000aa',
  },
  phoneDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  phoneDotEmpty: { borderColor: '#ffffff77', backgroundColor: 'transparent' },
  phoneDotFilled: { borderColor: '#2ecc71', backgroundColor: '#2ecc71' },
  phoneEndBtn: {
    // Plain blue text, no chip — matches SessionTopBar's EXIT exactly so the
    // floating (no-top-bar) layout reads the same as every other screen.
    position: 'absolute',
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: Spacing.xs,
    zIndex: 5,
  },
  // Mirrors SessionTopBar's exitText so every EXIT reads the same.
  phoneEndGlyph: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
  },
  phoneRepBtn: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 5,
  },
  phoneMissBtn: { left: 16, backgroundColor: '#c0392b' },
  phoneCleanBtn: { right: 16, backgroundColor: '#2ecc71' },
  phoneRepGlyph: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: Type.weight.heavy,
  },
});
