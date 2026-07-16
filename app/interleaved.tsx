import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { FloatingMetronome } from '@/components/FloatingMetronome';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PassagePicker } from '@/components/PassagePicker';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { PracticeToolsBar } from '@/components/PracticeToolsBar';
import { RotateForPractice } from '@/components/RotateForPractice';
import { SelfLedSheet } from '@/components/SelfLedSheet';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { Colors, Fonts } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { Palette, Lift } from '@/constants/palette';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { ZoomableImage } from '@/components/ZoomableImage';
import {
  actionButtonStyle,
  HELP_CLEARANCE,
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';
import { listPassages, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { useMetronome } from '@/lib/audio/useMetronome';
import {
  clearSession as clearTimerSession,
  dismissCelebration as dismissTimerCelebration,
  getSnapshot as getTimerSnapshot,
  nextPassage as advanceTimerPassage,
  setConsistencyActive,
  setEngagedTempo as setTimerEngagedTempo,
  startTimerSession,
  subscribe as subscribeTimerSession,
} from '@/lib/sessions/serialPractice';

export type SessionMode = 'consistency' | 'timer';
export type SessionOrder = 'serial' | 'random';
export type RepTarget = 3 | 5 | 10;
export type TimerMinutes = 3 | 5 | 10 | 15;

const REP_TARGETS: RepTarget[] = [3, 5, 10];
const TIMER_OPTIONS: TimerMinutes[] = [3, 5, 10, 15];

// Timer mode is disabled in the Serial Practice config UI to avoid overlap
// with the global Move-On timer. Code paths remain so it can be flipped back
// on once the UX distinction is resolved.
const TIMER_MODE_ENABLED = false;

// Shared concept blurb. Each phase appends its own "what the buttons on
// THIS screen do" paragraph so the global "?" always matches what's on
// screen.
const REP_ROTATOR_BODY =
  'Rotate through several passages in random order instead of drilling them one at a time. Pick a handful, set how many clean reps you want from each, and the app shuffles between them as you play.\n\n' +
  'Think interleaved practicing, or a mock audition round.\n\n' +
  "Drilling one passage over and over gets it polished. Rotating between several tests whether you're prepared to play it right the first time.";

// Select phase: choosing which passages go in the rotation.
const REP_ROTATOR_SELECT_BODY =
  REP_ROTATOR_BODY +
  '\n\nTap passages to add or remove them from the rotation — pick at least two. For a PDF-backed piece, tap in to choose the page boxes you want. When your set looks right, tap Continue to set up the session, or EXIT to leave.';

// Config phase: setting the rep target before play.
const REP_ROTATOR_CONFIG_BODY =
  REP_ROTATOR_BODY +
  "\n\nChoose how many clean reps in a row each passage needs before it's done — 3, 5, or 10. A miss resets that passage's streak. Tap Start practicing to begin, or BACK to change which passages are in the rotation.";

type Phase = 'config' | 'select' | 'playing';

type SpotState = {
  passage: Passage;
  streak: number;
  justMissed: boolean;
  completed: boolean;
  // Total reps attempted on this passage this session — coach-internal
  // clean-rate signal, never rendered in the practice log.
  totalAttempts?: number;
};

type LapState = {
  order: number[];
  pos: number;
  missed: Set<number>;
};

// Walks forward from `from+1` around the array, returning the first index
// whose predicate passes. Returns -1 if nothing qualifies.
function nextSerialIndex(
  length: number,
  from: number,
  qualifies: (i: number) => boolean,
): number {
  for (let step = 1; step <= length; step++) {
    const i = (from + step) % length;
    if (qualifies(i)) return i;
  }
  return -1;
}

// Lap order: missed-from-previous-lap indices first (in original order),
// then remaining uncompleted indices shuffled. Excludes already-completed.
function buildLapOrder(
  spots: SpotState[],
  missedFromPrevLap: Set<number>,
): number[] {
  const allUncompleted = spots.map((_, i) => i).filter((i) => !spots[i].completed);
  if (allUncompleted.length === 0) return [];
  const missedFront = [...missedFromPrevLap].filter((i) => !spots[i].completed);
  const remaining = allUncompleted.filter((i) => !missedFromPrevLap.has(i));
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  return [...missedFront, ...remaining];
}

function nextRandomLap(
  spots: SpotState[],
  lap: LapState,
  currentIdx: number,
  justMissed: boolean,
): { nextIndex: number; nextLap: LapState } | null {
  const updatedMissed = justMissed ? new Set([...lap.missed, currentIdx]) : lap.missed;
  let nextPos = lap.pos + 1;
  while (nextPos < lap.order.length && spots[lap.order[nextPos]].completed) {
    nextPos++;
  }
  if (nextPos < lap.order.length) {
    return {
      nextIndex: lap.order[nextPos],
      nextLap: { order: lap.order, pos: nextPos, missed: updatedMissed },
    };
  }
  const newOrder = buildLapOrder(spots, updatedMissed);
  if (newOrder.length === 0) return null;
  return {
    nextIndex: newOrder[0],
    nextLap: { order: newOrder, pos: 0, missed: new Set() },
  };
}

function advanceForMode(
  spots: SpotState[],
  current: number,
  order: SessionOrder,
  lap: LapState | null,
  justMissed: boolean,
): { nextIndex: number; nextLap: LapState | null } | null {
  if (order === 'serial') {
    const pick = nextSerialIndex(spots.length, current, (i) => !spots[i].completed);
    if (pick === -1) return null;
    return { nextIndex: pick, nextLap: null };
  }
  if (!lap) return null;
  const result = nextRandomLap(spots, lap, current, justMissed);
  if (!result) return null;
  return { nextIndex: result.nextIndex, nextLap: result.nextLap };
}

export default function InterleavedScreen() {
  // Wrap the screen so a render crash shows a readable message (and stack)
  // instead of the app blanking/closing — Rep Rotator was crashing on device
  // and we need the actual error to fix it.
  return (
    <ErrorBoundary label="Rep Rotator">
      <InterleavedScreenInner />
    </ErrorBoundary>
  );
}

function InterleavedScreenInner() {
  const router = useRouter();
  // Optional deep-link seed: the passage-detail Rep Rotator pill passes
  // the current passage so the picker opens with it pre-selected.
  const { seedPassageId } = useLocalSearchParams<{ seedPassageId?: string }>();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  // Phone density: shorter side under 600 px (catches landscape too).
  // On phone the score gets wrapped in ZoomableImage so the user can
  // pinch in to read notes without leaving practice mode.
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  const isTouch = useIsTouchDevice();
  const isLandscape = vpW > vpH;
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('select');
  const [mode, setMode] = useState<SessionMode>('consistency');
  // Rep Rotator always runs in random order. The Order chips are hidden
  // and the type/state are kept only because the lap logic + practice-log
  // entries still read `order`.
  const [order, setOrder] = useState<SessionOrder>('random');
  const [targetReps, setTargetReps] = useState<RepTarget>(3);
  const [timerMinutes, setTimerMinutes] = useState<TimerMinutes>(5);

  const [passages, setPassages] = useState<Passage[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Active-session state.
  const [spots, setSpots] = useState<SpotState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lap, setLap] = useState<LapState | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const metronome = useMetronome(80);
  // Tracks the BPM the user actually engaged with on each passage — saved
  // into the practice log for that passage so they can recall the tempo
  // they were actually working at.
  const engagedTempoMap = useRef<Map<string, number>>(new Map());

  // Per-passage tempo memory (in-session only): when a passage cycles back
  // through the rotation, the metronome snaps to the BPM last used on it.
  const tempoMap = useRef<Map<string, number>>(new Map());

  // The passage on screen in the playing phase — also drives the score
  // annotation (Apple Pencil tool) for that passage.
  const currentSpot = spots[currentIndex] ?? null;
  const ann = useScoreAnnotation(currentSpot?.passage);

  useEffect(() => {
    let cancelled = false;
    listPassages()
      .then((pcs) => {
        if (!cancelled) setPassages(pcs);
      })
      .catch((err) => {
        console.error('[interleaved] listPassages failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-select the seed passage once the library has loaded. Guarded by a
  // ref so re-renders don't re-add it after the user deselects it.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !seedPassageId || passages.length === 0) return;
    if (!passages.some((p) => p.id === seedPassageId)) return;
    seededRef.current = true;
    setSelectedIds((prev) =>
      prev.includes(seedPassageId) ? prev : [...prev, seedPassageId],
    );
  }, [passages, seedPassageId]);

  // If a Timer-mode session is in flight (e.g., the user navigated to
  // Tempo Ladder and came back), drop straight into the active screen.
  const timerSession = useSyncExternalStore(
    subscribeTimerSession,
    getTimerSnapshot,
    () => null,
  );
  useEffect(() => {
    if (timerSession && phase !== 'playing') {
      setMode(timerSession.mode);
      setOrder(timerSession.order);
      setTimerMinutes(timerSession.timerMinutes);
      setPhase('playing');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerSession?.mode]);

  // While Consistency mode is in its playing phase, register with the
  // serialPractice singleton so PracticeTimersContext suppresses Move On
  // alerts (rep-counting practice has its own end condition; a "rotate
  // now" overlay would compete with that goal).
  useEffect(() => {
    if (phase !== 'playing' || mode !== 'consistency') return;
    setConsistencyActive(true);
    return () => setConsistencyActive(false);
  }, [phase, mode]);

  useEffect(() => {
    if (phase !== 'playing') return;
    if (!metronome.running) return;
    if (mode === 'timer') {
      const cur = timerSession?.spots[timerSession.currentIndex];
      if (cur) setTimerEngagedTempo(cur.passage.id, metronome.bpm);
      return;
    }
    const cur = spots[currentIndex];
    if (!cur) return;
    engagedTempoMap.current.set(cur.passage.id, metronome.bpm);
  }, [phase, mode, currentIndex, spots, timerSession, metronome.bpm, metronome.running]);

  // On rotation, snap the metronome back to this passage's last-used tempo.
  useEffect(() => {
    if (!currentSpot) return;
    const saved = tempoMap.current.get(currentSpot.passage.id);
    if (saved && saved !== metronome.bpm) metronome.setBpm(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  function exit() {
    router.back();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function startPlaying() {
    if (selectedIds.length < 2) return;
    const orderedPassages = selectedIds
      .map((id) => passages.find((p) => p.id === id))
      .filter((p): p is Passage => !!p);
    // Guard against a session with no real passages (e.g. selected ids no
    // longer in the library) — downstream code indexes spots[currentIndex]
    // and would crash on an empty array.
    if (orderedPassages.length < 2) return;

    if (mode === 'timer') {
      // Timer-mode session lives in the module-level singleton so the
      // countdown survives navigation to Tempo Ladder etc.
      startTimerSession({ passages: orderedPassages, order, timerMinutes });
      setPhase('playing');
      return;
    }

    // Consistency mode: keep state local to the component.
    const initial: SpotState[] = orderedPassages.map((passage) => ({
      passage,
      streak: 0,
      justMissed: false,
      completed: false,
      totalAttempts: 0,
    }));
    setSpots(initial);
    engagedTempoMap.current = new Map();
    tempoMap.current = new Map();
    let first = 0;
    let initialLap: LapState | null = null;
    if (order === 'serial') {
      first = 0;
    } else {
      const lapOrder = buildLapOrder(initial, new Set());
      initialLap = { order: lapOrder, pos: 0, missed: new Set() };
      first = lapOrder[0] ?? 0;
    }
    setLap(initialLap);
    setCurrentIndex(first);
    setCelebrating(false);
    setPhase('playing');
  }

  // Remember the tempo set on the current passage so it returns on rotation.
  function saveCurrentTempo() {
    if (currentSpot) tempoMap.current.set(currentSpot.passage.id, metronome.bpm);
  }

  async function onClean() {
    saveCurrentTempo();
    // Persist any unsaved pencil mark before rotating off this passage.
    await ann.flush();
    setSpots((prev) => {
      const next = [...prev];
      const spot = { ...next[currentIndex] };
      spot.streak += 1;
      spot.totalAttempts = (spot.totalAttempts ?? 0) + 1;
      spot.justMissed = false;
      if (spot.streak >= targetReps) spot.completed = true;
      next[currentIndex] = spot;
      const allDone = next.every((s) => s.completed);
      if (allDone) {
        setCelebrating(true);
        return next;
      }
      const result = advanceForMode(next, currentIndex, order, lap, false);
      if (!result) {
        setCelebrating(true);
        return next;
      }
      setLap(result.nextLap);
      setCurrentIndex(result.nextIndex);
      return next;
    });
  }

  async function onMiss() {
    saveCurrentTempo();
    // Persist any unsaved pencil mark before rotating off this passage.
    await ann.flush();
    setSpots((prev) => {
      const next = [...prev];
      const spot = { ...next[currentIndex] };
      spot.streak = 0;
      spot.totalAttempts = (spot.totalAttempts ?? 0) + 1;
      spot.justMissed = true;
      spot.completed = false;
      next[currentIndex] = spot;
      const result = advanceForMode(next, currentIndex, order, lap, true);
      if (!result) {
        setCelebrating(true);
        return next;
      }
      setLap(result.nextLap);
      setCurrentIndex(result.nextIndex);
      return next;
    });
  }

  function endSession() {
    if (spots.length === 0) {
      router.back();
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
    setCelebrating(false);
    for (const spot of spots) {
      try {
        await stampLastUsed(spot.passage.id, 'interleaved');
        const data: Record<string, unknown> = {
          mode,
          order,
          targetReps,
          streak: spot.streak,
          completed: spot.completed,
          totalAttempts: spot.totalAttempts ?? 0,
        };
        const tempo = engagedTempoMap.current.get(spot.passage.id);
        if (tempo != null) data.tempo = tempo;
        if (mood) data.mood = mood;
        if (note) data.note = note;
        if (remindNext) data.remindNext = true;
        // List the OTHER passages in this rotation so the per-passage log can
        // show "with Mozart, Brahms" on a session entry. Filter on passage ID
        // (not title) so two passages sharing a title aren't both dropped.
        const others = spots
          .filter((s) => s.passage.id !== spot.passage.id)
          .map((s) => s.passage.title);
        if (others.length > 0) data.sessionPassages = others;
        await logPractice(spot.passage.id, 'interleaved', data);
      } catch {
        // ignore — keep navigation flowing
      }
    }
    metronome.stop();
    router.back();
  }

  // ── Config phase ─────────────────────────────────────────────────────────
  if (phase === 'config') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={() => setPhase('select')}
          // Navigation back to the picker, not ending a session — so it reads
          // "‹ Back" like every other navigation bar, not all-caps EXIT.
          exitLabel="‹ Back"
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Rep Rotator
            </ThemedText>
          }
        />
        <ScrollView contentContainerStyle={styles.configContent}>
          <ThemedText type="title" style={{ textAlign: 'center' }}>
            Configure your session
          </ThemedText>

          {TIMER_MODE_ENABLED && (
            <>
              <ThemedText style={styles.sectionLabel}>Practice mode</ThemedText>
              <View style={styles.row}>
                <Chip
                  label="Consistency"
                  subtitle="Number of correct reps in a row"
                  selected={mode === 'consistency'}
                  onPress={() => setMode('consistency')}
                />
                <Chip
                  label="Timer"
                  subtitle="Move on after x minutes"
                  selected={mode === 'timer'}
                  onPress={() => setMode('timer')}
                />
              </View>
            </>
          )}

          <ThemedText style={[styles.helper, { color: C.icon }]}>
            Passages will appear in random order.
          </ThemedText>

          {mode === 'consistency' ? (
            <>
              <ThemedText style={[styles.helper, { color: C.icon }]}>
                Each passage appears in your chosen order, then loops. Tap{' '}
                <ThemedText style={styles.helperBold}>Clean ✓</ThemedText> if it
                was accurate, <ThemedText style={styles.helperBold}>Miss ✗</ThemedText>{' '}
                if not. A miss resets that passage&apos;s streak.
              </ThemedText>
              <ThemedText style={styles.sectionLabel}>
                Clean reps to complete each passage
              </ThemedText>
              <View style={styles.numericRow}>
                {REP_TARGETS.map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setTargetReps(n)}
                    style={[
                      styles.numericChip,
                      {
                        borderColor: C.icon,
                        backgroundColor: targetReps === n ? C.tint : 'transparent',
                      },
                    ]}>
                    <ThemedText
                      style={[
                        styles.numericChipLabel,
                        { color: targetReps === n ? '#fff' : C.text },
                      ]}>
                      {n}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <>
              <ThemedText style={[styles.helper, { color: C.icon }]}>
                Spend a fixed amount of time on each passage, then move on. Use any
                practice strategy (Tempo Ladder, Interleaved Click-Up, Rhythmic
                Variation) while the timer runs — tap the strategy buttons to launch
                them.
              </ThemedText>
              <ThemedText style={styles.sectionLabel}>Minutes per passage</ThemedText>
              <View style={styles.numericRow}>
                {TIMER_OPTIONS.map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setTimerMinutes(n)}
                    style={[
                      styles.numericChip,
                      {
                        borderColor: C.icon,
                        backgroundColor: timerMinutes === n ? C.tint : 'transparent',
                      },
                    ]}>
                    <ThemedText
                      style={[
                        styles.numericChipLabel,
                        { color: timerMinutes === n ? '#fff' : C.text },
                      ]}>
                      {n}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          <Button
            label={`Start practicing with ${selectedIds.length} passages →`}
            onPress={startPlaying}
            style={actionButtonStyle}
          />
        </View>
        <TutorialStep
          id="rep-rotator-setup"
          visible={false}
          title="Rep Rotator"
          body={REP_ROTATOR_CONFIG_BODY}
        />
      </ThemedView>
    );
  }

  // ── Select phase ─────────────────────────────────────────────────────────
  if (phase === 'select') {
    const minSel = 2;
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />

        <PassagePicker
          selectedIds={selectedIds}
          passages={passages}
          onToggle={toggleSelect}
          onSetSelected={setSelectedIds}
          onStart={() => setPhase('config')}
          onExit={exit}
          minToStart={minSel}
        />

        <TutorialStep
          id="rep-rotator-first-run"
          visible={true}
          title="Rep Rotator"
          body={REP_ROTATOR_SELECT_BODY}
        />
      </ThemedView>
    );
  }

  // ── Playing phase ────────────────────────────────────────────────────────
  const completedCount = spots.filter((s) => s.completed).length;

  if (mode === 'timer') {
    return (
      <TimerActive
        timerSession={timerSession}
        metronome={metronome}
        order={order}
        timerMinutes={timerMinutes}
        onBackToSelect={() => {
          clearTimerSession();
          setPhase('select');
        }}
        onSessionFinished={() => router.back()}
      />
    );
  }

  // Consistency mode active screen.
  return (
    <View style={styles.playRoot}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Keyboard / foot-pedal shortcuts: right pedal / Space = ✓ Clean,
          left pedal / X = ✗ Miss. Suppressed while celebration / log prompt
          is open so a stray press can't fire a rep behind the modal. */}
      <PedalCatcher
        active={!notePromptVisible && !celebrating}
        onAdvance={onClean}
        onBack={onMiss}
        secondaryKey="x"
        onSecondary={onMiss}
      />

      {/* ── Reskinned run top bar (all devices) — Exit (left) · title +
          live "BPM · streak dots · count" pill (centre). The tools pill
          floats top-right (rendered last, below). Mirrors Tempo Ladder. */}
      <View style={[styles.runTopBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.runSide}>
          <Pressable
            onPress={async () => {
              await ann.flush();
              endSession();
            }}
            hitSlop={8}
            style={styles.runExit}>
            <Feather name="log-out" size={15} color={Palette.danger} />
            <ThemedText style={styles.runExitText}>Exit</ThemedText>
          </Pressable>
        </View>
        <View style={styles.runCenter}>
          {/* Strategy + passage title — desktop / iPad only. Dropped on phone
              to save a line (practice runs in landscape, vertical space tight). */}
          {!isPhone && (
            <View style={styles.runTitleRow}>
              <View style={styles.runStratDot} />
              <ThemedText style={styles.runTitleText} numberOfLines={1}>
                Rep Rotator
              </ThemedText>
              {!!currentSpot?.passage.title && (
                <ThemedText style={styles.runTitleMeta} numberOfLines={1}>
                  {'  ·  '}
                  {currentSpot.passage.title}
                </ThemedText>
              )}
            </View>
          )}
          <View style={styles.runStatPill}>
            <ThemedText style={styles.runStatBpm}>{metronome.bpm}</ThemedText>
            <ThemedText style={styles.runStatUnit}>BPM</ThemedText>
            <View style={styles.runStatDivider} />
            <View style={styles.runStatDots}>
              {Array.from({ length: targetReps }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.runStatDot,
                    i < (currentSpot?.streak ?? 0)
                      ? styles.runStatDotFilled
                      : styles.runStatDotEmpty,
                  ]}
                />
              ))}
            </View>
            <ThemedText style={styles.runStatCount}>
              {completedCount}/{spots.length}
            </ThemedText>
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
          {currentSpot?.passage.source_uri &&
            (isTouch ? (
              <ZoomableImage
                uri={currentSpot.passage.source_uri}
                style={styles.scoreContain}
                // Remember the zoom + pan per passage so cycling between
                // rotated passages doesn't carry over the previous zoom.
                persistKey={currentSpot.passage.id}
              />
            ) : (
              <Image
                source={{ uri: currentSpot.passage.source_uri }}
                style={styles.scoreContain}
                contentFit="contain"
              />
            ))}
          {ann.canvas}
        </View>
      </View>

      {/* ── Mark Miss / Clean ────────────────────────────────────────
          Phone-landscape: split to the bottom corners (a mis-tap can't
          fire the wrong call). Everywhere else: a centred bar with two
          big buttons + shortcut helper copy. Mirrors Tempo Ladder. */}
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
              // help "i" button in the bottom-right corner; the ✗ matches it.
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
          <ThemedText style={styles.runHintAuto}>
            Clean a passage {targetReps}× in a row to retire it — the app rotates you on every mark.
          </ThemedText>
          {!isPhone && (
            <ThemedText style={styles.runHintShortcut}>
              Space or foot pedal = Clean · X = Miss
            </ThemedText>
          )}
        </View>
      )}

      {/* Tools pill — floats top-right, panels drop below it. Rendered last
          so it paints above the score. */}
      <PracticeToolsBar
        metronome={metronome}
        pencil={{ ...ann.pencil, onUndo: ann.undo }}
        recorderPassageId={currentSpot?.passage.id}
      />

      <PracticeLogNotePrompt
        metronome={metronome}
        visible={celebrating || notePromptVisible}
        emoji={celebrating ? '🎉' : undefined}
        title={
          celebrating
            ? `Cleaned all ${spots.length} passages!`
            : 'How did that go?'
        }
        subtitle={
          mode === 'consistency'
            ? `Serial Practice · ${order === 'serial' ? 'serial' : 'interleaved'}`
            : undefined
        }
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note, remindNext }) => finishLog(mood, note, remindNext)}
        onSkip={() => finishLog(null, null)}
      />

      <TutorialStep
        id="serial-practice-play"
        visible={false}
        title="Running a Rep Rotator session"
        body={
          "The score on screen is the passage you're currently drilling. Play it, mark the rep, and the app rotates you to the next passage.\n\n" +
          "✓ Clean — counts the rep; once a passage hits its clean-rep target it's done and drops out of the rotation.\n\n" +
          "✗ Miss — logs the miss and resets that passage's streak; you stay on it.\n\n" +
          "Keyboard / pedal: Space = Clean ✓, X = Miss ✗.\n\n" +
          "Exit (top-left) finishes the session and saves it to your practice log.\n\n" +
          PRACTICE_TOOLS_HELP
        }
      />
      {/* Phone: practice runs in landscape. Portrait → "rotate" prompt. */}
      <RotateForPractice />
    </View>
  );
}

function TimerActive({
  timerSession,
  metronome,
  order,
  timerMinutes,
  onBackToSelect,
  onSessionFinished,
}: {
  timerSession: ReturnType<typeof getTimerSnapshot>;
  metronome: ReturnType<typeof useMetronome>;
  order: SessionOrder;
  timerMinutes: TimerMinutes;
  onBackToSelect: () => void;
  onSessionFinished: () => void;
}) {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  const isTouch = useIsTouchDevice();
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const [selfLedOpen, setSelfLedOpen] = useState(false);

  if (!timerSession) {
    // Edge case: state was cleared. Drop the user back to select.
    return null;
  }

  const cur = timerSession.spots[timerSession.currentIndex];
  const totalSec = timerSession.secondsLeft;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const allDone = timerSession.celebrating;

  function endSession() {
    if (timerSession?.spots.length === 0) {
      clearTimerSession();
      router.back();
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
    dismissTimerCelebration();
    const snap = getTimerSnapshot();
    if (snap) {
      for (const spot of snap.spots) {
        try {
          await stampLastUsed(spot.passage.id, 'interleaved');
          const data: Record<string, unknown> = {
            mode: 'timer',
            order: snap.order,
            timerMinutes: snap.timerMinutes,
            visited: spot.visited,
          };
          const tempo = snap.engagedTempoByPassage[spot.passage.id];
          if (tempo != null) data.tempo = tempo;
          if (mood) data.mood = mood;
          if (note) data.note = note;
          if (remindNext) data.remindNext = true;
          // List the OTHER passages in this rotation (filter on ID so a
          // shared title doesn't drop both) for the per-passage log.
          const others = snap.spots
            .filter((s) => s.passage.id !== spot.passage.id)
            .map((s) => s.passage.title);
          if (others.length > 0) data.sessionPassages = others;
          await logPractice(spot.passage.id, 'interleaved', data);
        } catch {
          // ignore — keep navigation flowing
        }
      }
    }
    clearTimerSession();
    metronome.stop();
    onSessionFinished();
  }

  function launchStrategy(path: 'tempo-ladder' | 'click-up' | 'rhythmic') {
    if (!cur) return;
    if (path === 'rhythmic') {
      router.push({
        pathname: '/passage/[id]/rhythmic',
        params: { id: cur.passage.id },
      });
      return;
    }
    if (path === 'tempo-ladder') {
      router.push({
        pathname: '/passage/[id]/tempo-ladder',
        params: { id: cur.passage.id },
      });
      return;
    }
    router.push({
      pathname: '/passage/[id]/click-up',
      params: { id: cur.passage.id },
    });
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={onBackToSelect}
        exitLabel="EXIT"
        center={
          <View style={{ alignItems: 'center', maxWidth: '100%' }}>
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              {cur?.passage.title ?? 'Passage'}
            </ThemedText>
            <ThemedText style={styles.topSubCenter}>
              Passage {timerSession.visitedCount} of {timerSession.spots.length}
            </ThemedText>
          </View>
        }
        right={
          <View style={styles.topRightRow}>
            <Button label="END" variant="danger" size="sm" onPress={endSession} />
          </View>
        }
      />

      <View style={styles.strategyRow}>
        <Pressable
          onPress={() => launchStrategy('tempo-ladder')}
          style={[styles.strategyBtn, { backgroundColor: Palette.success }]}>
          <ThemedText style={styles.strategyText}>Tempo Ladder</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => launchStrategy('click-up')}
          style={[styles.strategyBtn, { backgroundColor: C.tint }]}>
          <ThemedText style={styles.strategyText}>Interleaved Click-Up</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => launchStrategy('rhythmic')}
          style={[styles.strategyBtn, { backgroundColor: '#4a235a' }]}>
          <ThemedText style={styles.strategyText}>Rhythmic Variation</ThemedText>
        </Pressable>
        {/* Self-Led launcher hidden for now (unused), matching the passage
            detail screen. SelfLedSheet stays mounted so it's a 1-line restore. */}
      </View>

      {cur?.passage.source_uri &&
        (isTouch ? (
          <ZoomableImage
            uri={cur.passage.source_uri}
            style={styles.scoreFill}
            persistKey={cur.passage.id}
          />
        ) : (
          <Image
            source={{ uri: cur.passage.source_uri }}
            style={styles.scoreFill}
            contentFit="contain"
          />
        ))}

      <SelfLedSheet
        visible={selfLedOpen}
        onCancel={() => setSelfLedOpen(false)}
        onPick={(key) => {
          setSelfLedOpen(false);
          if (!cur) return;
          // Recording is no longer a self-led strategy — covered by
          // the Recorder practice tool — so every key routes to the
          // generic /self-led/[key] page.
          router.push({
            pathname: '/passage/[id]/self-led/[key]',
            params: { id: cur.passage.id, key },
          });
        }}
      />

      <FloatingMetronome
        bpm={metronome.bpm}
        subdivision={metronome.subdivision}
        running={metronome.running}
        volume={metronome.volume}
        onBpm={metronome.setBpm}
        onSubdivision={metronome.setSubdivision}
        onVolume={metronome.setVolume}
        onToggle={metronome.toggle}
        initialX={16}
        initialY={140}
      />

      <View
        style={[
          styles.timerBar,
          {
            backgroundColor: timerSession.timerExpired ? Palette.danger : C.tint,
          },
        ]}>
        <ThemedText style={styles.timerLabel}>
          {timerSession.timerExpired
            ? "Time's up · "
            : `${timeLabel} · `}
          {cur?.passage.title ?? ''}
        </ThemedText>
        <Pressable
          onPress={advanceTimerPassage}
          style={styles.nextBtn}>
          <ThemedText style={styles.nextBtnText}>
            {timerSession.visitedCount >= timerSession.spots.length
              ? 'Finish session →'
              : 'Next Serial passage →'}
          </ThemedText>
        </Pressable>
      </View>

      <PracticeLogNotePrompt
        metronome={metronome}
        visible={allDone || notePromptVisible}
        emoji={allDone ? '🎉' : undefined}
        title={
          allDone
            ? `Worked through all ${timerSession.spots.length} passages!`
            : 'How did that go?'
        }
        subtitle={`Serial Practice · timer · ${order === 'serial' ? 'serial' : 'interleaved'} · ${timerMinutes} min`}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note, remindNext }) => finishLog(mood, note, remindNext)}
        onSkip={() => finishLog(null, null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  topSubCenter: {
    fontSize: Type.size.xs,
    opacity: Opacity.muted,
    marginTop: 2,
  },
  contentArea: { flex: 1 },
  scoreFill: { flex: 1, width: '100%' },
  scoreContain: { flex: 1, width: '100%' },

  // ── Reskinned run screen (mirrors Tempo Ladder's run layout) ─────────────
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
  // Strategy-identity dot — Rep Rotator's orange (distinct from the green
  // "clean" streak dots in the pill below).
  runStratDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C9772E',
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

  strategyRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  strategyBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    alignItems: 'center',
  },
  strategyText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
  selfLedStratBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    alignItems: 'center',
    borderWidth: Borders.thick,
    backgroundColor: 'transparent',
  },
  selfLedStratText: {
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
  topRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },

  timerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.lg,
    // Extra right padding so the Next button clears the floating Feedback
    // bubble (position absolute, bottom 20, right 20, ~140px wide).
    paddingRight: 160,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  timerLabel: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.lg,
    flex: 1,
  },
  nextBtn: {
    backgroundColor: '#ffffff22',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
    borderColor: '#fff',
  },
  nextBtnText: {
    color: '#fff',
    fontWeight: Type.weight.bold,
    fontSize: Type.size.sm,
  },

  configContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing['2xl'],
  },
  // Footer action bar on the select + config phases. Extra right padding
  // keeps the full-width button clear of the global floating "?" help
  // button (fixed bottom-right, ~60px) so they don't overlap or blend.
  bottomBar: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: HELP_CLEARANCE,
  },
  sectionLabel: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    opacity: Opacity.muted,
    marginTop: Spacing.sm,
  },
  row: { flexDirection: 'row', gap: Spacing.md },
  helper: {
    fontSize: Type.size.sm,
    lineHeight: 20,
    marginVertical: Spacing.sm,
  },
  helperBold: { fontWeight: Type.weight.bold, opacity: 1 },
  numericRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  numericChip: {
    width: 64,
    height: 56,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numericChipLabel: {
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
  },


  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  body2: {
    textAlign: 'center',
    fontSize: Type.size.md,
    lineHeight: 20,
    maxWidth: 480,
  },
});
