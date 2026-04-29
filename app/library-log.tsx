import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Opacity, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function LibraryLogScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Button label="‹ Back" variant="ghost" size="sm" onPress={() => router.back()} />
        <ThemedText type="title">Practice Log</ThemedText>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.empty}>
        <ThemedText style={[styles.emptyTitle, { color: C.text }]}>
          Coming soon
        </ThemedText>
        <ThemedText style={[styles.emptyBody, { color: C.icon }]}>
          The full practice history view is on the web roadmap. For now your sessions
          are logged in the background — open the iPad app to review them.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    paddingTop: 60,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: { fontSize: Type.size.xl, fontWeight: Type.weight.bold },
  emptyBody: {
    fontSize: Type.size.md,
    lineHeight: 20,
    textAlign: 'center',
    opacity: Opacity.muted,
  },
});
