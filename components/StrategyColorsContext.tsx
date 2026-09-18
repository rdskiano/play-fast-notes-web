import { createContext, useContext, type ReactNode } from 'react';

export type StrategyKey =
  | 'tempo_ladder'
  | 'click_up'
  | 'rhythmic'
  | 'micro_chaining'
  | 'macro_chaining'
  | 'chaining'
  | 'interleaved'
  | 'rep_rotator'
  | 'icu2'
  | 'chunking'
  | 'recording'
  | 'evaluation';

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
// These colors are FIXED for every account (2026-09-18). A retired color-picker
// once saved per-account palettes under the settings key 'strategy_colors';
// those rows are now ignored on purpose. Announcements, tutorial videos, and
// marketing teach "green = Tempo Ladder" etc., so a user whose app showed
// different hues would be misled. Don't reintroduce per-user overrides.
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
  // The merged "Chaining" button (2026-08-21) — micro's indigo; the two
  // chaining keys above stay for old log rows and the chooser's children.
  chaining: '#3F5BD9', // indigo
  interleaved: '#C9772E', // Rep Rotator — orange (same strategy as rep_rotator)
  rep_rotator: '#C9772E', // Rep Rotator — orange
  // Interleaved Click-Up 2 — a deeper shade of click_up's petrol: same
  // family (both are Gebrian clicking-up methods), clearly darker.
  icu2: '#085D79',
  chunking: '#6f8e2a', // olive
  recording: '#5b6b7a', // slate — a capture, not a drill, so near-neutral
  evaluation: '#8a7d5c', // warm stone — a measurement, not a drill, so near-neutral
};

type Ctx = {
  colors: Record<string, string>;
};

const CtxObj = createContext<Ctx | null>(null);

export function StrategyColorsProvider({ children }: { children: ReactNode }) {
  return (
    <CtxObj.Provider value={{ colors: DEFAULT_STRATEGY_COLORS }}>
      {children}
    </CtxObj.Provider>
  );
}

export function useStrategyColors(): Ctx {
  const ctx = useContext(CtxObj);
  if (ctx) return ctx;
  return { colors: DEFAULT_STRATEGY_COLORS };
}
