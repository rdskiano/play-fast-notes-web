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
  | 'interleaved';

export const DEFAULT_STRATEGY_COLORS: Record<StrategyKey, string> = {
  tempo_ladder: '#2ecc71',
  click_up: '#154360',
  rhythmic: '#4a235a',
  interleaved: '#7b2d00',
};

const SETTINGS_KEY = 'strategy_colors';

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
          setColors({ ...DEFAULT_STRATEGY_COLORS, ...parsed });
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
