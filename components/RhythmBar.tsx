// Fixed rhythm-pattern bar for the Rhythmic Variation screen.
//
// Replaces the old floating, draggable, pinch-to-resize FloatingRhythmCard —
// the only floating overlay on the screen that wasn't an actual practice tool.
// It docks directly under the top bar on every device so the score gets the
// full body below, and nothing ever needs to be moved or resized to read the
// music (the chronic problem in landscape on a phone).
//
// One unified file (no .web.tsx) because AbcStaffView is already platform-split,
// so the notation renders on both web and native through the same call.

import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { buildRhythmAbc } from '@/lib/notation/buildAbc';
import type { RhythmPattern } from '@/lib/strategies/rhythmPatterns';

type Props = {
  pattern: RhythmPattern;
  rhythmLooping: boolean;
  onToggleRhythm: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  /** Phone: shrink the notation + drop the Loop button's text label. */
  compact?: boolean;
};

export function RhythmBar({
  pattern,
  rhythmLooping,
  onToggleRhythm,
  onPrev,
  onNext,
  canPrev,
  canNext,
  compact = false,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  // Measured width of the flexible notation slot — feeds AbcStaffView so the
  // staff fills whatever room is left between the buttons on any screen.
  const [notationW, setNotationW] = useState(0);
  const abc = useMemo(() => buildRhythmAbc(pattern), [pattern]);
  const notationH = compact ? 50 : 64;

  function onNotationLayout(e: LayoutChangeEvent) {
    const w = Math.round(e.nativeEvent.layout.width);
    setNotationW((prev) => (Math.abs(prev - w) < 1 ? prev : w));
  }

  return (
    <View
      style={[
        styles.bar,
        {
          borderBottomColor: C.icon + '44',
          backgroundColor: scheme === 'dark' ? '#1a1c1e' : '#fafafa',
        },
      ]}>
      <Pressable
        onPress={onPrev}
        disabled={!canPrev}
        hitSlop={6}
        accessibilityLabel="Previous pattern"
        style={[styles.navBtn, { borderColor: C.tint, opacity: canPrev ? 1 : 0.3 }]}>
        <ThemedText style={[styles.navText, { color: C.tint }]}>←</ThemedText>
      </Pressable>

      <View style={styles.notation} onLayout={onNotationLayout}>
        {notationW > 0 && (
          <AbcStaffView
            abc={abc}
            width={notationW}
            height={notationH}
            scale={compact ? 1.1 : 1.3}
            centered
            fallbackText={pattern.notes.join('  ·  ')}
          />
        )}
      </View>

      <Pressable
        onPress={onToggleRhythm}
        hitSlop={6}
        accessibilityLabel={rhythmLooping ? 'Stop rhythm' : 'Loop rhythm'}
        style={[styles.loopBtn, { backgroundColor: rhythmLooping ? '#c0392b' : C.tint }]}>
        <ThemedText style={styles.loopText}>
          {rhythmLooping ? '■' : '▶'}
          {compact ? '' : rhythmLooping ? ' Stop' : ' Loop'}
        </ThemedText>
      </Pressable>

      <Pressable
        onPress={onNext}
        disabled={!canNext}
        hitSlop={6}
        accessibilityLabel="Next pattern"
        style={[styles.navBtn, styles.nextBtn, { opacity: canNext ? 1 : 0.4 }]}>
        <ThemedText style={[styles.navText, { color: '#fff' }]}>→</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notation: { flex: 1, justifyContent: 'center' },
  navBtn: {
    minWidth: 48,
    borderWidth: Borders.thick,
    borderRadius: Radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtn: { backgroundColor: '#9b59b6', borderColor: '#6c3483' },
  navText: { fontWeight: Type.weight.heavy, fontSize: 18, lineHeight: 20 },
  loopBtn: {
    borderRadius: Radii.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loopText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 15 },
});
