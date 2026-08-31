import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PassagePicker } from '@/components/PassagePicker';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import { PracticeToolsBar } from '@/components/PracticeToolsBar';
import { RotateForPractice } from '@/components/RotateForPractice';
import { ScorePeekModal } from '@/components/ScorePeekModal';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { ZoomableImage } from '@/components/ZoomableImage';
import { PRACTICE_TOOLS_HELP, SHORTCUT_HINT_LINE } from '@/constants/helpCopy';
import { inheritedGoalForPassage } from '@/lib/coach/evaluation';
import { Colors, Fonts } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { Palette, Lift } from '@/constants/palette';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { usePracticeClock } from '@/hooks/usePracticeClock';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import {
  actionButtonStyle,
  HELP_CLEARANCE,
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';
import { useMetronome } from '@/lib/audio/useMetronome';
import { listExercisesForPassage } from '@/lib/db/repos/exercises';
import { listPassages, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { getTempoLadderProgressForPassages } from '@/lib/db/repos/tempoLadder';
import {
  ICU2_ROUNDS,
  icu2ClimbTempos,
  icu2DefaultStart,
  icu2EstimatedMinutes,
  icu2TotalReps,
} from '@/lib/strategies/clickUp2';

// The strategy-identity color: a deeper shade of Interleaved Click-Up's
// petrol — same family (both are Gebrian clicking-up methods), clearly darker.
const ICU2_COLOR = '#085D79';

const ICU2_BODY =
  'Interleaved Click-Up 2 trains something regular Click-Up does not: playing a passage clean at tempo on the FIRST try, like you have to in rehearsal.\n\n' +
  'Pick 3 to 5 fast passages (7 to 10 if they are short, like single lines of a hard page). The app rotates you through them in seven rounds: climbing by 5s, then 10s, then 20s, then 30s, then just a few landmark tempos, and finally each passage once, cold, at tempo.\n\n' +
  'While you play the other passages you forget each one a little, so every return is a harder test. By the last round, first-try-at-tempo is exactly what you have been rehearsing.';

const ICU2_SELECT_BODY =
  ICU2_BODY +
  '\n\nTap passages to add or remove them (pick at least two). When your set looks right, tap Set tempos to review each passage’s start and goal tempo before you play.';

type Phase = 'select' | 'tempos' | 'playing' | 'done';

type Icu2Item = {
  passage: Passage;
  start: number;
  // null = no goal known yet; the user must set one before starting.
  goal: number | null;
  source: 'Tempo Ladder' | 'Click-Up' | 'saved goal' | 'this section' | null;
  // A mid-session "Save this tempo" caps the passage for the day: later
  // rounds climb to the ceiling instead of the goal.
  ceiling: number | null;
  // Top tempo actually reached (set when a climb tops out or a ceiling is
  // saved). Stays null for passages the session never finished.
  reached: number | null;
};

export default function Icu2Screen() {
  usePracticeClock();
  return (
    <ErrorBoundary label="Interleaved Click-Up 2">
      <Icu2ScreenInner />
    </ErrorBoundary>
  );
}

function Icu2ScreenInner() {
  const router = useRouter();
  const { seedPassageId } = useLocalSearchParams<{ seedPassageId?: string }>();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  const isTouch = useIsTouchDevice();
  const isLandscape = vpW > vpH;
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('select');
  const [passages, setPassages] = useState<Passage[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [items, setItems] = useState<Icu2Item[]>([]);
  // Momentary look at one passage's source page while setting its tempos.
  const [peekPassage, setPeekPassage] = useState<Passage | null>(null);

  // Session position.
  const [roundIdx, setRoundIdx] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);
  const [tempoIdx, setTempoIdx] = useState(0);
  const [interstitial, setInterstitial] = useState(false);
  const [missOpen, setMissOpen] = useState(false);
  const [slowerOpen, setSlowerOpen] = useState(false);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const repsRef = useRef(0);

  const metronome = useMetronome(80);
  const microbreak = useMicrobreakTimer();

  const cur = phase === 'playing' ? (items[itemIdx] ?? null) : null;
  const ann = useScoreAnnotation(cur?.passage);

  const round = ICU2_ROUNDS[roundIdx];
  const tempos = useMemo(() => {
    if (!cur || cur.goal == null) return [];
    return icu2ClimbTempos(cur.start, cur.ceiling ?? cur.goal, round);
  }, [cur, round]);

  useEffect(() => {
    let cancelled = false;
    listPassages()
      .then((pcs) => {
        if (!cancelled) setPassages(pcs);
      })
      .catch((err) => {
        console.error('[icu2] listPassages failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-select the seed passage (the passage-detail pill) once loaded.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !seedPassageId || passages.length === 0) return;
    if (!passages.some((p) => p.id === seedPassageId)) return;
    seededRef.current = true;
    setSelectedIds((prev) =>
      prev.includes(seedPassageId) ? prev : [...prev, seedPassageId],
    );
  }, [passages, seedPassageId]);

  // Keep the metronome dialed to the current rep's tempo. Starting/stopping
  // the click stays under the user's control in the tools pill.
  useEffect(() => {
    if (phase !== 'playing') return;
    const t = tempos[tempoIdx];
    if (t && t !== metronome.bpm) metronome.setBpm(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tempos, tempoIdx]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // ── select → tempos: build rows, keep edits, prefill goals ───────────────
  async function goToTempos() {
    const chosen = selectedIds
      .map((id) => passages.find((p) => p.id === id))
      .filter((p): p is Passage => !!p);
    if (chosen.length < 2) return;

    // Keep rows the user already edited; append rows for newly-added ids.
    const prevById = new Map(items.map((it) => [it.passage.id, it]));
    const nextItems: Icu2Item[] = chosen.map(
      (passage) =>
        prevById.get(passage.id) ?? {
          passage,
          start: 60,
          goal: null,
          source: null,
          ceiling: null,
          reached: null,
        },
    );
    setItems(nextItems);
    setPhase('tempos');

    // Prefill goals for fresh rows, in priority order: Tempo Ladder's goal,
    // a saved Click-Up config's goal, the piece's own shared performance
    // tempo, then the most recent decided tempo in the passage's section.
    // Never overwrites a goal already set.
    const needIds = nextItems.filter((it) => it.goal == null).map((it) => it.passage.id);
    if (needIds.length === 0) return;
    const found = new Map<string, { goal: number; source: Icu2Item['source'] }>();
    try {
      const ladder = await getTempoLadderProgressForPassages(needIds);
      for (const row of ladder) {
        if (row.goal_tempo > 0) {
          found.set(row.piece_id, { goal: row.goal_tempo, source: 'Tempo Ladder' });
        }
      }
    } catch {
      // prefill is best-effort
    }
    for (const id of needIds) {
      if (found.has(id)) continue;
      try {
        const exercises = await listExercisesForPassage(id);
        const cu = exercises.find((e) => e.strategy === 'click_up' && e.config_json);
        if (cu?.config_json) {
          const cfg = JSON.parse(cu.config_json) as { goalTempo?: number };
          if (typeof cfg.goalTempo === 'number' && cfg.goalTempo > 0) {
            found.set(id, { goal: cfg.goalTempo, source: 'Click-Up' });
          }
        }
      } catch {
        // prefill is best-effort
      }
    }
    // 3. The piece's own shared performance tempo — set by evaluate's
    //    "Lock in" or any strategy start — for passages that never ran a
    //    ladder or click-up.
    for (const it of nextItems) {
      if (it.goal != null || found.has(it.passage.id)) continue;
      const pt = it.passage.performance_tempo;
      if (typeof pt === 'number' && pt > 0) {
        found.set(it.passage.id, { goal: pt, source: 'saved goal' });
      }
    }
    // 4. The most recent decided tempo among same-section neighbors.
    for (const it of nextItems) {
      if (it.goal != null || found.has(it.passage.id)) continue;
      try {
        const inherited = await inheritedGoalForPassage(it.passage);
        if (inherited) {
          found.set(it.passage.id, { goal: inherited.bpm, source: 'this section' });
        }
      } catch {
        // prefill is best-effort
      }
    }
    if (found.size === 0) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.goal != null) return it;
        const hit = found.get(it.passage.id);
        if (!hit) return it;
        return { ...it, goal: hit.goal, start: icu2DefaultStart(hit.goal), source: hit.source };
      }),
    );
  }

  function bumpTempo(id: string, key: 'start' | 'goal', delta: number) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.passage.id !== id) return it;
        if (key === 'goal') {
          // First tap on an empty goal seeds a sane default to adjust from.
          const base = it.goal ?? 120;
          const goal = Math.max(it.start + 5, base + (it.goal == null ? 0 : delta));
          const start = it.goal == null ? icu2DefaultStart(goal) : it.start;
          return { ...it, goal, start };
        }
        const cap = (it.goal ?? 300) - 5;
        const start = Math.min(Math.max(30, it.start + delta), cap);
        return { ...it, start };
      }),
    );
  }

  function startPlaying() {
    if (items.length < 2 || items.some((it) => it.goal == null)) return;
    setItems((prev) => prev.map((it) => ({ ...it, ceiling: null, reached: null })));
    repsRef.current = 0;
    setRoundIdx(0);
    setItemIdx(0);
    setTempoIdx(0);
    setInterstitial(true);
    setPhase('playing');
  }

  // ── session advance ──────────────────────────────────────────────────────
  function topOutCurrent() {
    const top = tempos[tempos.length - 1];
    setItems((prev) =>
      prev.map((it, i) => (i === itemIdx ? { ...it, reached: Math.max(it.reached ?? 0, top) } : it)),
    );
  }

  function nextSlot() {
    // The Micro cadence counts reps ON THIS PASSAGE — switching to the next
    // passage (or round) starts the count over (Ralph's call 2026-08-30).
    repsRef.current = 0;
    if (itemIdx < items.length - 1) {
      setItemIdx(itemIdx + 1);
      setTempoIdx(0);
      return;
    }
    if (roundIdx < ICU2_ROUNDS.length - 1) {
      setRoundIdx(roundIdx + 1);
      setItemIdx(0);
      setTempoIdx(0);
      setInterstitial(true);
      return;
    }
    metronome.stop();
    setPhase('done');
  }

  async function onNext() {
    if (!cur) return;
    repsRef.current += 1;
    // Micro break every N clean reps (✓ Next presses) on the current
    // passage — cadence from the Timer tool's Micro settings; nextSlot()
    // zeroes the count on every passage/round switch. trigger() self-gates
    // on the Micro timer being enabled, and the break's auto-pause
    // snapshots a running click and resumes it after — no explicit
    // metronome.stop() here.
    const everyN = microbreak.config.icu2Reps || 3;
    if (repsRef.current % everyN === 0) microbreak.trigger();
    await ann.flush();
    if (tempoIdx < tempos.length - 1) {
      setTempoIdx(tempoIdx + 1);
      return;
    }
    topOutCurrent();
    nextSlot();
  }

  function onMissPressed() {
    setMissOpen(true);
  }

  function missStartOver() {
    setMissOpen(false);
    setTempoIdx(0);
  }

  function missStartSlower(delta: number) {
    setSlowerOpen(false);
    setItems((prev) =>
      prev.map((it, i) =>
        i === itemIdx ? { ...it, start: Math.max(30, it.start - delta) } : it,
      ),
    );
    setTempoIdx(0);
  }

  function missSaveTempo() {
    setMissOpen(false);
    const lastClean = tempoIdx > 0 ? tempos[tempoIdx - 1] : (cur?.start ?? 30);
    setItems((prev) =>
      prev.map((it, i) =>
        i === itemIdx ? { ...it, ceiling: lastClean, reached: lastClean } : it,
      ),
    );
    nextSlot();
  }

  function exitSession() {
    metronome.stop();
    setPhase('done');
  }

  async function finishLog(mood: string | null, note: string | null) {
    setNotePromptVisible(false);
    const played = items.filter((it) => it.reached != null && it.goal != null);
    for (const it of played) {
      try {
        const data: Record<string, unknown> = {
          goal: it.goal,
          start: it.start,
          reached: it.reached,
          atTempo: (it.reached ?? 0) >= (it.goal ?? Infinity),
        };
        if (mood) data.mood = mood;
        if (note) data.note = note;
        const others = items
          .filter((s) => s.passage.id !== it.passage.id)
          .map((s) => s.passage.title);
        if (others.length > 0) data.sessionPassages = others;
        await logPractice(it.passage.id, 'icu2', data);
      } catch {
        // ignore — keep navigation flowing
      }
    }
    metronome.stop();
    router.back();
  }

  // ── Select phase ─────────────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <PassagePicker
          selectedIds={selectedIds}
          passages={passages}
          onToggle={toggleSelect}
          onSetSelected={setSelectedIds}
          onStart={goToTempos}
          onExit={() => router.back()}
          minToStart={2}
          startLabel="Set tempos →"
          pinnedPassageId={seedPassageId}
        />
        <TutorialStep
          id="icu2-first-run"
          visible={true}
          title="Interleaved Click-Up 2 · beta"
          body={ICU2_SELECT_BODY}
        />
      </ThemedView>
    );
  }

  // ── Tempos phase ─────────────────────────────────────────────────────────
  if (phase === 'tempos') {
    const ready = items.length >= 2 && items.every((it) => it.goal != null);
    const pairs = items
      .filter((it): it is Icu2Item & { goal: number } => it.goal != null)
      .map((it) => ({ start: it.start, goal: it.goal }));
    const total = icu2TotalReps(pairs);
    const mins = icu2EstimatedMinutes(total);
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={() => setPhase('select')}
          exitLabel="‹ Back"
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Interleaved Click-Up 2
            </ThemedText>
          }
        />
        <ScrollView contentContainerStyle={styles.temposContent}>
          <ThemedText style={[styles.helper, { color: C.icon }]}>
            Each passage climbs from its start tempo to its goal. Goals are
            pre-filled from your saved goal tempos and past practice when we
            have them. Adjust anything before you start.
          </ThemedText>
          {items.map((it) => (
            <View key={it.passage.id} style={styles.tempoRow}>
              <View style={styles.tempoRowHead}>
                <ThemedText style={styles.tempoRowTitle} numberOfLines={1}>
                  {it.passage.title}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.tempoRowTag,
                    { color: it.source ? Palette.textMuted : Palette.danger },
                  ]}>
                  {it.source ? `from ${it.source}` : it.goal == null ? 'set a goal tempo' : 'manual'}
                </ThemedText>
                <Button
                  label="View score"
                  icon="eye"
                  variant="outline"
                  size="xs"
                  onPress={() => setPeekPassage(it.passage)}
                />
              </View>
              <View style={styles.tempoRowSteppers}>
                <TempoStepper
                  label="Start"
                  value={it.goal == null ? null : it.start}
                  onBump={(d) => bumpTempo(it.passage.id, 'start', d)}
                />
                <TempoStepper
                  label="Goal"
                  value={it.goal}
                  onBump={(d) => bumpTempo(it.passage.id, 'goal', d)}
                />
              </View>
            </View>
          ))}
          <View style={styles.roundsCard}>
            <ThemedText style={styles.roundsCardTitle}>The seven rounds</ThemedText>
            {ICU2_ROUNDS.map((r) => (
              <ThemedText key={r.label} style={styles.roundsCardLine}>
                {r.label}
              </ThemedText>
            ))}
          </View>
        </ScrollView>
        <View style={styles.bottomBar}>
          <ThemedText style={styles.summaryLine}>
            {ready
              ? `${items.length} passages · 7 rounds · about ${total} reps · roughly ${mins} min`
              : items.length < 2
                ? 'Pick at least two passages.'
                : 'A passage still needs a goal tempo.'}
          </ThemedText>
          <Button
            label="Start session"
            onPress={startPlaying}
            disabled={!ready}
            style={actionButtonStyle}
          />
        </View>

        <ScorePeekModal
          visible={peekPassage != null}
          passage={peekPassage}
          onClose={() => setPeekPassage(null)}
        />
      </ThemedView>
    );
  }

  // ── Done phase ───────────────────────────────────────────────────────────
  if (phase === 'done') {
    const played = items.filter((it) => it.reached != null);
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={() => (played.length === 0 ? router.back() : setNotePromptVisible(true))}
          exitLabel={played.length === 0 ? '‹ Back' : 'EXIT'}
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Session complete
            </ThemedText>
          }
        />
        <ScrollView contentContainerStyle={styles.temposContent}>
          <ThemedText style={[styles.helper, { color: C.icon }]}>
            {played.length === 0
              ? 'Nothing played yet, so nothing will be logged.'
              : 'Goal vs. what you actually reached. A saved tempo is where that passage topped out today; watch it climb across sessions.'}
          </ThemedText>
          {items.map((it) => {
            const atTempo = it.reached != null && it.goal != null && it.reached >= it.goal;
            return (
              <View key={it.passage.id} style={styles.resultRow}>
                <ThemedText style={styles.tempoRowTitle} numberOfLines={1}>
                  {it.passage.title}
                </ThemedText>
                <ThemedText style={styles.resultGoal}>
                  {it.goal != null ? `♩ ${it.goal}` : '—'}
                </ThemedText>
                <View
                  style={[
                    styles.resultChip,
                    atTempo
                      ? styles.resultChipGood
                      : it.reached != null
                        ? styles.resultChipCeil
                        : styles.resultChipSkip,
                  ]}>
                  <ThemedText
                    style={[
                      styles.resultChipText,
                      atTempo
                        ? { color: Palette.success }
                        : it.reached != null
                          ? { color: Palette.danger }
                          : { color: Palette.textMuted },
                    ]}>
                    {atTempo
                      ? '✓ at tempo'
                      : it.reached != null
                        ? `saved at ${it.reached}`
                        : 'not played'}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </ScrollView>
        {played.length > 0 && (
          <View style={styles.bottomBar}>
            <Button
              label="Save & finish"
              onPress={() => setNotePromptVisible(true)}
              style={actionButtonStyle}
            />
          </View>
        )}
        <PracticeLogNotePrompt
          metronome={metronome}
          strategy="icu2"
          visible={notePromptVisible}
          title="How did that go?"
          subtitle="Interleaved Click-Up 2"
          submitLabel="Save & finish"
          cancelLabel="Skip"
          onSubmit={({ mood, note }) => finishLog(mood, note)}
          onSkip={() => finishLog(null, null)}
        />
      </ThemedView>
    );
  }

  // ── Playing phase ────────────────────────────────────────────────────────
  const missBlocked = interstitial || missOpen || slowerOpen;
  const lastClean = tempoIdx > 0 ? tempos[tempoIdx - 1] : null;
  return (
    <View style={styles.playRoot}>
      <Stack.Screen options={{ headerShown: false }} />
      <PedalCatcher active={!missBlocked} onAdvance={onNext} secondaryKey="x" onSecondary={onMissPressed} />

      <View style={[styles.runTopBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.runSide}>
          <Pressable onPress={exitSession} hitSlop={8} style={styles.runExit}>
            <Feather name="log-out" size={15} color={Palette.danger} />
            <ThemedText style={styles.runExitText}>Exit</ThemedText>
          </Pressable>
        </View>
        <View style={styles.runCenter}>
          {!isPhone && (
            <View style={styles.runTitleRow}>
              <View style={styles.runStratDot} />
              <ThemedText style={styles.runTitleText} numberOfLines={1}>
                Click-Up 2
              </ThemedText>
              {!!cur?.passage.title && (
                <ThemedText style={styles.runTitleMeta} numberOfLines={1}>
                  {'  ·  '}
                  {cur.passage.title}
                </ThemedText>
              )}
            </View>
          )}
          <View style={styles.runStatPill}>
            <ThemedText style={styles.runStatBpm}>{tempos[tempoIdx] ?? metronome.bpm}</ThemedText>
            <ThemedText style={styles.runStatUnit}>BPM</ThemedText>
            <View style={styles.runStatDivider} />
            <View style={styles.runStatDots}>
              {tempos.map((t, i) => (
                <View
                  key={`${t}-${i}`}
                  style={[
                    styles.climbDot,
                    i < tempoIdx
                      ? styles.climbDotDone
                      : i === tempoIdx
                        ? styles.climbDotNow
                        : styles.climbDotTodo,
                  ]}
                />
              ))}
            </View>
            <View style={styles.runStatDivider} />
            <ThemedText style={styles.runStatCount}>
              {itemIdx + 1}/{items.length}
            </ThemedText>
          </View>
          <ThemedText style={styles.roundLine} numberOfLines={1}>
            {round.label}
            {cur?.ceiling != null ? `  ·  ceiling ${cur.ceiling}` : ''}
          </ThemedText>
        </View>
        <View style={styles.runSide} />
      </View>

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
          {cur?.passage.source_uri &&
            (isTouch ? (
              <ZoomableImage
                uri={cur.passage.source_uri}
                style={styles.scoreContain}
                persistKey={cur.passage.id}
              />
            ) : (
              <Image
                source={{ uri: cur.passage.source_uri }}
                style={styles.scoreContain}
                contentFit="contain"
              />
            ))}
          {ann.canvas}
        </View>
      </View>

      {isPhone && isLandscape ? (
        <>
          <Pressable
            onPress={onMissPressed}
            hitSlop={6}
            accessibilityLabel="Mark as miss"
            style={[
              styles.cornerBtn,
              styles.missOutlineBtn,
              { bottom: insets.bottom + 4, left: insets.left + 16 + 64 },
            ]}>
            <ThemedText style={styles.missBtnText}>✕  Miss</ThemedText>
          </Pressable>
          <Pressable
            onPress={onNext}
            hitSlop={6}
            accessibilityLabel="Next tempo"
            style={[
              styles.cornerBtn,
              styles.cleanFilledBtn,
              { bottom: insets.bottom + 4, right: insets.right + 16 + 64 },
            ]}>
            <ThemedText style={styles.cleanBtnText}>✓  Next</ThemedText>
          </Pressable>
          <ThemedText
            pointerEvents="none"
            style={[styles.runHintLine, { bottom: insets.bottom + 6 }]}>
            {SHORTCUT_HINT_LINE}
          </ThemedText>
        </>
      ) : (
        <View style={[styles.runBottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.runBtnRow}>
            <Pressable
              onPress={onMissPressed}
              accessibilityLabel="Mark as miss"
              style={[styles.bottomBtn, styles.missOutlineBtn]}>
              <ThemedText style={styles.missBtnText}>✕  Miss</ThemedText>
            </Pressable>
            <Pressable
              onPress={onNext}
              accessibilityLabel="Next tempo"
              style={[styles.bottomBtn, styles.cleanBtnWide, styles.cleanFilledBtn]}>
              <ThemedText style={styles.cleanBtnText}>✓  Next</ThemedText>
            </Pressable>
          </View>
          <ThemedText style={styles.runHintAuto}>
            Play it clean, then tap ✓ Next. The metronome climbs for you and rotates you between passages.
          </ThemedText>
          {!isPhone && (
            <ThemedText style={styles.runHintShortcut}>{SHORTCUT_HINT_LINE}</ThemedText>
          )}
        </View>
      )}

      <PracticeToolsBar
        metronome={metronome}
        pencil={{ ...ann.pencil, onUndo: ann.undo }}
        recorderPassageId={cur?.passage.id}
      />

      {/* Between-rounds card. Plain absolute overlay (not Modal) so web taps
          behave — see the RN-Web Modal pointer-events gotcha. */}
      {interstitial && (
        <View style={styles.interstitialWrap}>
          <View style={styles.interstitialCard}>
            <ThemedText style={styles.interstitialTitle}>
              {round.label.split('·')[0].trim()}
            </ThemedText>
            <ThemedText style={styles.interstitialBody}>{round.intro}</ThemedText>
            <Button label="Continue" onPress={() => setInterstitial(false)} />
          </View>
        </View>
      )}

      <ActionSheet
        visible={missOpen}
        title={`Missed at ♩ = ${tempos[tempoIdx] ?? ''} · start too fast?`}
        items={[
          { label: 'Start this climb over', primary: true, onPress: missStartOver },
          {
            label: 'Start slower…',
            onPress: () => {
              setMissOpen(false);
              setSlowerOpen(true);
            },
          },
          {
            label: lastClean != null ? `Save ${lastClean} & move on` : 'Save start tempo & move on',
            onPress: missSaveTempo,
          },
        ]}
        cancelLabel="Keep going"
        onCancel={() => setMissOpen(false)}
      />
      <ActionSheet
        visible={slowerOpen}
        title="Lower this passage's start tempo"
        items={[
          { label: '−5', onPress: () => missStartSlower(5) },
          { label: '−10', onPress: () => missStartSlower(10) },
          { label: '−20', onPress: () => missStartSlower(20) },
        ]}
        cancelLabel="Cancel"
        onCancel={() => setSlowerOpen(false)}
      />

      <TutorialStep
        id="icu2-play"
        visible={false}
        title="Running Interleaved Click-Up 2"
        body={
          'The metronome is set to the tempo you should play at, and the dots in the pill show where you are in this climb.\n\n' +
          '✓ Next: you played it clean. The tempo climbs, and at the top of a climb you rotate to the next passage.\n\n' +
          '✗ Miss: choose to start the climb over, lower this passage’s start tempo, or save the last clean tempo as today’s ceiling and move on.\n\n' +
          'Keyboard / pedal: Space = Next ✓, X = Miss ✗.\n\n' +
          PRACTICE_TOOLS_HELP
        }
      />
      <RotateForPractice />
    </View>
  );
}

function TempoStepper({
  label,
  value,
  onBump,
}: {
  label: string;
  value: number | null;
  onBump: (delta: number) => void;
}) {
  return (
    <View style={styles.stepperGroup}>
      <ThemedText style={styles.stepperLabel}>{label}</ThemedText>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => onBump(-5)}
          hitSlop={6}
          accessibilityLabel={`${label} tempo down`}
          style={styles.stepperBtn}>
          <ThemedText style={styles.stepperBtnText}>−</ThemedText>
        </Pressable>
        <ThemedText style={[styles.stepperValue, value == null && styles.stepperValueEmpty]}>
          {value == null ? '—' : String(value)}
        </ThemedText>
        <Pressable
          onPress={() => onBump(5)}
          hitSlop={6}
          accessibilityLabel={`${label} tempo up`}
          style={styles.stepperBtn}>
          <ThemedText style={styles.stepperBtnText}>+</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  contentArea: { flex: 1 },
  scoreContain: { flex: 1, width: '100%' },

  // ── run screen (mirrors Rep Rotator / Tempo Ladder) ──────────────────────
  playRoot: { flex: 1, backgroundColor: Palette.paper },
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
  runStratDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ICU2_COLOR,
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
  runStatDots: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    flexShrink: 1,
    flexWrap: 'wrap',
    maxWidth: 170,
  },
  climbDot: { width: 7, height: 7, borderRadius: 4 },
  climbDotDone: { backgroundColor: ICU2_COLOR },
  climbDotNow: {
    backgroundColor: Palette.text,
    transform: [{ scale: 1.35 }],
  },
  climbDotTodo: { backgroundColor: Palette.border },
  runStatCount: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
    color: Palette.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  roundLine: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    color: Palette.textMuted,
  },
  runBottomBar: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: 6,
    zIndex: 56,
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
  cornerBtn: {
    position: 'absolute',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    ...Lift,
    zIndex: 56,
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

  // ── tempos + done phases ─────────────────────────────────────────────────
  temposContent: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: Spacing['2xl'],
  },
  helper: {
    fontSize: Type.size.sm,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  tempoRow: {
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  tempoRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tempoRowTitle: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
    flexShrink: 1,
  },
  tempoRowTag: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
  },
  tempoRowSteppers: { flexDirection: 'row', gap: Spacing.xl },
  stepperGroup: { gap: 4, flex: 1 },
  stepperLabel: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    opacity: Opacity.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: Radii.sm,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    backgroundColor: Palette.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 18, fontWeight: Type.weight.bold },
  stepperValue: {
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    minWidth: 48,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepperValueEmpty: { color: Palette.danger },
  roundsCard: {
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: 4,
    marginTop: Spacing.xs,
  },
  roundsCardTitle: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.bold,
    marginBottom: 2,
  },
  roundsCardLine: {
    fontSize: Type.size.sm,
    color: Palette.textSecondary,
  },
  bottomBar: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: HELP_CLEARANCE,
    gap: Spacing.sm,
  },
  summaryLine: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    color: Palette.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  resultGoal: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    color: Palette.textSecondary,
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto',
  },
  resultChip: {
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: Borders.thin,
  },
  resultChipGood: {
    backgroundColor: 'transparent',
    borderColor: Palette.success,
  },
  resultChipCeil: {
    backgroundColor: 'transparent',
    borderColor: Palette.danger,
  },
  resultChipSkip: {
    backgroundColor: 'transparent',
    borderColor: Palette.border,
  },
  resultChipText: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
    fontVariant: ['tabular-nums'],
  },

  // ── interstitial ─────────────────────────────────────────────────────────
  interstitialWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(30, 28, 24, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    zIndex: 60,
  },
  interstitialCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
    ...Lift,
  },
  interstitialTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
  },
  interstitialBody: {
    fontSize: Type.size.md,
    lineHeight: 21,
    textAlign: 'center',
    color: Palette.textSecondary,
  },
});
