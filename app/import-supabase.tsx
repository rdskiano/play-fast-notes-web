// Unlinked dev route — type /import-supabase in the URL bar (or navigate via
// Settings → Import Supabase data if/when that link is added). Pulls every
// row from the user's Supabase account into the iPad's local SQLite, including
// document page renders. See lib/supabase/import.ts for the data flow.
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { runImport } from '@/lib/supabase/import';

export default function ImportSupabaseScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [wipeFirst, setWipeFirst] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  function append(line: string) {
    setLog((prev) => [...prev, line]);
  }

  async function onImport() {
    if (!email || !password) {
      append('✗ Enter email and password first.');
      return;
    }
    setLog([]);
    setDone(false);
    setRunning(true);
    try {
      const result = await runImport({
        email,
        password,
        wipeFirst,
        onProgress: append,
      });
      append('');
      append(
        `Files: ${result.filesDownloaded} downloaded, ${result.filesFailed} failed.`,
      );
      const totalRows = Object.values(result.tables).reduce((s, n) => s + n, 0);
      append(`Rows: ${totalRows} inserted across ${Object.keys(result.tables).length} tables.`);
      if (result.incompatible.length > 0) {
        append('');
        append(
          `⚠ ${result.incompatible.length} document(s) couldn't be imported (older format, no PDF on file). ` +
            `Re-upload these in the app to use them on this device:`,
        );
        for (const title of result.incompatible) append(`   • ${title}`);
      }
      setDone(true);
    } catch (e) {
      append(`Aborted: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

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
          One-shot tool to pull every row from your Supabase account into this
          iPad's local SQLite. Includes folders, passages, documents with rendered
          pages, exercises, and your practice log. Does not pull Self-Led
          recording audio (no iPad UI for it yet).
        </ThemedText>

        <View style={[styles.card, { borderColor: C.icon + '55' }]}>
          <ThemedText style={styles.label}>1. Sign in</ThemedText>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!running}
            style={[styles.input, { color: C.text, borderColor: C.icon + '55' }]}
            placeholderTextColor={C.icon}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!running}
            style={[styles.input, { color: C.text, borderColor: C.icon + '55' }]}
            placeholderTextColor={C.icon}
          />
        </View>

        <View style={[styles.card, { borderColor: C.icon + '55' }]}>
          <View style={styles.rowBetween}>
            <ThemedText style={styles.label}>2. Wipe iPad data first</ThemedText>
            <Switch
              value={wipeFirst}
              onValueChange={setWipeFirst}
              disabled={running}
              trackColor={{ true: C.tint }}
            />
          </View>
          <ThemedText style={[styles.hint, { color: C.icon }]}>
            Recommended. Clears every row in local SQLite before inserting from
            Supabase. With this off, ID collisions between existing iPad rows
            and Supabase rows will fail the import mid-way.
          </ThemedText>
        </View>

        <Button
          label={running ? 'Importing…' : 'Import'}
          onPress={onImport}
          disabled={!email || !password || running}
        />

        {log.length > 0 && (
          <View style={[styles.logBox, { borderColor: C.icon + '55' }]}>
            {log.map((line, i) => (
              <ThemedText key={i} style={styles.logLine}>
                {line}
              </ThemedText>
            ))}
          </View>
        )}

        {done && !running && (
          <Button label="Open Library" onPress={() => router.replace('/library')} />
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing['2xl'] },
  intro: { fontSize: Type.size.sm, lineHeight: 18 },
  card: {
    borderWidth: Borders.thin,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  hint: { fontSize: Type.size.xs, lineHeight: 16 },
  input: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Type.size.md,
  },
  logBox: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: 2,
  },
  logLine: {
    fontFamily: 'Menlo' as never,
    fontSize: 12,
    lineHeight: 16,
  },
});
