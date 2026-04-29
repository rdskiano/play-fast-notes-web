import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Opacity, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { signOut } from '@/lib/supabase/auth';

export default function SettingsScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Button label="‹ Back" variant="ghost" size="sm" onPress={() => router.back()} />
        <ThemedText type="title">Settings</ThemedText>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.section}>
        <ThemedText style={[styles.sectionLabel, { color: C.icon }]}>Account</ThemedText>
        <Button
          label="Sign out"
          variant="outline"
          onPress={() => {
            signOut().catch(() => undefined);
          }}
          fullWidth
        />
      </View>

      <ThemedText style={[styles.note, { color: C.icon }]}>
        More settings coming soon — practice timers, dark-mode toggle, account info.
      </ThemedText>
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
  section: { gap: Spacing.md },
  sectionLabel: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  note: {
    fontSize: Type.size.sm,
    opacity: Opacity.subtle,
    lineHeight: 18,
  },
});
