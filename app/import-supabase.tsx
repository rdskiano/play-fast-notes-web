// Unlinked dev route — type /import-supabase in the URL bar (or reach it via
// Account → "Download my web library"). Pulls every row from the user's
// Supabase account into the iPad's local SQLite, including document page
// renders. See lib/supabase/import.ts for the data flow.
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { runImport, type ImportResult, type ImportStatus } from '@/lib/supabase/import';

export default function ImportSupabaseScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [wipeFirst, setWipeFirst] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [done, setDone] = useState(false);

  function append(line: string) {
    setLog((prev) => [...prev, line]);
  }

  async function onImport() {
    if (!email || !password) {
      setErrorMsg('Enter your email and password first.');
      return;
    }
    setLog([]);
    setDone(false);
    setResult(null);
    setErrorMsg(null);
    setStatus(null);
    setRunning(true);
    try {
      const res = await runImport({
        email,
        password,
        wipeFirst,
        onProgress: append,
        onStatus: setStatus,
      });
      setResult(res);
      setDone(true);
    } catch (e) {
      setErrorMsg((e as Error).message);
      append(`Aborted: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  // Friendly one-line summary of what came in.
  const summary = (() => {
    if (!result) return '';
    const passages = result.tables.pieces ?? 0;
    const files = result.filesDownloaded;
    const parts: string[] = [];
    parts.push(passages === 1 ? '1 passage' : `${passages} passages`);
    parts.push(files === 1 ? '1 file' : `${files} files`);
    return parts.join(' · ');
  })();

  const pct = status && status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Back"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Download my library
          </ThemedText>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* ── DONE ─────────────────────────────────────────────── */}
        {done && result && (
          <View style={[styles.doneCard, { borderColor: C.tint, backgroundColor: C.tint + '12' }]}>
            <ThemedText style={styles.doneTitle}>✓ Your library is ready</ThemedText>
            {summary ? (
              <ThemedText style={[styles.doneSummary, { color: C.icon }]}>{summary}</ThemedText>
            ) : null}
            <Button label="Go to Library" onPress={() => router.replace('/library')} />
            {result.filesFailed > 0 && (
              <ThemedText style={[styles.doneNote, { color: C.icon }]}>
                {result.filesFailed} file{result.filesFailed === 1 ? '' : 's'} didn&apos;t come
                through — open the piece and re-download if it looks blank.
              </ThemedText>
            )}
            {result.incompatible.length > 0 && (
              <View style={styles.incompatBox}>
                <ThemedText style={[styles.doneNote, { color: C.icon }]}>
                  {result.incompatible.length} older document
                  {result.incompatible.length === 1 ? '' : 's'} couldn&apos;t be brought over.
                  Re-upload {result.incompatible.length === 1 ? 'it' : 'them'} in the app:
                </ThemedText>
                {result.incompatible.map((title, i) => (
                  <ThemedText key={i} style={[styles.doneNote, { color: C.icon }]}>
                    • {title}
                  </ThemedText>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── RUNNING ──────────────────────────────────────────── */}
        {running && (
          <View style={styles.progressWrap}>
            <ActivityIndicator size="large" color={C.tint} />
            <ThemedText style={styles.progressLabel}>
              {status?.label ?? 'Starting…'}
            </ThemedText>
            {status && status.total > 0 ? (
              <>
                <View style={[styles.barTrack, { backgroundColor: C.icon + '22' }]}>
                  <View
                    style={[styles.barFill, { width: `${pct}%`, backgroundColor: C.tint }]}
                  />
                </View>
                <ThemedText style={[styles.progressCount, { color: C.icon }]}>
                  {status.done} of {status.total} files
                </ThemedText>
              </>
            ) : (
              <ThemedText style={[styles.progressCount, { color: C.icon }]}>
                This can take a minute for a big library.
              </ThemedText>
            )}
          </View>
        )}

        {/* ── IDLE (the form) ──────────────────────────────────── */}
        {!running && !done && (
          <>
            <ThemedText style={[styles.intro, { color: C.icon }]}>
              Copies your whole Play Fast Notes library from the web onto this iPad —
              folders, passages, marked-up pages, and your practice history — so you can
              practice here even without a connection.
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
                style={[styles.input, { color: C.text, borderColor: C.icon + '55' }]}
                placeholderTextColor={C.icon}
              />
            </View>

            <View style={[styles.card, { borderColor: C.icon + '55' }]}>
              <View style={styles.rowBetween}>
                <ThemedText style={styles.label}>2. Replace what&apos;s on this iPad</ThemedText>
                <Switch value={wipeFirst} onValueChange={setWipeFirst} trackColor={{ true: C.tint }} />
              </View>
              <ThemedText style={[styles.hint, { color: C.icon }]}>
                Recommended. Clears this iPad&apos;s copy first, then loads a fresh copy from
                the web. Your web library is never touched.
              </ThemedText>
            </View>

            {errorMsg && (
              <ThemedText style={[styles.errorText, { color: Palette.danger }]}>
                {errorMsg}
              </ThemedText>
            )}

            <Button label="Download my library" onPress={onImport} disabled={!email || !password} />
          </>
        )}

        {/* ── Technical details (collapsed by default) ─────────── */}
        {log.length > 0 && (
          <View style={styles.detailsWrap}>
            <Pressable onPress={() => setShowDetails((v) => !v)} hitSlop={8}>
              <ThemedText style={[styles.detailsToggle, { color: C.icon }]}>
                {showDetails ? '▾ Hide details' : '▸ Show details'}
              </ThemedText>
            </Pressable>
            {showDetails && (
              <View style={[styles.logBox, { borderColor: C.icon + '55' }]}>
                {log.map((line, i) => (
                  <ThemedText key={i} style={styles.logLine}>
                    {line}
                  </ThemedText>
                ))}
              </View>
            )}
          </View>
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
  errorText: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },

  // Progress (running)
  progressWrap: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing['2xl'],
  },
  progressLabel: { fontSize: Type.size.lg, fontWeight: Type.weight.bold, textAlign: 'center' },
  barTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 999 },
  progressCount: { fontSize: Type.size.sm },

  // Done card
  doneCard: {
    borderWidth: Borders.thin,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  doneTitle: { fontSize: Type.size.xl, fontWeight: Type.weight.heavy },
  doneSummary: { fontSize: Type.size.md },
  doneNote: { fontSize: Type.size.xs, lineHeight: 16 },
  incompatBox: { gap: 2 },

  // Details
  detailsWrap: { gap: Spacing.sm },
  detailsToggle: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
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
