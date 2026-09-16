import { type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  onExit: () => void;
  exitLabel?: string;
  center?: ReactNode;
  right?: ReactNode;
  /** Optional second row rendered below the main bar, right-aligned. */
  sub?: ReactNode;
};

export function SessionTopBar({
  onExit,
  exitLabel = 'EXIT',
  center,
  right,
  sub,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  // A phone on its side is only ~375 tall, and this bar sits above the score.
  // The buttons keep their 44 floor; what gets trimmed is the empty band
  // around them (2026-09-15, Ralph: "too much space at the top ... a fair
  // amount of dead space"). insets.top is kept so a notched device in the
  // native app still clears it.
  const isPhoneLandscape = isPhone && vpW > vpH;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  // On phone the exit slot is a bare "‹" glyph. Its text box is only 16pt
  // wide, and hitSlop does nothing on react-native-web (only the legacy
  // Touchable implements it), so in a mobile browser the real target was
  // 16x32 hard against the top of the viewport - reported as "the Exit is
  // too high in the upper left for me to click it" (2026-09-15).
  const glyphLabel = exitLabel.trim().length <= 2;

  return (
    <View
      style={[
        styles.wrap,
        {
          // Phones sit the bar a little lower: in Safari the safe-area inset
          // is 0, so Spacing.sm alone parks the button on the screen edge.
          paddingTop:
            insets.top +
            (isPhoneLandscape ? Spacing.xs : isPhone ? Spacing.md : Spacing.sm),
          paddingBottom: isPhoneLandscape ? Spacing.xs : Spacing.sm,
          // Sideways on a notched iPhone the cutout eats the upper-LEFT
          // corner - exactly where the exit button lives - because the web
          // build paints edge to edge (viewport-fit=cover in +html.tsx) and
          // the native app has no bars either. Other screens already pad by
          // insets.left (evaluate.tsx, the floating run controls); this bar,
          // shared by 24 screens, did not. Unproven as the cause of the
          // 2026-09-15 report, but it is the same corner.
          paddingLeft: insets.left + 10,
          paddingRight: insets.right + 10,
          borderBottomColor: C.icon + '44',
        },
      ]}>
      <View style={styles.row}>
        <Pressable
          onPress={onExit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={glyphLabel ? 'Go back' : exitLabel}
          style={[styles.exitBtn, isPhone && styles.exitBtnPhone]}>
          <ThemedText
            style={[
              styles.exitText,
              isPhone && glyphLabel && styles.exitGlyphPhone,
              { color: C.tint },
            ]}>
            {exitLabel}
          </ThemedText>
        </Pressable>
        <View style={styles.center}>{center}</View>
        <View style={styles.right}>{right}</View>
      </View>
      {sub && <View style={styles.sub}>{sub}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // paddingLeft/Right are set inline - they carry the safe-area insets.
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  exitBtn: { paddingHorizontal: 6, paddingVertical: Spacing.xs },
  // 44x44 is the house minimum hit target (DESIGN_RULES). The box itself has
  // to carry it - hitSlop is a no-op in the browser.
  exitBtnPhone: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitText: { fontWeight: Type.weight.heavy, fontSize: Type.size.sm },
  // A lone chevron also needs to be findable, not just tappable.
  exitGlyphPhone: { fontSize: Type.size['2xl'], lineHeight: 26 },
  // minWidth: 0 — RN-Web flex items default to min-width:auto and refuse to
  // shrink below their content, so without this a long title plows into the
  // right-slot buttons instead of ellipsizing (B-023, seen on iPad PDFs).
  // flexShrink: 0 keeps the action buttons whole; the title yields.
  center: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  sub: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 6,
  },
});
