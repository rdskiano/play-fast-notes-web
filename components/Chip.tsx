import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  label: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Selectable chip used for mode/order/target choices in config screens.
 * Flexes to fill its row by default. Selected state fills with the tint
 * color and inverts the label color; unselected shows a bordered chip
 * with neutral text. Pass `subtitle` for a secondary line below the
 * label (the small description under chips like "Number of correct reps
 * in a row").
 */
export function Chip({ label, subtitle, selected, onPress, style }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: C.icon,
          backgroundColor: selected ? C.tint : 'transparent',
        },
        style,
      ]}>
      <ThemedText
        style={[
          styles.label,
          { color: selected ? '#fff' : C.text },
        ]}>
        {label}
      </ThemedText>
      {subtitle && (
        <ThemedText
          style={[
            styles.subtitle,
            { color: selected ? '#fff' : C.icon },
          ]}>
          {subtitle}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    borderWidth: Borders.thick,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
  },
  label: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
  },
  subtitle: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.medium,
    textAlign: 'center',
    marginTop: 3,
    opacity: 0.85,
  },
});
