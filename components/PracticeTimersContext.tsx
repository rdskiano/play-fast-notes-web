import * as Haptics from 'expo-haptics';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { getSetting, setSetting } from '@/lib/db/repos/settings';

// ── Config types ────────────────────────────────────────────────────────────

export type MoveOnConfig = { enabled: boolean; intervalMin: number };
export type MicrobreakConfig = { enabled: boolean; breakSeconds: number };
export type PlayItColdConfig = {
  enabled: boolean;
  intervalMin: number;
  intervalMax: number;
  pieceId: string | null;
};

const DEFAULT_MOVE_ON: MoveOnConfig = { enabled: false, intervalMin: 3 };
const DEFAULT_MICROBREAK: MicrobreakConfig = {
  enabled: false,
  breakSeconds: 12,
};
const DEFAULT_PLAY_IT_COLD: PlayItColdConfig = {
  enabled: false,
  intervalMin: 3,
  intervalMax: 10,
  pieceId: null,
};

const KEY_MOVE_ON = 'timers.moveOn';
const KEY_MICROBREAK = 'timers.microbreak';
const KEY_PLAY_IT_COLD = 'timers.playItCold';

// Fire priority: Move On > Play It Cold > Microbreak
type FiringKind = 'moveOn' | 'microbreak' | 'playItCold' | null;

// ── Hook-facing shapes ──────────────────────────────────────────────────────

type MoveOnHook = {
  config: MoveOnConfig;
  setConfig: (next: Partial<MoveOnConfig>) => void;
  firing: boolean;
  dismiss: () => void;
};

type MicrobreakHook = {
  config: MicrobreakConfig;
  setConfig: (next: Partial<MicrobreakConfig>) => void;
  firing: boolean;
  secondsLeft: number;
  trigger: () => void;
};

type PlayItColdHook = {
  config: PlayItColdConfig;
  setConfig: (next: Partial<PlayItColdConfig>) => void;
  firing: boolean;
  passage: Passage | null;
  dismiss: () => void;
};

type Ctx = {
  moveOn: MoveOnHook;
  microbreak: MicrobreakHook;
  playItCold: PlayItColdHook;
};

const CtxObj = createContext<Ctx | null>(null);

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await getSetting(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return { ...fallback, ...parsed } as T;
    }
  } catch {
    // ignore
  }
  return fallback;
}

function randomMsBetween(minMin: number, maxMin: number): number {
  const lo = Math.min(minMin, maxMin);
  const hi = Math.max(minMin, maxMin);
  const minutes = lo + Math.random() * (hi - lo);
  return Math.max(10_000, minutes * 60_000);
}

export function PracticeTimersProvider({ children }: { children: ReactNode }) {
  const [moveOnCfg, setMoveOnCfg] = useState<MoveOnConfig>(DEFAULT_MOVE_ON);
  const [microbreakCfg, setMicrobreakCfg] = useState<MicrobreakConfig>(DEFAULT_MICROBREAK);
  const [playItColdCfg, setPlayItColdCfg] = useState<PlayItColdConfig>(DEFAULT_PLAY_IT_COLD);
  const [hydrated, setHydrated] = useState(false);

  const [firing, setFiring] = useState<FiringKind>(null);
  const queueRef = useRef<FiringKind[]>([]);

  const [breakSecondsLeft, setBreakSecondsLeft] = useState(0);
  const breakTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [coldPassage, setColdPassage] = useState<Passage | null>(null);

  const moveOnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const moveOnCfgRef = useRef(moveOnCfg);
  moveOnCfgRef.current = moveOnCfg;
  const microbreakCfgRef = useRef(microbreakCfg);
  microbreakCfgRef.current = microbreakCfg;
  const playItColdCfgRef = useRef(playItColdCfg);
  playItColdCfgRef.current = playItColdCfg;
  const firingRef = useRef<FiringKind>(null);
  firingRef.current = firing;

  useEffect(() => {
    (async () => {
      const [mo, mb, pc] = await Promise.all([
        loadJson<MoveOnConfig>(KEY_MOVE_ON, DEFAULT_MOVE_ON),
        loadJson<MicrobreakConfig>(KEY_MICROBREAK, DEFAULT_MICROBREAK),
        loadJson<PlayItColdConfig>(KEY_PLAY_IT_COLD, DEFAULT_PLAY_IT_COLD),
      ]);
      setMoveOnCfg(mo);
      setMicrobreakCfg(mb);
      setPlayItColdCfg(pc);
      setHydrated(true);
    })();
  }, []);

  const enqueueFire = useCallback((kind: Exclude<FiringKind, null>) => {
    if (firingRef.current) {
      if (!queueRef.current.includes(kind)) queueRef.current.push(kind);
      return;
    }
    setFiring(kind);
    if (kind === 'microbreak') {
      const secs = microbreakCfgRef.current.breakSeconds;
      setBreakSecondsLeft(secs);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }, []);

  const drainQueue = useCallback(() => {
    const next = queueRef.current.shift();
    if (next) {
      setTimeout(() => enqueueFire(next as Exclude<FiringKind, null>), 50);
    }
  }, [enqueueFire]);

  useEffect(() => {
    if (firing !== 'microbreak') {
      if (breakTickRef.current) {
        clearInterval(breakTickRef.current);
        breakTickRef.current = null;
      }
      return;
    }
    breakTickRef.current = setInterval(() => {
      setBreakSecondsLeft((prev) => {
        if (prev <= 1) {
          setFiring(null);
          drainQueue();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (breakTickRef.current) {
        clearInterval(breakTickRef.current);
        breakTickRef.current = null;
      }
    };
  }, [firing, drainQueue]);

  useEffect(() => {
    if (moveOnIntervalRef.current) {
      clearInterval(moveOnIntervalRef.current);
      moveOnIntervalRef.current = null;
    }
    if (!hydrated || !moveOnCfg.enabled) return;
    const ms = Math.max(30_000, moveOnCfg.intervalMin * 60_000);
    moveOnIntervalRef.current = setInterval(() => {
      enqueueFire('moveOn');
    }, ms);
    return () => {
      if (moveOnIntervalRef.current) {
        clearInterval(moveOnIntervalRef.current);
        moveOnIntervalRef.current = null;
      }
    };
  }, [hydrated, moveOnCfg.enabled, moveOnCfg.intervalMin, enqueueFire]);

  const schedulePlayItCold = useCallback(() => {
    if (coldTimeoutRef.current) {
      clearTimeout(coldTimeoutRef.current);
      coldTimeoutRef.current = null;
    }
    const cfg = playItColdCfgRef.current;
    if (!cfg.enabled || !cfg.pieceId) return;
    const ms = randomMsBetween(cfg.intervalMin, cfg.intervalMax);
    coldTimeoutRef.current = setTimeout(async () => {
      const cfgNow = playItColdCfgRef.current;
      if (!cfgNow.enabled || !cfgNow.pieceId) return;
      const passage = await getPassage(cfgNow.pieceId);
      if (!passage) {
        schedulePlayItCold();
        return;
      }
      setColdPassage(passage);
      enqueueFire('playItCold');
    }, ms);
  }, [enqueueFire]);

  useEffect(() => {
    if (!hydrated) return;
    schedulePlayItCold();
    return () => {
      if (coldTimeoutRef.current) {
        clearTimeout(coldTimeoutRef.current);
        coldTimeoutRef.current = null;
      }
    };
  }, [
    hydrated,
    playItColdCfg.enabled,
    playItColdCfg.intervalMin,
    playItColdCfg.intervalMax,
    playItColdCfg.pieceId,
    schedulePlayItCold,
  ]);

  const dismissMoveOn = useCallback(() => {
    if (firingRef.current !== 'moveOn') return;
    setFiring(null);
    drainQueue();
  }, [drainQueue]);

  const dismissPlayItCold = useCallback(() => {
    if (firingRef.current !== 'playItCold') return;
    setFiring(null);
    setColdPassage(null);
    drainQueue();
    schedulePlayItCold();
  }, [drainQueue, schedulePlayItCold]);

  const triggerMicrobreak = useCallback(() => {
    if (!microbreakCfgRef.current.enabled) return;
    enqueueFire('microbreak');
  }, [enqueueFire]);

  const setMoveOnConfig = useCallback((patch: Partial<MoveOnConfig>) => {
    setMoveOnCfg((prev) => {
      const next = { ...prev, ...patch };
      setSetting(KEY_MOVE_ON, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setMicrobreakConfig = useCallback((patch: Partial<MicrobreakConfig>) => {
    setMicrobreakCfg((prev) => {
      const next = { ...prev, ...patch };
      setSetting(KEY_MICROBREAK, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setPlayItColdConfig = useCallback((patch: Partial<PlayItColdConfig>) => {
    setPlayItColdCfg((prev) => {
      const next = { ...prev, ...patch };
      setSetting(KEY_PLAY_IT_COLD, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value: Ctx = {
    moveOn: {
      config: moveOnCfg,
      setConfig: setMoveOnConfig,
      firing: firing === 'moveOn',
      dismiss: dismissMoveOn,
    },
    microbreak: {
      config: microbreakCfg,
      setConfig: setMicrobreakConfig,
      firing: firing === 'microbreak',
      secondsLeft: breakSecondsLeft,
      trigger: triggerMicrobreak,
    },
    playItCold: {
      config: playItColdCfg,
      setConfig: setPlayItColdConfig,
      firing: firing === 'playItCold',
      passage: coldPassage,
      dismiss: dismissPlayItCold,
    },
  };

  return <CtxObj.Provider value={value}>{children}</CtxObj.Provider>;
}

function useCtx(): Ctx {
  const ctx = useContext(CtxObj);
  if (!ctx) {
    return {
      moveOn: {
        config: DEFAULT_MOVE_ON,
        setConfig: () => {},
        firing: false,
        dismiss: () => {},
      },
      microbreak: {
        config: DEFAULT_MICROBREAK,
        setConfig: () => {},
        firing: false,
        secondsLeft: 0,
        trigger: () => {},
      },
      playItCold: {
        config: DEFAULT_PLAY_IT_COLD,
        setConfig: () => {},
        firing: false,
        passage: null,
        dismiss: () => {},
      },
    };
  }
  return ctx;
}

export function useMoveOnTimer() {
  return useCtx().moveOn;
}

export function useMicrobreakTimer() {
  return useCtx().microbreak;
}

export function usePlayItColdTimer() {
  return useCtx().playItCold;
}

export function usePracticeTimers() {
  return useCtx();
}
