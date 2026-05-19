import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';

import type { Passage } from '@/lib/db/repos/passages';

export type RepTarget = 3 | 5 | 10;
export const REP_TARGETS: RepTarget[] = [3, 5, 10];

export type TimerMinutes = 3 | 5 | 10 | 15;
export const TIMER_OPTIONS: TimerMinutes[] = [3, 5, 10, 15];

export type SessionMode = 'consistency' | 'timer';
export type SessionOrder = 'random' | 'serial';

export type SpotState = {
  passage: Passage;
  streak: number;
  justMissed: boolean;
  completed: boolean;
};

export type InterleavedPhase = 'select' | 'config' | 'playing';

// Lap state for consistency + random order: every uncompleted spot gets
// exactly one rep per lap (full shuffle), and missed spots are front-loaded
// at the start of the next lap so they come back early without violating
// the once-per-lap property.
export type LapState = {
  order: number[];
  pos: number;
  missed: Set<number>;
};

// Module-level store so session state survives screen remounts
// (e.g., when navigating to a strategy and back via dismissAll + push).
let _activeSession: {
  phase: InterleavedPhase;
  mode: SessionMode;
  order: SessionOrder;
  spots: SpotState[];
  currentIndex: number;
  targetReps: RepTarget;
  timerMinutes: TimerMinutes;
  celebrating: boolean;
  visitedCount: number;
  visitedIndices: Set<number>;
  lap: LapState | null;
} | null = null;

export function clearActiveSession() {
  if (_activeSession) {
    _activeSession.phase = 'config';
    _activeSession.spots = [];
    _activeSession.currentIndex = 0;
    _activeSession.celebrating = false;
    _activeSession.visitedCount = 0;
    _activeSession.visitedIndices = new Set();
    _activeSession.lap = null;
  }
}

export function getActiveSession() {
  return _activeSession;
}

export function advanceActiveSession() {
  if (!_activeSession || _activeSession.phase !== 'playing') return;
  if (_activeSession.mode === 'timer') {
    _activeSession.visitedIndices.add(_activeSession.currentIndex);
    const next = _activeSession.visitedIndices.size;
    _activeSession.visitedCount = next;
    if (next >= _activeSession.spots.length) {
      _activeSession.celebrating = true;
      return;
    }
    const pick =
      _activeSession.order === 'serial'
        ? nextSerialIndex(
            _activeSession.spots.length,
            _activeSession.currentIndex,
            (i) => !_activeSession!.visitedIndices.has(i),
          )
        : pickRandomUnvisited(
            _activeSession.spots,
            _activeSession.visitedIndices,
          );
    if (pick === -1) {
      _activeSession.celebrating = true;
      return;
    }
    _activeSession.currentIndex = pick;
  }
}

function pickRandomUnvisited(
  spots: SpotState[],
  visited: Set<number>,
): number {
  const unvisited = spots.map((_, i) => i).filter((i) => !visited.has(i));
  if (unvisited.length === 0) return -1;
  return unvisited[Math.floor(Math.random() * unvisited.length)];
}

/**
 * Walks forward from `from+1` around the array, returning the first index
 * whose predicate passes. Returns -1 if nothing qualifies.
 */
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

/**
 * Build a fresh lap order: missed-from-previous-lap indices first (in order),
 * then the remaining uncompleted indices in random order. Already-completed
 * spots are excluded entirely.
 */
function buildLapOrder(
  spots: SpotState[],
  missedFromPrevLap: Set<number>,
): number[] {
  const allUncompleted = spots
    .map((_, i) => i)
    .filter((i) => !spots[i].completed);
  if (allUncompleted.length === 0) return [];

  const missedFront = [...missedFromPrevLap].filter((i) => !spots[i].completed);
  const remaining = allUncompleted.filter((i) => !missedFromPrevLap.has(i));

  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }

  return [...missedFront, ...remaining];
}

/**
 * Advance lap state after the current rep. `justMissed` adds the current
 * index to the missed-set for next-lap front-loading. Returns null when no
 * uncompleted spots remain (caller should celebrate).
 */
function nextRandomLap(
  spots: SpotState[],
  lap: LapState,
  currentIdx: number,
  justMissed: boolean,
): { nextIndex: number; nextLap: LapState } | null {
  const updatedMissed = justMissed
    ? new Set([...lap.missed, currentIdx])
    : lap.missed;

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

/**
 * Mode-aware "what's the next index?" wrapper. Returns null when the session
 * is finished. For random order it threads lap state; for serial it just
 * walks the array, skipping completed spots.
 */
function advanceForMode(
  spots: SpotState[],
  current: number,
  order: SessionOrder,
  lap: LapState | null,
  justMissed: boolean,
): { nextIndex: number; nextLap: LapState | null } | null {
  if (order === 'serial') {
    const pick = nextSerialIndex(
      spots.length,
      current,
      (i) => !spots[i].completed,
    );
    if (pick === -1) return null;
    return { nextIndex: pick, nextLap: null };
  }
  if (!lap) return null;
  const result = nextRandomLap(spots, lap, current, justMissed);
  if (!result) return null;
  return { nextIndex: result.nextIndex, nextLap: result.nextLap };
}

export function useInterleavedSession() {
  const [phase, setPhase] = useState<InterleavedPhase>(
    _activeSession?.phase ?? 'config',
  );
  const [mode, setMode] = useState<SessionMode>(
    _activeSession?.mode ?? 'consistency',
  );
  const [order, setOrder] = useState<SessionOrder>(
    _activeSession?.order ?? 'random',
  );
  const [spots, setSpots] = useState<SpotState[]>(_activeSession?.spots ?? []);
  const [currentIndex, setCurrentIndex] = useState(
    _activeSession?.currentIndex ?? 0,
  );
  const [targetReps, setTargetReps] = useState<RepTarget>(
    _activeSession?.targetReps ?? 5,
  );
  const [timerMinutes, setTimerMinutes] = useState<TimerMinutes>(
    _activeSession?.timerMinutes ?? 5,
  );
  const [celebrating, setCelebrating] = useState(
    _activeSession?.celebrating ?? false,
  );
  const [visitedCount, setVisitedCount] = useState(
    _activeSession?.visitedCount ?? 0,
  );
  const [lap, setLap] = useState<LapState | null>(_activeSession?.lap ?? null);

  // Sync to module-level store on every state change
  useEffect(() => {
    if (_activeSession) {
      _activeSession.phase = phase;
      _activeSession.mode = mode;
      _activeSession.order = order;
      _activeSession.spots = spots;
      _activeSession.currentIndex = currentIndex;
      _activeSession.targetReps = targetReps;
      _activeSession.timerMinutes = timerMinutes;
      _activeSession.celebrating = celebrating;
      _activeSession.visitedCount = visitedCount;
      _activeSession.lap = lap;
    } else {
      _activeSession = {
        phase,
        mode,
        order,
        spots,
        currentIndex,
        targetReps,
        timerMinutes,
        celebrating,
        visitedCount,
        visitedIndices: new Set(),
        lap,
      };
    }
  }, [phase, mode, order, spots, currentIndex, targetReps, timerMinutes, celebrating, visitedCount, lap]);

  function startSession(
    passages: Passage[],
    sessionMode: SessionMode,
    target: RepTarget,
    minutes: TimerMinutes,
    sessionOrder: SessionOrder = 'random',
  ) {
    const initial: SpotState[] = passages.map((passage) => ({
      passage,
      streak: 0,
      justMissed: false,
      completed: false,
    }));
    setSpots(initial);
    setMode(sessionMode);
    setOrder(sessionOrder);
    setTargetReps(target);
    setTimerMinutes(minutes);
    setVisitedCount(0);
    if (_activeSession) _activeSession.visitedIndices = new Set();

    let first: number;
    let initialLap: LapState | null = null;
    if (sessionOrder === 'serial') {
      first = 0;
    } else if (sessionMode === 'consistency') {
      const lapOrder = buildLapOrder(initial, new Set());
      initialLap = { order: lapOrder, pos: 0, missed: new Set() };
      first = lapOrder[0] ?? 0;
    } else {
      first = Math.floor(Math.random() * passages.length);
    }
    setLap(initialLap);
    setCurrentIndex(first);
    setPhase('playing');
  }

  function advanceTimer() {
    if (_activeSession) _activeSession.visitedIndices.add(currentIndex);
    const nextVisited = _activeSession
      ? _activeSession.visitedIndices.size
      : visitedCount + 1;
    setVisitedCount(nextVisited);
    if (nextVisited >= spots.length) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCelebrating(true);
      return;
    }
    const visited = _activeSession?.visitedIndices ?? new Set<number>();
    const pick =
      order === 'serial'
        ? nextSerialIndex(spots.length, currentIndex, (i) => !visited.has(i))
        : pickRandomUnvisited(spots, visited);
    if (pick === -1) {
      setCelebrating(true);
      return;
    }
    setCurrentIndex(pick);
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCelebrating(true);
        return next;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

  function dismissCelebration() {
    setCelebrating(false);
  }

  const currentSpot = spots[currentIndex] ?? null;
  const completedCount = spots.filter((s) => s.completed).length;

  return {
    phase,
    setPhase,
    mode,
    setMode,
    order,
    setOrder,
    spots,
    currentIndex,
    currentSpot,
    targetReps,
    setTargetReps,
    timerMinutes,
    setTimerMinutes,
    celebrating,
    completedCount,
    visitedCount,
    startSession,
    onClean,
    onMiss,
    advanceTimer,
    dismissCelebration,
  };
}
