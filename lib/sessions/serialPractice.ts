import type { Piece } from '@/lib/db/repos/pieces';

// ── Types ──────────────────────────────────────────────────────────────────

export type Mode = 'consistency' | 'timer';
export type Order = 'serial' | 'random';
export type RepTarget = 3 | 5 | 10;
export type TimerMinutes = 3 | 5 | 10 | 15;

export type SpotState = {
  piece: Piece;
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
  secondsLeft: number;
  timerExpired: boolean;
  celebrating: boolean;
  visitedCount: number;
  engagedTempoByPiece: Record<string, number>;
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

export function getSnapshot(): SessionState | null {
  return _state;
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

function startTicker() {
  stopTicker();
  _intervalId = setInterval(() => {
    if (!_state || _state.mode !== 'timer') return;
    if (_state.celebrating) return;
    if (_state.timerExpired) return;
    if (_state.secondsLeft > 0) {
      _state.secondsLeft -= 1;
      if (_state.secondsLeft === 0) _state.timerExpired = true;
      emit();
    }
  }, 1000);
}

export function startTimerSession(params: {
  pieces: Piece[];
  order: Order;
  timerMinutes: TimerMinutes;
}) {
  const spots: SpotState[] = params.pieces.map((piece) => ({
    piece,
    streak: 0,
    justMissed: false,
    completed: false,
    visited: false,
  }));
  const first =
    params.order === 'serial' ? 0 : Math.floor(Math.random() * params.pieces.length);
  spots[first].visited = true;
  _state = {
    spots,
    currentIndex: first,
    mode: 'timer',
    order: params.order,
    targetReps: 3,
    timerMinutes: params.timerMinutes,
    secondsLeft: params.timerMinutes * 60,
    timerExpired: false,
    celebrating: false,
    visitedCount: 1,
    engagedTempoByPiece: {},
  };
  startTicker();
  emit();
}

export function clearSession() {
  _state = null;
  stopTicker();
  emit();
}

export function setEngagedTempo(pieceId: string, bpm: number) {
  if (!_state) return;
  _state.engagedTempoByPiece = {
    ..._state.engagedTempoByPiece,
    [pieceId]: bpm,
  };
  emit();
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
    emit();
    return;
  }
  _state.spots[next].visited = true;
  _state.visitedCount += 1;
  _state.currentIndex = next;
  _state.secondsLeft = _state.timerMinutes * 60;
  _state.timerExpired = false;
  startTicker();
  emit();
}

export function dismissCelebration() {
  if (!_state) return;
  _state.celebrating = false;
  emit();
}
