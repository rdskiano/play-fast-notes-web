import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { getSetting, setSetting } from '@/lib/db/repos/settings';

export type StrategyKey =
  | 'tempo_ladder'
  | 'click_up'
  | 'rhythmic'
  | 'micro_chaining'
  | 'macro_chaining'
  | 'interleaved'
  | 'rep_rotator'
  | 'chunking'
  | 'recording';

// One coordinated jewel-tone family: matched depth + saturation, hues spread
// evenly around the wheel so no two are neighbors. They harmonize yet stay
// individually tellable at pill size — unlike the old palette's three
// near-black darks (navy/plum/brown) that all read as the same dark blob.
// Every value carries enough depth for the pills' white text.
//
// `interleaved` and `rep_rotator` are the SAME strategy (Rep Rotator is the
// renamed Interleaved; old log rows still say 'interleaved'), so they share
// teal — clearer in the log and it un-crowds the blue/violet hues.
//
// Saved custom colors (settings key 'strategy_colors') still override these;
// the loader drops any saved entry equal to its LEGACY_DEFAULT so these
// upgrades reach accounts that only ever had defaults.
export const DEFAULT_STRATEGY_COLORS: Record<StrategyKey, string> = {
  tempo_ladder: '#2e9e5b', // green
  click_up: '#3a6ea5', // denim blue — muted to match the family's depth
  rhythmic: '#d07b1f', // amber
  micro_chaining: '#8a4bd0', // violet
  macro_chaining: '#c43e86', // rose
  interleaved: '#128a8a', // teal (same strategy as rep_rotator)
  rep_rotator: '#128a8a', // teal
  chunking: '#6f8e2a', // olive
  recording: '#5b6b7a', // slate — a capture, not a drill, so near-neutral
};

const SETTINGS_KEY = 'strategy_colors';

// The palette that shipped before 2026-06-12. A retired color-picker UI
// saved FULL palettes — including untouched defaults — into settings, so
// several accounts carry these exact values without ever having chosen
// them. On load, any saved entry equal to its old default is treated as
// "never customized" and dropped, letting default-palette upgrades through
// while real hand-picked colors still win.
const LEGACY_DEFAULTS: Record<string, string> = {
  tempo_ladder: '#2ecc71',
  click_up: '#154360',
  rhythmic: '#4a235a',
  micro_chaining: '#7d3c98',
  macro_chaining: '#b9770e',
  interleaved: '#7b2d00',
  rep_rotator: '#0d7377',
};

type Ctx = {
  colors: Record<string, string>;
  setColor: (key: StrategyKey, value: string) => void;
  resetAll: () => void;
};

const CtxObj = createContext<Ctx | null>(null);

export function StrategyColorsProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<Record<StrategyKey, string>>(
    DEFAULT_STRATEGY_COLORS,
  );

  useEffect(() => {
    (async () => {
      const raw = await getSetting(SETTINGS_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const customized = Object.fromEntries(
            Object.entries(parsed as Record<string, string>).filter(
              ([key, value]) => LEGACY_DEFAULTS[key] !== value,
            ),
          );
          setColors({ ...DEFAULT_STRATEGY_COLORS, ...customized });
        }
      } catch {
        // ignore malformed setting
      }
    })();
  }, []);

  const setColor = useCallback((key: StrategyKey, value: string) => {
    setColors((prev) => {
      const next = { ...prev, [key]: value };
      setSetting(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setColors(DEFAULT_STRATEGY_COLORS);
    setSetting(SETTINGS_KEY, JSON.stringify(DEFAULT_STRATEGY_COLORS)).catch(
      () => {},
    );
  }, []);

  return (
    <CtxObj.Provider value={{ colors, setColor, resetAll }}>
      {children}
    </CtxObj.Provider>
  );
}

export function useStrategyColors(): Ctx {
  const ctx = useContext(CtxObj);
  if (ctx) return ctx;
  return {
    colors: DEFAULT_STRATEGY_COLORS,
    setColor: () => {},
    resetAll: () => {},
  };
}
