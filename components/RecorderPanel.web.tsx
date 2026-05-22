// Live recording runs on the iPad, at the instrument. On the web the Recorder
// tool is informational — saved takes still appear in the passage's practice
// log here, they're just captured on the iPad.

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function RecorderPanel({
  passageId: _passageId,
  documentId: _documentId,
}: {
  passageId?: string;
  documentId?: string;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <View style={styles.panel}>
      <ThemedText style={styles.title}>Recorder</ThemedText>
      <ThemedText style={[styles.body, { color: C.icon }]}>
        Record on your iPad, at your instrument. Saved takes show up in the
        passage&apos;s practice log here on the web.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  title: {
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
    textAlign: 'center',
  },
  body: { fontSize: Type.size.sm, lineHeight: 19, textAlign: 'center' },
});
