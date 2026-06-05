// Rhythm-pattern bar for the Rhythmic Variation screen.
//
// Replaces the old floating, draggable, pinch-to-resize FloatingRhythmCard —
// the only floating overlay on the screen that wasn't an actual practice tool.
//
// Control cluster order: [▶ Loop] [←] [ music ] [→] — Loop on the far left,
// Back / Forward flanking the music tightly on each side.
//
// Two layouts, driven by the parent:
//   • Landscape (merged) — passed `leading` (EXIT + grouping chip) and
//     `trailing` (DONE); the cluster sits centered between them in the title
//     row, reclaiming the separate band.
//   • Portrait (band) — a plain docked band; the cluster is centered.
//
// The music is sized to its own content (estimated from the note count) so the
// flanking arrows hug it instead of leaving a long empty staff line.
//
// One unified file (no .web.tsx): notation renders through the already-split
// AbcStaffView + buildRhythmAbc, so both web and native work via one call.

import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  /** Portrait band: shrink the notation + drop the Loop button's text label. */
  compact?: boolean;
  /** Far-start slot (landscape merged header) — e.g. EXIT + grouping chip. */
  leading?: ReactNode;
  /** Far-end slot (landscape merged header) — e.g. DONE. */
  trailing?: ReactNode;
  /** Pad for the notch / rounded corners when this sits at the screen top. */
  withSafeArea?: boolean;
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
  leading,
  trailing,
  withSafeArea = false,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const insets = useSafeAreaInsets();
  const abc = useMemo(() => buildRhythmAbc(pattern, { bare: true }), [pattern]);

  // Merged (landscape title row) vs band (portrait dock). Sizes validated
  // against the bare (clef-less) notation: single line, time signature legible.
  const merged = Boolean(leading || trailing);
  const notationH = merged ? 56 : compact ? 56 : 60;
  const notationScale = merged ? 1.1 : compact ? 1.1 : 1.2;

  // Size the staff to its own content (note count × scale) so the flanking
  // arrows hug it. AbcStaffView fills its `width` and renders the staff at
  // width-10 on both platforms (web sets the svg to its bbox + clips; native's
  // WebView clamps to width), so one value drives both the wrapper and the
  // staff. A too-large width was what left the big empty gap on iPad.
  const notationW = Math.round(
    Math.max(150, Math.min((50 + pattern.notes.length * 42) * (notationScale / 1.1), 480)),
  );

  const loopBtn = (
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
  );

  const cluster = (
    <View style={styles.cluster}>
      {loopBtn}
      <Pressable
        onPress={onPrev}
        disabled={!canPrev}
        hitSlop={6}
        accessibilityLabel="Previous pattern"
        style={[styles.navBtn, { borderColor: C.tint, opacity: canPrev ? 1 : 0.3 }]}>
        <ThemedText style={[styles.navText, { color: C.tint }]}>←</ThemedText>
      </Pressable>

      <View style={{ width: notationW, height: notationH, justifyContent: 'center' }}>
        <AbcStaffView
          abc={abc}
          width={notationW}
          height={notationH}
          scale={notationScale}
          centered
          fallbackText={pattern.notes.join('  ·  ')}
        />
      </View>

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

  return (
    <View
      style={[
        styles.bar,
        merged ? styles.barSpread : styles.barCentered,
        withSafeArea && {
          paddingTop: insets.top,
          paddingLeft: Spacing.md + insets.left,
          paddingRight: Spacing.md + insets.right,
        },
        {
          borderBottomColor: C.icon + '44',
          backgroundColor: scheme === 'dark' ? '#1a1c1e' : '#fafafa',
        },
      ]}>
      {leading}
      {cluster}
      {trailing}
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
  // Band: center the whole cluster. Merged: spread leading | cluster | trailing
  // so EXIT/grouping sit left, DONE right, and the cluster lands in the middle.
  barCentered: { justifyContent: 'center' },
  barSpread: { justifyContent: 'space-between' },
  cluster: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
