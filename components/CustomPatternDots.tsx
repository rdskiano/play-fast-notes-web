// Variable-size dot strip for Custom Tempo Ladder mode. Each rep in the
// expanded pattern is rendered as one dot whose size encodes that rep's
// tempo — a "1 × Base + 10" rep sits visibly taller than the nine "Base"
// reps next to it, so the user *sees* the difficulty curve of their
// pattern before they play.
//
// Used in two places:
// 1. As the editor's live preview while you build a pattern.
// 2. On the practice screen as the progress indicator, with one dot
//    highlighted for the currently-playing rep.
//
// Sizing rule: radius scales linearly with `offsetFromBase` (the rep's
// resolved BPM minus the current base BPM), clamped so the biggest dot
// is at most 1.5× the smallest. We use BPM offsets rather than ratios
// so a "+10 over 90" rep is visually equivalent to "+10 over 120" —
// the punch is in the relative jump, not the absolute number.

import { StyleSheet, View } from 'react-native';

import { expandPatternToReps, type CustomPattern } from '@/lib/strategies/customPatterns';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type State = 'idle' | 'playing' | 'failed' | 'complete';

type Props = {
  pattern: Pick<CustomPattern, 'blocks'>;
  base: number;
  performance: number;
  /**
   * Index of the currently-playing rep within the expanded sequence.
   * When non-null, that dot gets the "current" ring; earlier dots are
   * filled (already cleared), later dots are hollow.
   */
  position?: number | null;
  state?: State;
  /**
   * Sizing: small / medium / large. Small = editor preview, large =
   * practice screen. The medium fallback is what callers usually want.
   */
  size?: 'small' | 'medium' | 'large';
  /** Tint for filled / current dots. Defaults to the green clean color. */
  accent?: string;
};

const SIZE_PRESETS = {
  small: { base: 10, gap: 4 },
  medium: { base: 14, gap: 6 },
  large: { base: 18, gap: 8 },
};

const MIN_DOT_SCALE = 1;        // unchanged at base
const MAX_DOT_SCALE = 1.5;      // 50 % larger at the highest-offset rep
const BPM_PER_SCALE_UNIT = 20;  // +20 BPM over base → 1.0 → MAX_DOT_SCALE

export function CustomPatternDots({
  pattern,
  base,
  performance,
  position = null,
  state = 'idle',
  size = 'medium',
  accent = '#2ecc71',
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const themeIcon = Colors[scheme].icon;
  const reps = expandPatternToReps(pattern, base, performance);
  const preset = SIZE_PRESETS[size];

  // Pre-compute each rep's size so the row is laid out coherently.
  // Two states only — filled (done) or hollow (upcoming) — to match
  // Step Clickup and Randomized cluster's dot strip. The rep the user
  // is about to play is just the first hollow dot in the line; no
  // special ring treatment, because that turned out to read as a
  // different visual language from the other two modes.
  const dots = reps.map((rep, i) => {
    const offset = Math.max(0, rep.tempoBpm - base);
    const t = Math.min(1, offset / BPM_PER_SCALE_UNIT);
    const scale = MIN_DOT_SCALE + (MAX_DOT_SCALE - MIN_DOT_SCALE) * t;
    const diameter = Math.round(preset.base * scale);
    const isPast = position !== null && i < position;
    const filled = isPast || state === 'complete';
    return { i, diameter, filled };
  });

  return (
    <View
      style={[styles.row, { gap: preset.gap }]}
      pointerEvents="none"
      accessibilityRole="progressbar">
      {dots.map(({ i, diameter, filled }) => {
        const baseStyle = {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
        };
        if (filled) {
          return (
            <View
              key={i}
              style={[
                baseStyle,
                { backgroundColor: accent, borderColor: accent, borderWidth: 2 },
              ]}
            />
          );
        }
        return (
          <View
            key={i}
            style={[
              baseStyle,
              styles.upcoming,
              { borderColor: themeIcon },
              state === 'failed' && { borderColor: themeIcon + '55' },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  upcoming: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
});
