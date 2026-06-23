import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useId, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { uploadPdfDocument, type UploadProgress } from '@/lib/pdf/upload';

export default function DocumentUploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string; title?: string; composer?: string; imslp?: string }>();
  const targetFolderId = params.folder ? params.folder : null;
  const fromImslp = params.imslp === '1';
  const insets = useSafeAreaInsets();

  const [picked, setPicked] = useState<File | null>(null);
  // Prefilled when arriving from IMSLP (the work title + composer of the score
  // being downloaded), so the imported document is labeled correctly.
  const [title, setTitle] = useState(typeof params.title === 'string' ? params.title : '');
  const [composer, setComposer] = useState(typeof params.composer === 'string' ? params.composer : '');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputId = useId();
  const saving = progress !== null && progress.phase !== 'done';

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPicked(file);
    if (!title) {
      const nameNoExt = file.name.replace(/\.pdf$/i, '');
      setTitle(nameNoExt);
    }
    e.target.value = '';
  }

  const canSave = !!picked && title.trim().length > 0 && !saving;

  async function onSave() {
    if (!canSave || !picked) return;
    setError(null);
    setProgress({ phase: 'uploading', pages_done: 0, pages_total: 0 });
    try {
      const document = await uploadPdfDocument({
        file: picked,
        title: title.trim(),
        composer: composer.trim() ? composer.trim() : null,
        folder_id: targetFolderId,
        onProgress: (p) => setProgress(p),
      });
      // Cast: expo-router typed routes regenerate when the dev server starts.
      router.replace(`/document/${document.id}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProgress(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={styles.backLink}>‹ Back</ThemedText>
        </Pressable>
        <ThemedText type="title">Add a full part</ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={{ gap: Spacing.md }}>
          {fromImslp ? (
            <ThemedText style={styles.imslpHint}>
              IMSLP opened in another tab. Accept their disclaimer, download the
              PDF (it&apos;s free — non-members wait ~15 seconds), then pick it
              below. The title and composer are filled in for you.
            </ThemedText>
          ) : (
            <ThemedText style={styles.hint}>
              Upload the full PDF — typically your part for an orchestral work or a
              multi-page solo. After upload, you can mark passages directly inside it.
            </ThemedText>
          )}

          {/* Native <label htmlFor=...> so the OS file picker is triggered by the
              browser directly, not via a JS .click() round-trip. More reliable
              across macOS focus / desktop-spaces quirks where dialogs sometimes
              opened behind the browser window. */}
          <label
            htmlFor={fileInputId}
            style={{
              display: 'block',
              backgroundColor: Palette.accent,
              color: '#fff',
              padding: '14px 16px',
              borderRadius: Radii.lg,
              textAlign: 'center',
              cursor: 'pointer',
              fontFamily: Fonts.sans as string,
              fontWeight: 700,
              fontSize: Type.size.md,
              userSelect: 'none',
            }}>
            {picked ? `Selected: ${picked.name}` : 'Pick PDF'}
          </label>

          <ThemedText style={styles.fieldLabel}>Title</ThemedText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Mahler 9 — Clarinet I"
            placeholderTextColor={Palette.textMuted}
            style={styles.input}
          />

          <ThemedText style={styles.fieldLabel}>Composer (optional)</ThemedText>
          <TextInput
            value={composer}
            onChangeText={setComposer}
            placeholder="e.g. Gustav Mahler"
            placeholderTextColor={Palette.textMuted}
            style={styles.input}
          />

          {progress && (
            <View style={styles.progressCard}>
              <ThemedText style={styles.progressTitle}>
                {progressLabel(progress)}
              </ThemedText>
              {progress.pages_total > 0 && (
                <ThemedText style={styles.progressMeta}>
                  {progress.pages_done} / {progress.pages_total} pages
                </ThemedText>
              )}
            </View>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </View>
      </ScrollView>

      <input
        id={fileInputId}
        type="file"
        accept="application/pdf"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />

      <Pressable
        style={[styles.saveBtn, { backgroundColor: canSave ? Palette.accent : Palette.surfaceSunk }]}
        disabled={!canSave}
        onPress={onSave}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={[styles.saveText, { color: canSave ? '#fff' : Palette.textMuted }]}>
            Upload + render
          </ThemedText>
        )}
      </Pressable>

      <TutorialStep
        id="upload-document"
        visible={false}
        title="Add a full part (PDF)"
        body={
          "Tap \"Pick PDF\" to choose a multi-page PDF of an entire piece or part. Each page gets rendered into the app so you can mark individual passages on top of it later.\n\n" +
          "Give it a Title — this is required, and \"Upload + render\" stays greyed out until both a PDF and a title are set. It auto-fills from the file's name once you pick a PDF, but you can edit it. Composer is optional.\n\n" +
          "Tap \"Upload + render\" to send the PDF up and render its pages. Once it's done you'll land on the PDF viewer, where you can chop the part into the passages you actually want to drill."
        }
      />
    </ThemedView>
  );
}

function progressLabel(p: UploadProgress): string {
  switch (p.phase) {
    case 'uploading': return 'Uploading PDF…';
    case 'init': return 'Reading PDF…';
    case 'rendering': return 'Rendering pages…';
    case 'saving': return 'Saving…';
    case 'done': return 'Done';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  backLink: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
  },
  scroll: { padding: Spacing.lg, gap: Spacing.md },
  hint: { color: Palette.textSecondary, fontSize: Type.size.sm, lineHeight: 19 },
  imslpHint: { color: Palette.accent, fontSize: Type.size.sm, lineHeight: 19 },
  fieldLabel: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    color: Palette.text,
  },
  input: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    fontSize: Type.size.md,
    color: Palette.text,
    ...Lift,
  },
  progressCard: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
    ...Lift,
  },
  progressTitle: {
    fontFamily: Fonts.rounded,
    fontWeight: Type.weight.bold,
    color: Palette.text,
  },
  progressMeta: { color: Palette.textSecondary, fontSize: Type.size.sm },
  error: {
    color: Palette.danger,
    fontSize: Type.size.sm,
  },
  saveBtn: {
    margin: Spacing.lg,
    borderRadius: Radii.lg,
    padding: 18,
    alignItems: 'center',
  },
  saveText: { fontWeight: Type.weight.bold, fontSize: Type.size.xl },
});
