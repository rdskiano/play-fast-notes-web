import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

// DESIGN_RULES §5 button hierarchy:
//  primary     — filled brand accent + white text
//  outline     — secondary: white surface + hairline border, ink text
//  tertiary    — sunk surface, ink text (low-emphasis neutral, e.g. Sign out)
//  danger      — filled --danger (the ONE most-irreversible action per screen)
//  dangerGhost — destructive secondary: white bg + danger-ghost border + danger text
//  ghost       — text-only brand
export type ButtonVariant =
  | 'primary'
  | 'outline'
  | 'tertiary'
  | 'danger'
  | 'dangerGhost'
  | 'ghost';
export type ButtonSize = 'xs' | 'sm' | 'lg';

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  disabled = false,
  hitSlop = 6,
  style,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const sizeStyle =
    size === 'xs' ? styles.sizeXs : size === 'sm' ? styles.sizeSm : styles.sizeLg;
  const labelSize =
    size === 'xs' ? styles.labelXs : size === 'sm' ? styles.labelSm : styles.labelLg;

  let bg: string = 'transparent';
  let border = 'transparent';
  let labelColor = '#fff';

  if (variant === 'primary') {
    bg = C.tint;
  } else if (variant === 'danger') {
    // One destructive red app-wide (DESIGN_RULES §1) — not the old brick red.
    bg = Palette.danger;
  } else if (variant === 'dangerGhost') {
    bg = Palette.card;
    border = Palette.dangerGhostBorder;
    labelColor = Palette.danger;
  } else if (variant === 'tertiary') {
    bg = Palette.surfaceSunk;
    labelColor = C.text;
  } else if (variant === 'ghost') {
    labelColor = C.tint;
  } else {
    // secondary = white surface + hairline border.
    bg = Palette.card;
    border = Palette.border;
    labelColor = C.text;
  }
  const bordered = variant === 'outline' || variant === 'dangerGhost';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        styles.base,
        sizeStyle,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: bordered ? Borders.thin : 0,
          opacity: disabled ? 0.5 : 1,
          // v2 reskin — subtle press feedback.
          transform: pressed && !disabled ? [{ scale: 0.985 }] : undefined,
        },
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}>
      <ThemedText style={[labelSize, { color: labelColor }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeXs: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radii.md,
  },
  sizeSm: {
    paddingHorizontal: 14,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.sm,
  },
  sizeLg: {
    padding: Spacing.lg,
    borderRadius: Radii.lg,
  },
  labelXs: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
  },
  labelSm: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
  },
  labelLg: {
    fontSize: Type.size.lg,
    fontWeight: Type.weight.bold,
  },
});
