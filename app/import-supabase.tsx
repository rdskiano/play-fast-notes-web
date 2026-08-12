// Unlinked dev route — type /import-supabase in the URL bar (or reach it via
// Account → "Download my web library"). Pulls every row from the user's
// Supabase account into the iPad's local SQLite, including document page
// renders. See lib/supabase/import.ts for the data flow.
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ImportCancelled,
  runImport,
  type ImportResult,
  type ImportStatus,
  type LocalOnlySummary,
} from '@/lib/supabase/import';

const WIPE_CONFIRM_WORD = 'DELETE';

function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? singular + 's')}`;
}

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
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Wipe-confirmation modal. The import pauses on a Promise until the user
  // either types DELETE and confirms, or cancels (→ import aborts untouched).
  const [wipeSummary, setWipeSummary] = useState<LocalOnlySummary | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const wipeResolveRef = useRef<((ok: boolean) => void) | null>(null);

  function append(line: string) {
    setLog((prev) => [...prev, line]);
  }

  function answerWipe(ok: boolean) {
    wipeResolveRef.current?.(ok);
    wipeResolveRef.current = null;
    setWipeSummary(null);
    setConfirmText('');
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
    setInfoMsg(null);
    setStatus(null);
    setRunning(true);
    try {
      const res = await runImport({
        email,
        password,
        wipeFirst,
        onProgress: append,
        onStatus: setStatus,
        confirmWipe: (summary) =>
          new Promise<boolean>((resolve) => {
            wipeResolveRef.current = resolve;
            setConfirmText('');
            setWipeSummary(summary);
          }),
      });
      setResult(res);
      setDone(true);
    } catch (e) {
      if (e instanceof ImportCancelled) {
        setInfoMsg('Import cancelled — nothing on this iPad was changed.');
        append('Cancelled — nothing was changed.');
      } else {
        setErrorMsg((e as Error).message);
        append(`Aborted: ${(e as Error).message}`);
      }
    } finally {
      setRunning(false);
    }
  }

  const confirmMatches = confirmText.trim().toUpperCase() === WIPE_CONFIRM_WORD;

  const wipeItems = wipeSummary
    ? [
        wipeSummary.passages > 0 ? plural(wipeSummary.passages, 'passage') : null,
        wipeSummary.documents > 0 ? plural(wipeSummary.documents, 'document') : null,
        wipeSummary.practiceSessions > 0
          ? plural(wipeSummary.practiceSessions, 'practice session')
          : null,
      ].filter((s): s is string => s !== null)
    : [];

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
                Clears this iPad&apos;s copy first, then loads a fresh copy from the web. Your
                web library is never touched.
              </ThemedText>
              {wipeFirst && (
                <ThemedText style={[styles.hint, { color: Palette.danger }]}>
                  ⚠ Anything you created only on this iPad — pieces, marked passages, practice
                  history — does NOT exist on the web and would be deleted. If any is found,
                  you&apos;ll be asked to confirm before anything is removed.
                </ThemedText>
              )}
            </View>

            {errorMsg && (
              <ThemedText style={[styles.errorText, { color: Palette.danger }]}>
                {errorMsg}
              </ThemedText>
            )}
            {infoMsg && (
              <ThemedText style={[styles.errorText, { color: C.icon }]}>{infoMsg}</ThemedText>
            )}

            <Button label="Download my library" onPress={onImport} disabled={!email || !password} />
          </>
        )}

        {/* ── WIPE CONFIRMATION (blocking, typed) ──────────────── */}
        <Modal visible={wipeSummary !== null} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: C.background, borderColor: Palette.danger }]}>
              <ThemedText style={[styles.modalTitle, { color: Palette.danger }]}>
                ⚠ This iPad has work that is NOT on the web
              </ThemedText>
              <ThemedText style={styles.modalBody}>
                Replacing will permanently delete{' '}
                <ThemedText style={styles.modalBodyBold}>{wipeItems.join(', ')}</ThemedText> stored
                only on this iPad. They are not in your web library and cannot be recovered.
              </ThemedText>
              <ThemedText style={[styles.modalBody, { color: C.icon }]}>
                To keep this iPad&apos;s work, tap Cancel, turn off &ldquo;Replace what&apos;s on
                this iPad&rdquo;, and download again.
              </ThemedText>
              <ThemedText style={styles.modalBody}>
                To delete it anyway, type {WIPE_CONFIRM_WORD} below:
              </ThemedText>
              <TextInput
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder={WIPE_CONFIRM_WORD}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.input, { color: C.text, borderColor: Palette.danger }]}
                placeholderTextColor={C.icon}
              />
              <Button label="Cancel — keep my iPad data" onPress={() => answerWipe(false)} />
              <Pressable
                onPress={() => confirmMatches && answerWipe(true)}
                disabled={!confirmMatches}
                style={[styles.dangerBtn, { opacity: confirmMatches ? 1 : 0.35 }]}
              >
                <ThemedText style={styles.dangerBtnText}>Delete it and replace</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>

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

  // Wipe confirmation modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderWidth: 2,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalTitle: { fontSize: Type.size.lg, fontWeight: Type.weight.heavy },
  modalBody: { fontSize: Type.size.sm, lineHeight: 20 },
  modalBodyBold: { fontSize: Type.size.sm, fontWeight: Type.weight.heavy },
  dangerBtn: {
    backgroundColor: Palette.danger,
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  dangerBtnText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.md },
});
