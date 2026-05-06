import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { FloatingMetronome } from '@/components/FloatingMetronome';
import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { SelfLedSheet } from '@/components/SelfLedSheet';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listAllFolders, type Folder } from '@/lib/db/repos/folders';
import { listPassages, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { useMetronome } from '@/lib/audio/useMetronome';
import {
  clearSession as clearTimerSession,
  dismissCelebration as dismissTimerCelebration,
  getSnapshot as getTimerSnapshot,
  nextPassage as advanceTimerPassage,
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

type Phase = 'config' | 'select' | 'playing';

type Section = {
  title: string;
  folderId: string | null;
  data: Passage[];
};

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
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [phase, setPhase] = useState<Phase>('config');
  const [mode, setMode] = useState<SessionMode>('consistency');
  const [order, setOrder] = useState<SessionOrder>('serial');
  const [targetReps, setTargetReps] = useState<RepTarget>(3);
  const [timerMinutes, setTimerMinutes] = useState<TimerMinutes>(5);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [search, setSearch] = useState('');
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllFolders(), listPassages()]).then(([flds, pcs]) => {
      if (cancelled) return;
      setFolders(flds);
      setPassages(pcs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  function exit() {
    router.back();
  }

  function onContinue() {
    setPhase('select');
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

  function onClean() {
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

  function onMiss() {
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

  async function finishLog(mood: string | null, note: string | null) {
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
        await logPractice(spot.passage.id, 'interleaved', data);
      } catch {
        // ignore — keep navigation flowing
      }
    }
    metronome.stop();
    router.back();
  }

  // Build sections grouped by folder, filtered by search.
  const sections: Section[] = (() => {
    const q = search.trim().toLowerCase();
    const visible = q
      ? passages.filter((p) => (p.title ?? '').toLowerCase().includes(q))
      : passages;
    const byFolder = new Map<string | null, Passage[]>();
    for (const p of visible) {
      const key = p.folder_id ?? null;
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(p);
    }
    const folderOrder = new Map<string | null, number>();
    folders.forEach((f, idx) => folderOrder.set(f.id, idx));
    folderOrder.set(null, folders.length);
    const keys = Array.from(byFolder.keys()).sort(
      (a, b) => (folderOrder.get(a) ?? 9999) - (folderOrder.get(b) ?? 9999),
    );
    return keys.map((k) => ({
      folderId: k,
      title:
        k === null
          ? 'Unfiled'
          : folders.find((f) => f.id === k)?.name ?? 'Folder',
      data: byFolder.get(k) ?? [],
    }));
  })();

  // ── Config phase ─────────────────────────────────────────────────────────
  if (phase === 'config') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={exit}
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Serial Practice
            </ThemedText>
          }
        />
        <ScrollView contentContainerStyle={styles.configContent}>
          <ThemedText type="title" style={{ textAlign: 'center' }}>
            Configure your session
          </ThemedText>

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

          <ThemedText style={styles.sectionLabel}>Order</ThemedText>
          <View style={styles.row}>
            <Chip
              label="Serial"
              subtitle="Rotate in same order"
              selected={order === 'serial'}
              onPress={() => setOrder('serial')}
            />
            <Chip
              label="Interleaved"
              subtitle="Rotate in random order"
              selected={order === 'random'}
              onPress={() => setOrder('random')}
            />
          </View>

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

        <View style={{ padding: 20 }}>
          <Button label="Continue →" onPress={onContinue} fullWidth />
        </View>
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
          onExit={() => setPhase('config')}
          exitLabel="EXIT"
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Select passages
            </ThemedText>
          }
        />

        <ThemedText style={[styles.selectHelp, { color: C.icon }]}>
          {mode === 'consistency'
            ? 'Choose 4–7 passages to practice in the order you want to play them.'
            : 'Choose 4–7 passages to practice.'}
        </ThemedText>

        <View style={[styles.searchWrap, { borderColor: C.icon + '55' }]}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search passages"
            placeholderTextColor={C.icon}
            style={[styles.searchInput, { color: C.text }]}
          />
        </View>

        <ScrollView contentContainerStyle={styles.selectList}>
          {sections.map((section) => (
            <View key={section.folderId ?? 'unfiled'} style={{ marginBottom: 8 }}>
              <View style={styles.folderHeader}>
                <ThemedText style={styles.folderHeaderText}>
                  📁 {section.title}
                </ThemedText>
              </View>
              {section.data.map((passage) => {
                const orderIndex = selectedIds.indexOf(passage.id);
                const isSelected = orderIndex >= 0;
                return (
                  <Pressable
                    key={passage.id}
                    onPress={() => toggleSelect(passage.id)}
                    style={[
                      styles.passageRow,
                      {
                        borderColor: isSelected ? C.tint : C.icon + '55',
                        backgroundColor: isSelected ? C.tint + '11' : 'transparent',
                      },
                    ]}>
                    {passage.thumbnail_uri ? (
                      <Image
                        source={{ uri: passage.thumbnail_uri }}
                        style={styles.passageThumb}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.passageThumb,
                          { backgroundColor: C.icon + '22' },
                        ]}
                      />
                    )}
                    <ThemedText style={[styles.passageTitle, { flex: 1 }]} numberOfLines={1}>
                      {passage.title || 'Untitled'}
                    </ThemedText>
                    <View
                      style={[
                        styles.indicator,
                        {
                          borderColor: isSelected ? C.tint : C.icon,
                          backgroundColor: isSelected ? C.tint : 'transparent',
                        },
                      ]}>
                      {isSelected && (
                        <ThemedText style={styles.indicatorText}>
                          {order === 'serial' ? String(orderIndex + 1) : '✓'}
                        </ThemedText>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={{ padding: 16 }}>
          <Button
            label={
              canStart
                ? `Start practicing with ${selectedIds.length} passages →`
                : `Pick at least ${minSel} passages`
            }
            onPress={startPlaying}
            disabled={!canStart}
            fullWidth
          />
        </View>
      </ThemedView>
    );
  }

  // ── Playing phase ────────────────────────────────────────────────────────
  const currentSpot = spots[currentIndex] ?? null;
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
      <SessionTopBar
        onExit={() => setPhase('select')}
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
            <PracticeTimersPill />
            <Button
              label="END"
              variant="danger"
              size="sm"
              onPress={endSession}
            />
          </View>
        }
      />

      {currentSpot?.passage.source_uri && (
        <Image
          source={{ uri: currentSpot.passage.source_uri }}
          style={styles.scoreFill}
          contentFit="contain"
        />
      )}

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
        Your tempo is saved for each passage.
      </ThemedText>

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
        onSubmit={({ mood, note }) => finishLog(mood, note)}
        onSkip={() => finishLog(null, null)}
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

  async function finishLog(mood: string | null, note: string | null) {
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
            <PracticeTimersPill hideMoveOn />
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

      {cur?.passage.source_uri && (
        <Image
          source={{ uri: cur.passage.source_uri }}
          style={styles.scoreFill}
          contentFit="contain"
        />
      )}

      <SelfLedSheet
        visible={selfLedOpen}
        onCancel={() => setSelfLedOpen(false)}
        onPick={(key) => {
          setSelfLedOpen(false);
          if (!cur) return;
          if (key === 'recording') {
            router.push({
              pathname: '/passage/[id]/self-led/recording',
              params: { id: cur.passage.id },
            });
          } else {
            router.push({
              pathname: '/passage/[id]/self-led/[key]',
              params: { id: cur.passage.id, key },
            });
          }
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
        onSubmit={({ mood, note }) => finishLog(mood, note)}
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
  scoreFill: { flex: 1, width: '100%' },
  repBar: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingLeft: Spacing.lg,
    // Extra right clearance so the Miss button is not partially under the
    // floating Feedback bubble.
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

  selectHelp: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  searchWrap: {
    margin: Spacing.lg,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
  },
  searchInput: {
    paddingVertical: Spacing.md,
    fontSize: Type.size.md,
  },
  selectList: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg },
  folderHeader: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  folderHeaderText: {
    fontWeight: Type.weight.bold,
    fontSize: Type.size.sm,
  },
  passageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    marginBottom: 6,
  },
  passageThumb: {
    width: 48,
    height: 32,
    borderRadius: Radii.sm,
  },
  passageTitle: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
  },
  indicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
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
