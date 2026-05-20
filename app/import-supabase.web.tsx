// Web shim. /import-supabase is iOS-only — it pulls Supabase data INTO the
// local SQLite, which doesn't exist on web (web is already Supabase-native).
// This shim renders a placeholder rather than importing the native chain
// (expo-file-system + expo-sqlite), which would fail to bundle for web.

import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ImportSupabaseWebShim() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Back"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Import from Supabase
          </ThemedText>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText style={[styles.intro, { color: C.icon }]}>
          This route is iOS-only. The web app already runs against your
          Supabase account directly — there is nothing to import. Use the
          iPad app if you need to pull your data into local storage.
        </ThemedText>
        <View style={{ height: Spacing.md }} />
        <Button label="Back" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  intro: { fontSize: Type.size.sm, lineHeight: 18 },
});
