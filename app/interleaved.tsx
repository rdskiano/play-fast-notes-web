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
import { PassagePicker } from '@/components/PassagePicker';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { SelfLedSheet } from '@/components/SelfLedSheet';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Status, Type } from '@/constants/tokens';
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
  // Landscape phone: drop the floating ✗ / ✓ buttons onto the help-button
  // line (✓ shifted left of the help button) instead of floating them high
  // on a short screen. Portrait keeps the lifted spacing.
  const repBottomLift = isPhone && isLandscape ? 16 : HELP_CLEARANCE;
  const cleanRightExtra = isPhone && isLandscape ? 60 : 0;

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
    listPassages().then((pcs) => {
      if (!cancelled) setPassages(pcs);
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
          exitLabel="BACK"
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
    const canStart = selectedIds.length >= minSel;
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={exit}
          exitLabel="EXIT"
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Pick passages to rotate through
            </ThemedText>
          }
        />

        <PassagePicker
          selectedIds={selectedIds}
          passages={passages}
          order={order}
          onToggle={toggleSelect}
        />

        <View style={styles.bottomBar}>
          <Button
            label={
              canStart
                ? `Continue with ${selectedIds.length} passages →`
                : `Pick at least ${minSel} passages`
            }
            onPress={() => setPhase('config')}
            disabled={!canStart}
            style={actionButtonStyle}
          />
        </View>
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
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Keyboard shortcuts: Space (or any pedal key) = ✓ Clean,
          X = ✗ Miss. Suppressed while celebration / log prompt is
          open so a stray Space can't fire a rep behind the modal. */}
      <PedalCatcher
        active={!notePromptVisible && !celebrating}
        onAdvance={onClean}
        secondaryKey="x"
        onSecondary={onMiss}
      />
      {/* Phone hides the SessionTopBar (replaced by a floating dots
          pill + ✕ button) and the bottom repBar (replaced by floating
          ✗ / ✓ circles), to give the score the full screen the way
          Tempo Ladder does. */}
      {!isPhone && (
        <SessionTopBar
          onExit={async () => {
            await ann.flush();
            setPhase('select');
          }}
          exitLabel="EXIT"
          center={
            <View style={{ alignItems: 'center', maxWidth: '100%' }}>
              <ThemedText style={styles.topCenter} numberOfLines={1}>
                {currentSpot?.passage.title ?? 'Passage'}
              </ThemedText>
              <ThemedText style={styles.topSubCenter}>
                {completedCount}/{spots.length} complete
              </ThemedText>
              <View style={styles.streakDots}>
                {Array.from({ length: targetReps }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i < (currentSpot?.streak ?? 0)
                        ? styles.dotFilled
                        : { borderColor: C.icon },
                    ]}
                  />
                ))}
              </View>
            </View>
          }
          right={
            <View style={styles.topRightRow}>
              <Button
                label="END"
                variant="danger"
                size="sm"
                onPress={endSession}
              />
            </View>
          }
        />
      )}

      <View
        style={[
          styles.contentArea,
          // Reserve a band under the score so the floating ✗ / ✓ circles
          // don't overlap the music. Portrait reserves the full lifted band;
          // landscape is short, so reserve almost nothing and let the buttons
          // float over the lower corners (matches the Tempo Ladder pattern).
          isPhone &&
            (isLandscape
              ? { paddingBottom: insets.bottom + 8 }
              : { paddingBottom: insets.bottom + HELP_CLEARANCE + 36 }),
        ]}>
        {currentSpot?.passage.source_uri ? (
          <View
            style={[
              styles.scoreFill,
              // Laptop: pad the score frame so the music (and its pencil
              // overlay) is inset from the screen edges — clearing the
              // edge-docked tool tabs on the sides and giving top/bottom
              // breathing room. The image lives in an inner flex child
              // (styles.scoreInner) because an absolutely-filled image
              // ignores this padding on web. The tool layer is a sibling,
              // so its tabs stay at the true screen edge. Phone keeps its
              // full-bleed pannable zoom.
              !isPhone && {
                paddingHorizontal: SCORE_SIDE_BUFFER,
                paddingVertical: SCORE_VERT_BUFFER,
                backgroundColor: SCORE_FRAME_BG,
              },
            ]}>
            <View style={styles.scoreInner}>
              {isTouch ? (
                <ZoomableImage
                  uri={currentSpot.passage.source_uri}
                  style={StyleSheet.absoluteFill}
                  // Remember the zoom + pan per passage so cycling
                  // between rotated passages doesn't carry over the
                  // previous passage's zoom.
                  persistKey={currentSpot.passage.id}
                />
              ) : (
                <Image
                  source={{ uri: currentSpot.passage.source_uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                />
              )}
              {ann.canvas}
            </View>
          </View>
        ) : null}
        <PracticeToolsLayer
          metronome={metronome}
          pencil={ann.pencil}
          recorderPassageId={currentSpot?.passage.id}
        />

        {/* Phone overlays — float over the score so the practice
            controls don't steal vertical space. */}
        {isPhone && (
          <>
            <View
              pointerEvents="none"
              style={[styles.phoneDotsWrap, { top: insets.top + 10 }]}>
              <View style={styles.phoneDotsPill}>
                <View style={styles.phoneDotsRow}>
                  {Array.from({ length: targetReps }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.phoneDot,
                        i < (currentSpot?.streak ?? 0)
                          ? styles.phoneDotFilled
                          : styles.phoneDotEmpty,
                      ]}
                    />
                  ))}
                </View>
                <ThemedText style={styles.phoneDotsCount}>
                  {completedCount}/{spots.length}
                </ThemedText>
              </View>
            </View>

            <Pressable
              onPress={endSession}
              hitSlop={6}
              accessibilityLabel="End session"
              style={[styles.phoneEndBtn, { top: insets.top + 8, left: insets.left + 8 }]}>
              <ThemedText style={styles.phoneEndGlyph}>✕</ThemedText>
            </Pressable>

            <Pressable
              onPress={onMiss}
              hitSlop={6}
              accessibilityLabel="Mark as miss"
              style={[
                styles.phoneRepBtn,
                styles.phoneMissBtn,
                // Portrait lifts to clear the help button; landscape drops to
                // the help line. `insets.left` clears the landscape notch.
                // `cleanRightExtra` mirrors the inward shift applied to the ✓
                // button so the pair sits symmetrically (B-009).
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

      {!isPhone && (
        <>
          <View style={[styles.repBar, { borderTopColor: C.icon + '44' }]}>
            <Pressable
              onPress={onClean}
              style={[styles.repBtn, styles.cleanBtn]}>
              <ThemedText style={styles.repText}>Clean ✓</ThemedText>
            </Pressable>
            <Pressable
              onPress={onMiss}
              style={[styles.repBtn, styles.missBtn]}>
              <ThemedText style={styles.repText}>Miss ✗</ThemedText>
            </Pressable>
          </View>

          <ThemedText style={[styles.tempoHint, { color: C.icon }]}>
            Your tempo is saved for each passage. Space = Clean ✓ · X = Miss ✗
          </ThemedText>
        </>
      )}

      <PracticeLogNotePrompt
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
          "END (top-right) finishes the session and saves it to your practice log. On a wide screen, EXIT (top-left) leaves without logging and returns to your passage list.\n\n" +
          PRACTICE_TOOLS_HELP
        }
      />
    </ThemedView>
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
          style={[styles.strategyBtn, { backgroundColor: '#2ecc71' }]}>
          <ThemedText style={styles.strategyText}>Tempo Ladder</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => launchStrategy('click-up')}
          style={[styles.strategyBtn, { backgroundColor: '#154360' }]}>
          <ThemedText style={styles.strategyText}>Interleaved Click-Up</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => launchStrategy('rhythmic')}
          style={[styles.strategyBtn, { backgroundColor: '#4a235a' }]}>
          <ThemedText style={styles.strategyText}>Rhythmic Variation</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setSelfLedOpen(true)}
          style={[styles.selfLedStratBtn, { borderColor: C.tint }]}>
          <ThemedText style={[styles.selfLedStratText, { color: C.tint }]}>
            Self-Led ▾
          </ThemedText>
        </Pressable>
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
            backgroundColor: timerSession.timerExpired ? '#c0392b' : C.tint,
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
  streakDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: Status.success, borderColor: Status.success },
  contentArea: { flex: 1 },
  scoreFill: { flex: 1, width: '100%' },
  // Inner frame that actually holds the score image + pencil overlay. A normal
  // flex child so the parent's padding (the laptop buffer) insets it; the
  // absoluteFill image then fills this inset frame.
  scoreInner: { flex: 1, width: '100%', position: 'relative' },
  repBar: {
    flexDirection: 'row',
    gap: Spacing.md,
    // The 160 right clearance keeps the Miss button out from under the
    // floating help bubble in the bottom-right corner. Mirror it on the left
    // so the Clean / Miss pair stays centered instead of shifted left (B-009).
    paddingLeft: 160,
    paddingRight: 160,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderTopWidth: Borders.thin,
  },
  repBtn: {
    flex: 1,
    paddingVertical: Spacing.lg,
    borderRadius: Radii.lg,
    alignItems: 'center',
  },
  cleanBtn: { backgroundColor: Status.success },
  missBtn: { backgroundColor: '#e74c3c' },
  repText: { color: '#fff', fontWeight: Type.weight.black, fontSize: Type.size.xl },
  tempoHint: {
    textAlign: 'center',
    fontSize: 12,
    paddingBottom: Spacing.md,
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

  // Phone overlays. Same vocabulary as the Tempo Ladder phone layout so
  // the two practice screens feel consistent. Z-indexed above the score
  // but below modals.
  phoneDotsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  phoneDotsPill: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#000000aa',
  },
  phoneDotsRow: { flexDirection: 'row', gap: 8 },
  phoneDotsCount: {
    color: '#ffffffcc',
    fontSize: 11,
    fontWeight: Type.weight.bold,
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
    position: 'absolute',
    left: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  phoneEndGlyph: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 20,
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
