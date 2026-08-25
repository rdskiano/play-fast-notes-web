// The pencil's ink swatch pill — shown while annotating, on every surface
// that hosts the pencil (document viewer, passage viewer, practice screens).
// Presentational: hosts own the state via useInkColor and drop this inside a
// relatively-positioned container; it centers itself horizontally at `top`.

import { Pressable, StyleSheet, View } from 'react-native';

import { Palette } from '@/constants/palette';
import { Borders, Radii, Spacing } from '@/constants/tokens';
import { INK_SWATCHES } from '@/lib/annotation/inkColor';

export function InkSwatchRow({
  value,
  onPick,
  top = Spacing.sm,
}: {
  /** Current ink (null = default black). */
  value: string | null;
  /** Recolor the live pen AND persist — wire to useInkColor's picker. */
  onPick: (hex: string) => void;
  /** Offset from the container's top (screens under a top bar pass more). */
  top?: number;
}) {
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top }]}>
      <View style={styles.row}>
        {INK_SWATCHES.map((c) => {
          const on = (value ?? INK_SWATCHES[0]) === c;
          return (
            <Pressable
              key={c}
              onPress={() => onPick(c)}
              hitSlop={6}
              style={[styles.swatch, { backgroundColor: c }, on && styles.swatchOn]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 60,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Palette.card,
    borderRadius: Radii.pill,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    alignItems: 'center',
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  swatchOn: {
    borderWidth: 3,
    borderColor: '#fff',
    // A hairline of shadow so the white selection ring reads on the light
    // pill behind it.
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
