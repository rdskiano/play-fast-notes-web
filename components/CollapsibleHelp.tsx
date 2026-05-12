import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function CollapsibleHelp({ title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.header}
        accessibilityRole="button">
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText style={[styles.chevron, { color: C.icon }]}>
          {open ? '▾' : '▸'}
        </ThemedText>
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chevron: { fontSize: Type.size.lg, fontWeight: Type.weight.bold },
  body: { gap: Spacing.sm },
});
