import type { Passage } from '@/lib/db/repos/passages';

// ── Types ──────────────────────────────────────────────────────────────────

export type Mode = 'consistency' | 'timer';
export type Order = 'serial' | 'random';
export type RepTarget = 3 | 5 | 10;
export type TimerMinutes = 3 | 5 | 10 | 15;

export type SpotState = {
  passage: Passage;
  streak: number;
  justMissed: boolean;
  completed: boolean;
  visited: boolean;
};

export type SessionState = {
  spots: SpotState[];
  currentIndex: number;
  mode: Mode;
  order: Order;
  targetReps: RepTarget;
  timerMinutes: TimerMinutes;
  // The countdown is driven by wall-clock math, not by counting setInterval
  // fires. `targetSeconds` is the duration of the current passage's slot
  // and `startedAtMs` is the wall time when that slot began. `secondsLeft`
  // is recomputed from those two on every tick so a throttled or paused
  // setInterval cannot make the display drift behind real time.
  targetSeconds: number;
  startedAtMs: number;
  secondsLeft: number;
  timerExpired: boolean;
  celebrating: boolean;
  visitedCount: number;
  engagedTempoByPassage: Record<string, number>;
};

// ── Module-level singleton ─────────────────────────────────────────────────
//
// Mirrors iPad's `_activeSession`. Used for Timer mode so the countdown
// keeps ticking when the user taps a strategy launch button (Tempo Ladder
// etc.) and navigates away — when they come back, the session is still
// here and the time has advanced. Consistency mode keeps state in the
// component itself; it does not navigate away mid-session.

let _state: SessionState | null = null;
let _intervalId: ReturnType<typeof setInterval> | null = null;
const _listeners = new Set<() => void>();

function emit() {
  _listeners.forEach((l) => {
    try {
      l();
    } catch {
      // ignore listener errors
    }
  });
}

// useSyncExternalStore compares snapshots by reference (Object.is). After
// mutating any field on _state, call bumpVersion() so getSnapshot returns
// a new object and React actually re-renders. Without this, in-place
// mutation looks like a no-op to React and the display only updates when
// some other state change forces a re-render — which is what made the
// Serial Practice countdown appear to only move when the metronome did.
function bumpVersion() {
  if (_state) _state = { ..._state };
  emit();
}

export function getSnapshot(): SessionState | null {
  return _state;
}

// Consistency-mode session state lives in the screen component, not in the
// singleton, so we expose a tiny setter the component can flip on mount.
// Emit on change so subscribers (PracticeTimersPill, overlay, etc.) re-render
// and pick up the new isSerialPracticeActive() value.
let _consistencyActive = false;
export function setConsistencyActive(active: boolean) {
  if (_consistencyActive === active) return;
  _consistencyActive = active;
  emit();
}

// True when any Serial Practice session — Timer or Consistency mode — is
// running. Used by PracticeTimersContext to suppress the global Move On
// alert. Timer mode has its own per-passage countdown that already plays
// the rotation role; Consistency mode is purely about hitting a target
// rep count, where a "rotate now" alert would compete with the user's
// real goal.
export function isSerialPracticeActive(): boolean {
  if (_consistencyActive) return true;
  return (
    _state !== null &&
    _state.mode === 'timer' &&
    !_state.celebrating &&
    !_state.timerExpired
  );
}

export function subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => {
    _listeners.delete(cb);
  };
}

function stopTicker() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

function recomputeSecondsLeft() {
  if (!_state || _state.mode !== 'timer') return;
  const elapsed = Math.max(0, Math.floor((Date.now() - _state.startedAtMs) / 1000));
  const next = Math.max(0, _state.targetSeconds - elapsed);
  if (next !== _state.secondsLeft) {
    _state.secondsLeft = next;
    if (next === 0 && !_state.timerExpired) _state.timerExpired = true;
    bumpVersion();
  }
}

function startTicker() {
  stopTicker();
  // 250ms keeps the display feeling smooth without burning CPU. The actual
  // value is computed from wall-clock math, so even if the interval is
  // throttled (background tab, busy main thread) the displayed time still
  // reflects real elapsed seconds when the next tick lands.
  _intervalId = setInterval(() => {
    if (!_state || _state.mode !== 'timer') return;
    if (_state.celebrating) return;
    if (_state.timerExpired) return;
    recomputeSecondsLeft();
  }, 250);
}

export function startTimerSession(params: {
  passages: Passage[];
  order: Order;
  timerMinutes: TimerMinutes;
}) {
  const spots: SpotState[] = params.passages.map((passage) => ({
    passage,
    streak: 0,
    justMissed: false,
    completed: false,
    visited: false,
  }));
  const first =
    params.order === 'serial' ? 0 : Math.floor(Math.random() * params.passages.length);
  spots[first].visited = true;
  const targetSeconds = params.timerMinutes * 60;
  _state = {
    spots,
    currentIndex: first,
    mode: 'timer',
    order: params.order,
    targetReps: 3,
    timerMinutes: params.timerMinutes,
    targetSeconds,
    startedAtMs: Date.now(),
    secondsLeft: targetSeconds,
    timerExpired: false,
    celebrating: false,
    visitedCount: 1,
    engagedTempoByPassage: {},
  };
  startTicker();
  emit();
}

export function clearSession() {
  _state = null;
  stopTicker();
  emit();
}

export function setEngagedTempo(passageId: string, bpm: number) {
  if (!_state) return;
  _state.engagedTempoByPassage = {
    ..._state.engagedTempoByPassage,
    [passageId]: bpm,
  };
  bumpVersion();
}

// Pick the next unvisited passage. Returns -1 if every passage has been
// visited (caller should celebrate).
function pickNextTimerIndex(state: SessionState): number {
  const { spots, currentIndex, order } = state;
  if (order === 'serial') {
    for (let step = 1; step <= spots.length; step++) {
      const i = (currentIndex + step) % spots.length;
      if (!spots[i].visited) return i;
    }
    return -1;
  }
  const unvisited: number[] = [];
  for (let i = 0; i < spots.length; i++) {
    if (!spots[i].visited) unvisited.push(i);
  }
  if (unvisited.length === 0) return -1;
  return unvisited[Math.floor(Math.random() * unvisited.length)];
}

export function nextPassage() {
  if (!_state || _state.mode !== 'timer') return;
  const next = pickNextTimerIndex(_state);
  if (next === -1) {
    _state.celebrating = true;
    stopTicker();
    bumpVersion();
    return;
  }
  _state.spots[next].visited = true;
  _state.visitedCount += 1;
  _state.currentIndex = next;
  _state.targetSeconds = _state.timerMinutes * 60;
  _state.startedAtMs = Date.now();
  _state.secondsLeft = _state.targetSeconds;
  _state.timerExpired = false;
  startTicker();
  bumpVersion();
}

export function dismissCelebration() {
  if (!_state) return;
  _state.celebrating = false;
  bumpVersion();
}
