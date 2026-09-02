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
import { isSerialPracticeActive } from '@/lib/sessions/serialPractice';

// ── Config types ────────────────────────────────────────────────────────────

export type MoveOnConfig = { enabled: boolean; intervalMin: number };
export type MicrobreakConfig = {
  enabled: boolean;
  breakSeconds: number;
  // Per-strategy cadence — how much work between rests. Units differ by
  // strategy (clean reps / patterns / notes / steps); Interleaved Click-Up
  // fires at phase boundaries and has no count here.
  tempoLadderReps: number;
  rhythmicPatterns: number;
  microChainNotes: number;
  macroChainSteps: number;
  // ICU2: every N clean reps (✓ Next presses). Ralph's call 2026-08-30.
  icu2Reps: number;
};
export type PlayItColdConfig = {
  enabled: boolean;
  intervalMin: number;
  intervalMax: number;
  pieceId: string | null;
};
// "Body Move" reminder — fires every N minutes to remind the player to
// stand up, stretch, walk around. Distinct from Move On (which rotates
// passages) and Microbreak (which is a short mental rest after reps).
export type BodyMoveConfig = { enabled: boolean; intervalMin: number };
// Prompt timer — surfaces one of the player's own coaching cues ("support
// from the diaphragm", "relax your throat") on a fixed interval as an
// auto-fading banner. The app supplies only the clock and the random pick;
// the words are entirely the player's / their teachers'. Unlike the other
// timers it never blocks: no overlay, no dismissal required.
export type PromptsConfig = {
  enabled: boolean;
  intervalMin: number;
  prompts: string[];
};

const DEFAULT_MOVE_ON: MoveOnConfig = { enabled: false, intervalMin: 3 };
const DEFAULT_MICROBREAK: MicrobreakConfig = {
  enabled: false,
  breakSeconds: 12,
  tempoLadderReps: 3,
  rhythmicPatterns: 4,
  microChainNotes: 3,
  macroChainSteps: 1,
  icu2Reps: 3,
};
const DEFAULT_PLAY_IT_COLD: PlayItColdConfig = {
  enabled: false,
  intervalMin: 3,
  intervalMax: 10,
  pieceId: null,
};
const DEFAULT_BODY_MOVE: BodyMoveConfig = { enabled: false, intervalMin: 20 };
const DEFAULT_PROMPTS: PromptsConfig = {
  enabled: false,
  intervalMin: 5,
  prompts: [],
};

// How long a prompt banner stays before auto-fading. Hands are on the
// instrument, so the banner must never wait for a tap.
const PROMPT_VISIBLE_MS = 8_000;

const KEY_MOVE_ON = 'timers.moveOn';
const KEY_MICROBREAK = 'timers.microbreak';
const KEY_PLAY_IT_COLD = 'timers.playItCold';
const KEY_BODY_MOVE = 'timers.bodyMove';
const KEY_PROMPTS = 'timers.prompts';

// Fire priority: Move On > Play It Cold > Microbreak > Body Move
type FiringKind = 'moveOn' | 'microbreak' | 'playItCold' | 'bodyMove' | null;

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

type BodyMoveHook = {
  config: BodyMoveConfig;
  setConfig: (next: Partial<BodyMoveConfig>) => void;
  firing: boolean;
  dismiss: () => void;
};

type PromptsHook = {
  config: PromptsConfig;
  setConfig: (next: Partial<PromptsConfig>) => void;
  // The prompt text currently on screen, or null. Non-blocking: rendered
  // as an auto-fading banner (PromptBanner), never through the alert modal.
  activePrompt: string | null;
  dismissPrompt: () => void;
};

type Ctx = {
  moveOn: MoveOnHook;
  microbreak: MicrobreakHook;
  playItCold: PlayItColdHook;
  bodyMove: BodyMoveHook;
  prompts: PromptsHook;
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
  const [bodyMoveCfg, setBodyMoveCfg] = useState<BodyMoveConfig>(DEFAULT_BODY_MOVE);
  const [promptsCfg, setPromptsCfg] = useState<PromptsConfig>(DEFAULT_PROMPTS);
  const [hydrated, setHydrated] = useState(false);

  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const promptIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const promptHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPromptIndexRef = useRef(-1);

  const [firing, setFiring] = useState<FiringKind>(null);
  const queueRef = useRef<FiringKind[]>([]);

  const [breakSecondsLeft, setBreakSecondsLeft] = useState(0);
  const breakTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [coldPassage, setColdPassage] = useState<Passage | null>(null);

  const moveOnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bodyMoveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const moveOnCfgRef = useRef(moveOnCfg);
  moveOnCfgRef.current = moveOnCfg;
  const microbreakCfgRef = useRef(microbreakCfg);
  microbreakCfgRef.current = microbreakCfg;
  const playItColdCfgRef = useRef(playItColdCfg);
  playItColdCfgRef.current = playItColdCfg;
  const bodyMoveCfgRef = useRef(bodyMoveCfg);
  bodyMoveCfgRef.current = bodyMoveCfg;
  const promptsCfgRef = useRef(promptsCfg);
  promptsCfgRef.current = promptsCfg;
  const firingRef = useRef<FiringKind>(null);
  firingRef.current = firing;

  useEffect(() => {
    (async () => {
      const [mo, mb, pc, bm, pr] = await Promise.all([
        loadJson<MoveOnConfig>(KEY_MOVE_ON, DEFAULT_MOVE_ON),
        loadJson<MicrobreakConfig>(KEY_MICROBREAK, DEFAULT_MICROBREAK),
        loadJson<PlayItColdConfig>(KEY_PLAY_IT_COLD, DEFAULT_PLAY_IT_COLD),
        loadJson<BodyMoveConfig>(KEY_BODY_MOVE, DEFAULT_BODY_MOVE),
        loadJson<PromptsConfig>(KEY_PROMPTS, DEFAULT_PROMPTS),
      ]);
      setMoveOnCfg(mo);
      setMicrobreakCfg(mb);
      setPlayItColdCfg(pc);
      setBodyMoveCfg(bm);
      setPromptsCfg({
        ...pr,
        prompts: Array.isArray(pr.prompts)
          ? pr.prompts.filter((p) => typeof p === 'string')
          : [],
      });
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
      // Suppress while any Serial Practice session is running. Timer mode
      // has its own per-passage countdown bar; Consistency mode is about
      // rep counts and a "rotate now" overlay would compete with the
      // user's real goal.
      if (isSerialPracticeActive()) return;
      enqueueFire('moveOn');
    }, ms);
    return () => {
      if (moveOnIntervalRef.current) {
        clearInterval(moveOnIntervalRef.current);
        moveOnIntervalRef.current = null;
      }
    };
  }, [hydrated, moveOnCfg.enabled, moveOnCfg.intervalMin, enqueueFire]);

  // Body Move scheduler. Fires irrespective of Serial Practice — the
  // user's body still needs to stand up regardless of what practice flow
  // they are in.
  useEffect(() => {
    if (bodyMoveIntervalRef.current) {
      clearInterval(bodyMoveIntervalRef.current);
      bodyMoveIntervalRef.current = null;
    }
    if (!hydrated || !bodyMoveCfg.enabled) return;
    const ms = Math.max(60_000, bodyMoveCfg.intervalMin * 60_000);
    bodyMoveIntervalRef.current = setInterval(() => {
      enqueueFire('bodyMove');
    }, ms);
    return () => {
      if (bodyMoveIntervalRef.current) {
        clearInterval(bodyMoveIntervalRef.current);
        bodyMoveIntervalRef.current = null;
      }
    };
  }, [hydrated, bodyMoveCfg.enabled, bodyMoveCfg.intervalMin, enqueueFire]);

  // Prompt scheduler. Independent of the blocking fire queue: a prompt is
  // a whisper, not an interruption — it must never stack behind (or block)
  // a Rotate/Micro/Cold/Break overlay.
  const hidePrompt = useCallback(() => {
    if (promptHideRef.current) {
      clearTimeout(promptHideRef.current);
      promptHideRef.current = null;
    }
    setActivePrompt(null);
  }, []);

  const showRandomPrompt = useCallback(() => {
    const cfg = promptsCfgRef.current;
    const list = cfg.prompts;
    if (!cfg.enabled || list.length === 0) return;
    let idx = Math.floor(Math.random() * list.length);
    // Avoid repeating the same cue twice in a row when there is a choice.
    if (list.length > 1 && idx === lastPromptIndexRef.current) {
      idx = (idx + 1) % list.length;
    }
    lastPromptIndexRef.current = idx;
    setActivePrompt(list[idx]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (promptHideRef.current) clearTimeout(promptHideRef.current);
    promptHideRef.current = setTimeout(() => {
      promptHideRef.current = null;
      setActivePrompt(null);
    }, PROMPT_VISIBLE_MS);
  }, []);

  useEffect(() => {
    if (promptIntervalRef.current) {
      clearInterval(promptIntervalRef.current);
      promptIntervalRef.current = null;
    }
    if (!hydrated || !promptsCfg.enabled || promptsCfg.prompts.length === 0) {
      return;
    }
    const ms = Math.max(30_000, promptsCfg.intervalMin * 60_000);
    promptIntervalRef.current = setInterval(showRandomPrompt, ms);
    return () => {
      if (promptIntervalRef.current) {
        clearInterval(promptIntervalRef.current);
        promptIntervalRef.current = null;
      }
    };
  }, [
    hydrated,
    promptsCfg.enabled,
    promptsCfg.intervalMin,
    promptsCfg.prompts.length,
    showRandomPrompt,
  ]);

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

  const dismissBodyMove = useCallback(() => {
    if (firingRef.current !== 'bodyMove') return;
    setFiring(null);
    drainQueue();
  }, [drainQueue]);

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

  const setBodyMoveConfig = useCallback((patch: Partial<BodyMoveConfig>) => {
    setBodyMoveCfg((prev) => {
      const next = { ...prev, ...patch };
      setSetting(KEY_BODY_MOVE, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setPromptsConfig = useCallback((patch: Partial<PromptsConfig>) => {
    setPromptsCfg((prev) => {
      const next = { ...prev, ...patch };
      setSetting(KEY_PROMPTS, JSON.stringify(next)).catch(() => {});
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
    bodyMove: {
      config: bodyMoveCfg,
      setConfig: setBodyMoveConfig,
      firing: firing === 'bodyMove',
      dismiss: dismissBodyMove,
    },
    prompts: {
      config: promptsCfg,
      setConfig: setPromptsConfig,
      activePrompt,
      dismissPrompt: hidePrompt,
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
      bodyMove: {
        config: DEFAULT_BODY_MOVE,
        setConfig: () => {},
        firing: false,
        dismiss: () => {},
      },
      prompts: {
        config: DEFAULT_PROMPTS,
        setConfig: () => {},
        activePrompt: null,
        dismissPrompt: () => {},
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

export function useBodyMoveTimer() {
  return useCtx().bodyMove;
}

export function usePromptTimer() {
  return useCtx().prompts;
}

export function usePracticeTimers() {
  return useCtx();
}
