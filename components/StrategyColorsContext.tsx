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
// DESIGN_RULES §2 strategy palette (adopted 2026-06-22). One fixed hue per
// practice method. click_up = "Interleaved Click-Up" = petrol; interleaved /
// rep_rotator are the SAME strategy (Rep Rotator) = orange. chunking/recording
// aren't in the doc (chunking folds into Macro; recording is a capture) so they
// keep their prior near-neutral hues.
export const DEFAULT_STRATEGY_COLORS: Record<StrategyKey, string> = {
  tempo_ladder: '#2E9C66', // green
  click_up: '#0A7598', // Interleaved Click-Up — petrol (brand)
  rhythmic: '#7657C8', // violet
  micro_chaining: '#3F5BD9', // indigo
  macro_chaining: '#9B4F86', // plum
  interleaved: '#C9772E', // Rep Rotator — orange (same strategy as rep_rotator)
  rep_rotator: '#C9772E', // Rep Rotator — orange
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
// Superseded default palettes, per key. On load, any saved entry equal to one
// of its old defaults is treated as "never customized" and dropped, so default
// palette upgrades reach accounts that only ever had defaults while real
// hand-picked colors still win. Two generations now: the pre-2026-06-12 palette
// and the 2026-06-12 jewel tones (both superseded by DESIGN_RULES §2).
const LEGACY_DEFAULTS: Record<string, string[]> = {
  tempo_ladder: ['#2ecc71', '#2e9e5b'],
  click_up: ['#154360', '#3a6ea5'],
  rhythmic: ['#4a235a', '#d07b1f'],
  micro_chaining: ['#7d3c98', '#8a4bd0'],
  macro_chaining: ['#b9770e', '#c43e86'],
  interleaved: ['#7b2d00', '#128a8a'],
  rep_rotator: ['#0d7377', '#128a8a'],
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
              ([key, value]) => !(LEGACY_DEFAULTS[key] ?? []).includes(value),
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
