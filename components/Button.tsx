import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ButtonVariant = 'primary' | 'outline' | 'danger' | 'ghost';
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
    bg = Status.danger;
  } else if (variant === 'ghost') {
    labelColor = C.tint;
  } else {
    border = C.icon;
    labelColor = C.text;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={[
        styles.base,
        sizeStyle,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === 'outline' ? Borders.thin : 0,
          opacity: disabled ? 0.5 : 1,
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
