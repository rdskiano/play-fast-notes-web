import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + Spacing.sm, borderBottomColor: C.icon + '44' },
      ]}>
      <View style={styles.row}>
        <Pressable onPress={onExit} hitSlop={8} style={styles.exitBtn}>
          <ThemedText style={[styles.exitText, { color: C.tint }]}>{exitLabel}</ThemedText>
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
    paddingHorizontal: 10,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  exitBtn: { paddingHorizontal: 6, paddingVertical: Spacing.xs },
  exitText: { fontWeight: Type.weight.heavy, fontSize: Type.size.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sub: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 6,
  },
});
