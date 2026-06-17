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
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AbcStaffView } from '@/components/AbcStaffView';
import { useStrategyColors } from '@/components/StrategyColorsContext';
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
  const { colors } = useStrategyColors();
  const insets = useSafeAreaInsets();
  const { width: vpW } = useWindowDimensions();
  const abc = useMemo(() => buildRhythmAbc(pattern, { bare: true }), [pattern]);

  // Merged (landscape title row) vs band (portrait dock). Sizes validated
  // against the bare (clef-less) notation: single line, time signature legible.
  const merged = Boolean(leading || trailing);
  // Height must clear the stems + beams, which hang below the single line. Too
  // short clips the beams (worst case = 16th-note double beams). Verified the
  // 16th double-beam fits at h64/scale1.1 and h68/scale1.2.
  const notationScale = merged ? 1.1 : compact ? 1.1 : 1.2;
  // A tuplet ('3') adds a bracket + number below the beams, making the notation
  // noticeably taller. Without extra room the web staff (bottom-aligned, cropped
  // to its bbox) clips the TOP — the time signature disappears off the top edge.
  // Give tuplet patterns a taller slot so the whole thing fits.
  const hasTuplet = pattern.notes.some((t) => t.endsWith('t'));
  const notationH = (notationScale >= 1.2 ? 68 : 64) + (hasTuplet ? 24 : 0);

  // Size the staff to its own content (note count × scale) so the flanking
  // arrows hug it. AbcStaffView fills its `width` and renders the staff at
  // width-10 on both platforms (web sets the svg to its bbox + clips; native's
  // WebView clamps to width), so one value drives both the wrapper and the
  // staff. A too-large width was what left the big empty gap on iPad.
  // In the portrait band the whole cluster ([Loop][←][music][→]) sits on one
  // non-wrapping, centered row. If the music slot is too wide for the phone, the
  // flanking buttons overflow the screen edges and get clipped (fine in
  // landscape, which has width to spare). Cap the music to the width left after
  // the buttons + padding (~215px) so Loop / ← / → always stay on-screen.
  const maxNotationW = compact ? Math.max(110, vpW - 215) : 480;
  const notationW = Math.round(
    Math.min(Math.max(150, (50 + pattern.notes.length * 42) * (notationScale / 1.1)), maxNotationW),
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
        {/* No `centered`: on web that triggers a getBBox resize that clips the
            beams hanging below the staff. The slot is already content-sized, so
            left-aligned notation fills it and the arrows still hug it. */}
        <AbcStaffView
          abc={abc}
          width={notationW}
          height={notationH}
          scale={notationScale}
          fallbackText={pattern.notes.join('  ·  ')}
        />
      </View>

      <Pressable
        onPress={onNext}
        disabled={!canNext}
        hitSlop={6}
        accessibilityLabel="Next pattern"
        style={[
          styles.navBtn,
          styles.nextBtn,
          // Match the Rhythm Variations strategy color (the pill), not a stale
          // hardcoded purple from when this strategy used to be purple.
          { backgroundColor: colors.rhythmic, borderColor: colors.rhythmic },
          { opacity: canNext ? 1 : 0.4 },
        ]}>
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
  // Color is applied inline from the rhythmic strategy color; this default
  // matches it (amber) so there's no purple fallback if the context is absent.
  nextBtn: { backgroundColor: '#d07b1f', borderColor: '#d07b1f' },
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
