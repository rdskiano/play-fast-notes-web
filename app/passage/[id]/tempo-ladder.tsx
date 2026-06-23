import Feather from '@expo/vector-icons/Feather';
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
import { PracticeToolsBar } from '@/components/PracticeToolsBar';
import { RotateForPractice } from '@/components/RotateForPractice';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { useScreenTour } from '@/components/tour/TourContext';
import { tourTag, type TourStep } from '@/components/tour/types';
import { ZoomableImage } from '@/components/ZoomableImage';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { Palette, Lift } from '@/constants/palette';
import { Colors, Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
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

// Tempo Ladder accent — the strategy's "clean / go" green. Used for selected
// states, the slider, and the Start CTA on this setup screen.
const ACCENT = Palette.tempoLadder;
const ACCENT_SOFT = Palette.tempoLadderSoft;

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
    ACCENT, // green ⓘ dots, matching this screen's accent + helper note
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
          <ThemedText style={{ opacity: 0.85, lineHeight: 22, marginTop: Spacing.xs }}>
            One more thing: this is repetitive on purpose — and a quick pause
            every few reps helps your brain lock it in faster. I’ve turned on a{' '}
            <ThemedText style={{ fontWeight: Type.weight.heavy }}>micro-break</ThemedText>{' '}
            timer so you can feel it.
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
    // Computed subtitle under the big title. For step mode, summarize the
    // ladder as "<rungs> rungs · +<inc> BPM each"; cluster/custom get a short
    // static phrase. Robust against NaN/Infinity → static fallback.
    const headerSubtitle = (() => {
      if (mode === 'cluster') return 'Random tempo in a sliding band.';
      if (mode === 'custom') {
        return customPattern
          ? summarizePattern(customPattern)
          : 'Build your own rep-by-rep sequence.';
      }
      const start = parseInt(startTempo, 10);
      const goal = parseInt(goalTempo, 10);
      if (
        Number.isFinite(start) &&
        Number.isFinite(goal) &&
        increment > 0 &&
        goal > start
      ) {
        const rungs = Math.max(1, Math.round((goal - start) / increment)) + 1;
        return `${rungs} rungs · +${increment} BPM each`;
      }
      return 'Slow-practice with graduated tempos.';
    })();

    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />

        <ScrollView
          contentContainerStyle={[
            styles.configContainer,
            configColumnStyle,
            { paddingTop: insets.top + Spacing.md },
          ]}>
          {/* Big-title header (DESIGN_RULES §3) — replaces the old EXIT top bar
              + inline title. Back link, then a monogram chip beside the title. */}
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={styles.backLink}>‹ Back</ThemedText>
          </Pressable>
          <View style={styles.headerRow}>
            <View style={styles.monogram}>
              <ThemedText style={styles.monogramText}>TL</ThemedText>
            </View>
            <View style={styles.headerTextCol}>
              <ThemedText type="title">Tempo Ladder</ThemedText>
              <ThemedText style={styles.headerSubtitle} numberOfLines={2}>
                {headerSubtitle}
              </ThemedText>
            </View>
          </View>

          {/* Strategy explainer now lives behind the ? button (auto-opens for
              first-timers); no inline panel here. */}

          {/* ── Mode picker (top of the form) ───────────────────────── */}
          <ThemedText style={styles.sectionHeader}>Mode</ThemedText>
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
          <View style={styles.divider} />

          {/* ── Tempo range ──────────────────────────────────────────── */}
          {/* Header row: section title on the left, a muted live summary of
              the current Start → Goal span on the right. */}
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={styles.sectionHeader}>Tempo range</ThemedText>
            <ThemedText style={styles.sectionHeaderMeta}>
              {`${parseInt(startTempo, 10) || 0} → ${
                parseInt(mode === 'cluster' ? clusterHigh : goalTempo, 10) || 0
              } BPM`}
            </ThemedText>
          </View>
          {/* Cluster mode shows three BPM cards — they never fit across the
              capped column, so always stack. Step/Custom have two and go
              2-across when the column is wide enough (e.g. landscape). */}
          <View
            style={mode === 'cluster' || tempoStacks(vpW) ? styles.rowPhone : styles.row}
            {...tourTag('tl-tempo')}>
            <View style={styles.field}>
              <ThemedText style={styles.fieldLabel}>
                {mode === 'cluster' ? 'Low BPM' : mode === 'custom' ? 'Base BPM' : 'Start BPM'}
              </ThemedText>
              <BpmStepper
                value={startTempo}
                onChange={setStartTempo}
                metronome={metronome}
                accent={ACCENT}
              />
            </View>
            <View style={styles.field}>
              <ThemedText style={styles.fieldLabel}>
                {mode === 'cluster' ? 'High BPM' : mode === 'custom' ? 'Performance BPM' : 'Goal BPM'}
              </ThemedText>
              <BpmStepper
                value={mode === 'cluster' ? clusterHigh : goalTempo}
                onChange={mode === 'cluster' ? setClusterHigh : setGoalTempo}
                metronome={metronome}
                accent={ACCENT}
              />
            </View>
            {mode === 'cluster' && (
              <View style={styles.field}>
                <ThemedText style={styles.fieldLabel}>Final BPM</ThemedText>
                <BpmStepper
                  value={finalTempo}
                  onChange={setFinalTempo}
                  metronome={metronome}
                  accent={ACCENT}
                />
              </View>
            )}
          </View>

          {/* ── Climb by / Clean reps — labeled segmented controls ───── */}
          <View style={styles.segmentsRow}>
            <View style={styles.segmentGroup} {...tourTag('tl-increment')}>
              <ThemedText style={styles.segmentLabel}>
                {mode === 'cluster' ? 'Shift window by' : 'Climb by'}
              </ThemedText>
              <View style={styles.pillRow}>
                {INCREMENTS.map((n) => {
                  const on = increment === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setIncrement(n)}
                      style={[
                        styles.pill,
                        { backgroundColor: on ? ACCENT : Palette.surfaceSunk },
                      ]}>
                      <ThemedText
                        style={[styles.pillText, { color: on ? '#fff' : Palette.text }]}>
                        +{n}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {mode !== 'custom' && (
              <View style={styles.segmentGroup} {...tourTag('tl-reps')}>
                <ThemedText style={styles.segmentLabel}>Clean reps</ThemedText>
                <View style={styles.pillRow}>
                  {REP_TARGETS.map((n: RepTarget) => {
                    const on = targetReps === n;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => setTargetReps(n)}
                        style={[
                          styles.pill,
                          { backgroundColor: on ? ACCENT : Palette.surfaceSunk },
                        ]}>
                        <ThemedText
                          style={[styles.pillText, { color: on ? '#fff' : Palette.text }]}>
                          {n}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* ── Mode-specific extras ────────────────────────────────── */}
          {mode === 'custom' && customPattern && (
            <View style={styles.customPreviewBox}>
              <ThemedText style={[styles.fieldLabel, { marginBottom: 4 }]}>
                Pattern: {customPattern.name}
              </ThemedText>
              <CustomPatternDots
                pattern={customPattern}
                base={parseInt(startTempo, 10) || 60}
                performance={parseInt(goalTempo, 10) || 120}
                size="small"
                accent={ACCENT}
              />
              <ThemedText style={styles.previewNote}>
                {summarizePattern(customPattern)} — {totalRepsInPattern(customPattern)} reps per set.
                One clean run bumps the tempo by your increment. A miss restarts the pattern.
              </ThemedText>
              <Pressable
                onPress={() => {
                  setEditorInitial(customPattern);
                  setEditorOpen(true);
                }}
                style={[styles.editPatternBtn, { borderColor: ACCENT }]}>
                <ThemedText style={{ color: ACCENT, fontWeight: Type.weight.heavy }}>
                  Edit pattern
                </ThemedText>
              </Pressable>
            </View>
          )}

          {mode === 'custom' && !customPattern && (
            <ThemedText style={styles.previewNote}>
              Pick a saved pattern above, or tap{' '}
              <ThemedText style={styles.blurbBold}>Build a custom pattern</ThemedText> to
              create one.
            </ThemedText>
          )}

          {/* Single helper note (replaces the scattered inline explainers).
              Cluster's extra explainer + the general "start clean" coaching
              copy live here. */}
          <View style={styles.helperNote}>
            <Feather name="info" size={16} color={ACCENT} style={styles.helperIcon} />
            <ThemedText style={styles.helperText}>
              {mode === 'cluster'
                ? 'Each rep picks a random tempo in the current window. On reaching your streak target, the window slides up by the increment. Start where you can play it cleanly and comfortably.'
                : 'Start where you can play it cleanly and comfortably — around half your target tempo is a good rule of thumb. The ladder climbs from there.'}
            </ThemedText>
          </View>

        </ScrollView>

        <View style={styles.startBar}>
          {configError && (
            <ThemedText style={styles.configError}>{configError}</ThemedText>
          )}
          {/* Tag a wrapper sized to the button (not the full-width bar) so
              the tour spotlight + ⓘ dot land on the Start button itself,
              not the far-right screen edge. */}
          <Pressable
            onPress={startSession}
            disabled={(mode === 'custom' && !customPattern) || configError !== null}
            style={({ pressed }) => [
              styles.startBtn,
              {
                opacity:
                  (mode === 'custom' && !customPattern) || configError !== null
                    ? 0.5
                    : pressed
                      ? 0.9
                      : 1,
              },
            ]}
            {...tourTag('tl-start')}>
            <ThemedText style={styles.startBtnText}>Start practicing →</ThemedText>
          </Pressable>
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

  // Live streak indicator for the top-bar tracker pill — shared by the phone
  // (no count text) and desktop (with "n/N") layouts.
  function trackerDots(showCount: boolean) {
    if (!progress) return null;
    if (progress.mode === 'custom' && customPattern) {
      return (
        <CustomPatternDots
          pattern={customPattern}
          base={customBase}
          performance={progress.goal_tempo}
          position={customPosition}
          state="playing"
          size="small"
          accent={Palette.success}
        />
      );
    }
    return (
      <>
        <View style={styles.runStatDots}>
          {Array.from({ length: progress.target_reps }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.runStatDot,
                i < progress.current_streak
                  ? styles.runStatDotFilled
                  : styles.runStatDotEmpty,
              ]}
            />
          ))}
        </View>
        {showCount && (
          <ThemedText style={styles.runStatCount}>
            {progress.current_streak}/{progress.target_reps}
          </ThemedText>
        )}
      </>
    );
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
      {/* ── Reskinned run top bar (all devices) — Exit (left) · title +
          live "BPM · streak dots · count" pill (centre). The tools pill
          floats top-right (rendered last, below). */}
      <View style={[styles.runTopBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.runSide}>
          <Pressable onPress={onEndPress} hitSlop={8} style={styles.runExit}>
            <Feather name="log-out" size={15} color={Palette.danger} />
            <ThemedText style={styles.runExitText}>Exit</ThemedText>
          </Pressable>
        </View>
        <View style={styles.runCenter}>
          {/* Strategy + passage title — desktop / iPad only. Dropped on phone
              to save a whole line (practice runs in landscape there, where
              vertical space is scarce). The tracker pill stays centred. */}
          {!isPhone && (
            <View style={styles.runTitleRow}>
              <View style={styles.runGreenDot} />
              <ThemedText style={styles.runTitleText} numberOfLines={1}>
                Tempo Ladder
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
            <ThemedText style={styles.runStatBpm}>{metronome.bpm}</ThemedText>
            <ThemedText style={styles.runStatUnit}>BPM</ThemedText>
            <View style={styles.runStatDivider} />
            {trackerDots(true)}
          </View>
        </View>
        <View style={styles.runSide} />
      </View>

      {/* ── Score ──────────────────────────────────────────────────── */}
      <View
        style={[
          styles.contentArea,
          isPhone
            ? { paddingBottom: insets.bottom + (isLandscape ? 8 : 0) }
            : {
                paddingHorizontal: SCORE_SIDE_BUFFER,
                paddingTop: SCORE_VERT_BUFFER,
                paddingBottom: Spacing.sm,
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
          {/* Tools mode: no score, so show the metronome inline and centered. */}
          {toolsOnly && (
            <View style={styles.toolsMetroWrap} pointerEvents="box-none">
              <ToolsMetronome metronome={metronome} />
            </View>
          )}
          {ann.canvas}
        </View>
      </View>

      {/* ── Mark Miss / Clean ────────────────────────────────────────
          Phone-landscape: split to the bottom corners (a mis-tap can't
          fire the wrong call) so the score keeps near-full height, with
          just the shortcut line. Everywhere else: a centred bar with two
          big buttons + the auto-climb + shortcut helper copy. */}
      {isPhone && isLandscape ? (
        <>
          <Pressable
            onPress={onMiss}
            hitSlop={6}
            accessibilityLabel="Mark as miss"
            style={[
              styles.cornerBtn,
              styles.missOutlineBtn,
              // Shift BOTH buttons inward by 64 so the ✓ clears the global
              // help "i" button in the bottom-right corner (it sits there
              // when the app isn't installed as a PWA); the ✗ matches it so
              // the pair stays symmetric.
              { bottom: insets.bottom + 4, left: insets.left + 16 + 64 },
            ]}>
            <ThemedText style={styles.missBtnText}>✕  Miss</ThemedText>
          </Pressable>
          <Pressable
            onPress={onClean}
            hitSlop={6}
            accessibilityLabel="Mark as clean"
            style={[
              styles.cornerBtn,
              styles.cleanFilledBtn,
              { bottom: insets.bottom + 4, right: insets.right + 16 + 64 },
            ]}>
            <ThemedText style={styles.cleanBtnText}>✓  Clean</ThemedText>
          </Pressable>
          <ThemedText
            pointerEvents="none"
            style={[styles.runHintLine, { bottom: insets.bottom + 6 }]}>
            Space or foot pedal = Clean · X = Miss
          </ThemedText>
        </>
      ) : (
        <View style={[styles.runBottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.runBtnRow}>
            <Pressable
              onPress={onMiss}
              accessibilityLabel="Mark as miss"
              style={[styles.bottomBtn, styles.missOutlineBtn]}>
              <ThemedText style={styles.missBtnText}>✕  Miss</ThemedText>
            </Pressable>
            <Pressable
              onPress={onClean}
              accessibilityLabel="Mark as clean"
              style={[styles.bottomBtn, styles.cleanBtnWide, styles.cleanFilledBtn]}>
              <ThemedText style={styles.cleanBtnText}>✓  Clean</ThemedText>
            </Pressable>
          </View>
          {progress.mode !== 'custom' && (
            <ThemedText style={styles.runHintAuto}>
              Tempo climbs automatically when you hit {progress.target_reps} clean in a row.
            </ThemedText>
          )}
          {!isPhone && (
            <ThemedText style={styles.runHintShortcut}>
              Space or foot pedal = Clean · X = Miss
            </ThemedText>
          )}
        </View>
      )}

      {/* Tools pill — floats top-right, panels drop below it. Rendered last
          so it paints above the score. Guided keeps just the metronome;
          tools-only shows the metronome inline (above) so the pill drops it. */}
      <PracticeToolsBar
        metronome={metronome}
        metronomeNote={
          isGuided
            ? undefined
            : 'Tempo Ladder controls the tempo — no need to adjust it. Just press play.'
        }
        pencil={
          !isGuided && !toolsOnly
            ? { ...ann.pencil, onUndo: ann.undo }
            : undefined
        }
        recorderPassageId={passage?.id}
        tools={isGuided ? ['metronome'] : toolsOnly ? ['timer'] : undefined}
      />

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

      {/* Phone: practice runs in landscape (the score needs the width). In
          portrait this covers everything with a "rotate" prompt. Tools-only
          mode has no score, so portrait is fine. */}
      <RotateForPractice disabled={toolsOnly} />
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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeCard,
        {
          borderWidth: selected ? Borders.thick : Borders.thin,
          borderColor: selected ? ACCENT : Palette.border,
          borderStyle: dashed ? 'dashed' : 'solid',
          backgroundColor: selected
            ? ACCENT + '14'
            : pressed
              ? Palette.surfaceSunk
              : Palette.card,
        },
      ]}>
      {/* dashed "add" affordance leads with a + icon; saved/built-in cards
          show a check in the corner when selected. */}
      {dashed && (
        <View style={styles.modeCardDashedIcon}>
          <Feather name="plus" size={18} color={Palette.textSecondary} />
        </View>
      )}
      {selected && !dashed && (
        <View style={styles.modeCardCheck}>
          <Feather name="check" size={16} color={ACCENT} />
        </View>
      )}
      <ThemedText
        style={[
          styles.modeCardTitle,
          { color: selected ? ACCENT : Palette.text },
        ]}
        numberOfLines={2}>
        {dashed ? title.replace(/^\+\s*/, '') : title}
      </ThemedText>
      <ThemedText
        style={styles.modeCardSubtitle}
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
              <Feather name="edit-2" size={16} color={Palette.textMuted} />
            </Pressable>
          )}
          {onDelete && (
            <Pressable
              onPress={onDelete}
              hitSlop={8}
              style={styles.modeCardActionBtn}
              accessibilityLabel="Delete pattern">
              <Feather name="trash-2" size={16} color={Palette.textMuted} />
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // ── Big-title header ─────────────────────────────────────────────
  backLink: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  monogram: {
    width: 44,
    height: 44,
    borderRadius: Radii.lg,
    backgroundColor: ACCENT + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: ACCENT,
    letterSpacing: -0.3,
  },
  headerTextCol: { flex: 1, gap: 2 },
  headerSubtitle: {
    color: Palette.textSecondary,
    fontSize: Type.size.sm,
    lineHeight: 18,
  },
  // ── Section headers ──────────────────────────────────────────────
  sectionHeader: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sectionHeaderMeta: {
    color: Palette.textMuted,
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    fontVariant: ['tabular-nums'],
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
  // Sticky bottom CTA — filled green, full-width within the capped column.
  startBtn: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    height: 52,
    borderRadius: Radii.lg,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...Lift,
  },
  startBtnText: {
    color: '#fff',
    fontFamily: Fonts.sans,
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.lg,
  },
  configError: {
    color: Palette.danger,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  divider: { height: 1, marginVertical: Spacing.sm, borderRadius: 1, backgroundColor: Palette.border },
  row: { flexDirection: 'row', gap: Spacing.md },
  rowPhone: { flexDirection: 'column', gap: Spacing.md },
  field: { flex: 1, gap: 6 },
  fieldLabel: {
    color: Palette.textSecondary,
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
  },
  blurbBold: { fontWeight: Type.weight.heavy, color: Palette.text },
  // ── Segmented controls (Climb by / Clean reps) ───────────────────
  segmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
  },
  // minWidth must hold a full single row of three pills (~196px). If two
  // groups can't both fit that side by side (phone), the segmentsRow wraps
  // them to stack full-width — each pillRow then lays its pills out in one
  // clean row instead of the confusing 2-then-1 wrap. Tablet/desktop keep
  // them side by side.
  segmentGroup: { gap: 6, flexGrow: 1, flexBasis: '40%', minWidth: 220 },
  segmentLabel: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.1,
  },
  pillRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  pill: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontWeight: Type.weight.bold,
    fontSize: Type.size.md,
    fontVariant: ['tabular-nums'],
  },
  // ── Helper note ──────────────────────────────────────────────────
  helperNote: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: ACCENT_SOFT,
    borderRadius: Radii.lg,
    padding: Spacing.md,
  },
  helperIcon: { marginTop: 1 },
  helperText: {
    flex: 1,
    color: Palette.text,
    fontSize: Type.size.sm,
    lineHeight: 19,
  },
  previewNote: {
    color: Palette.textSecondary,
    fontSize: Type.size.sm,
    lineHeight: 19,
    marginTop: 6,
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
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 4,
    position: 'relative',
    ...Lift,
  },
  modeCardCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  modeCardDashedIcon: {
    marginBottom: 2,
  },
  modeCardTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
    letterSpacing: -0.1,
  },
  modeCardSubtitle: {
    fontSize: Type.size.xs,
    lineHeight: 16,
    color: Palette.textSecondary,
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
  // ── Custom-mode preview box ──────────────────────────────────────
  customPreviewBox: {
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    gap: 6,
    backgroundColor: Palette.card,
    ...Lift,
  },
  editPatternBtn: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },

  playRoot: { flex: 1, backgroundColor: Palette.paper },

  // ── Reskinned run top bar ────────────────────────────────────────
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
  runGreenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.success,
    marginRight: 7,
  },
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
  runStatBpm: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    fontVariant: ['tabular-nums'],
  },
  runStatUnit: {
    fontSize: 10,
    fontWeight: Type.weight.bold,
    letterSpacing: 0.5,
    color: Palette.textMuted,
    marginLeft: -4,
  },
  runStatDivider: { width: 1, height: 14, backgroundColor: Palette.border },
  runStatDots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  runStatDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  runStatDotEmpty: { borderColor: Palette.textMuted, backgroundColor: 'transparent' },
  runStatDotFilled: { borderColor: Palette.success, backgroundColor: Palette.success },
  runStatCount: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
    color: Palette.textSecondary,
    fontVariant: ['tabular-nums'],
    marginLeft: 2,
  },

  // ── Bottom Miss / Clean ──────────────────────────────────────────
  runBottomBar: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  runBtnRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    ...Lift,
  },
  cleanBtnWide: { minWidth: 200 },
  missOutlineBtn: {
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.danger,
  },
  cleanFilledBtn: { backgroundColor: Palette.success },
  missBtnText: { color: Palette.danger, fontWeight: Type.weight.heavy, fontSize: 17 },
  cleanBtnText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 17 },
  // Phone-landscape: same buttons pinned to the bottom corners.
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
  runHintLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: Type.weight.semibold,
    color: Palette.textMuted,
    zIndex: 4,
  },
  runHintAuto: {
    textAlign: 'center',
    fontSize: 12,
    color: Palette.textMuted,
    marginTop: 2,
  },
  runHintShortcut: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: Type.weight.semibold,
    color: Palette.textSecondary,
  },
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
  dotFilled: { backgroundColor: Palette.success, borderColor: Palette.success },
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
  cleanBtn: { backgroundColor: Palette.success },
  missBtn: { backgroundColor: Palette.danger },
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
  phoneDotFilled: { borderColor: Palette.success, backgroundColor: Palette.success },
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
    ...Lift,
    zIndex: 5,
  },
  phoneMissBtn: { left: 16, backgroundColor: Palette.danger },
  phoneCleanBtn: { right: 16, backgroundColor: Palette.success },
  phoneRepGlyph: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: Type.weight.heavy,
  },
});
