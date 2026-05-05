import { useLocalSearchParams, useRouter } from 'expo-router';
import { useId, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { uploadPdfDocument, type UploadProgress } from '@/lib/pdf/upload';

export default function DocumentUploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const targetFolderId = params.folder ? params.folder : null;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [picked, setPicked] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
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
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedView style={{ gap: Spacing.md }}>
          <ThemedText type="title">Add a full part</ThemedText>
          <ThemedText style={{ opacity: 0.6, fontSize: Type.size.sm }}>
            Upload the full PDF — typically your part for an orchestral work or a
            multi-page solo. After upload, you can mark passages directly inside it.
          </ThemedText>

          {/* Native <label htmlFor=...> so the OS file picker is triggered by the
              browser directly, not via a JS .click() round-trip. More reliable
              across macOS focus / desktop-spaces quirks where dialogs sometimes
              opened behind the browser window. */}
          <label
            htmlFor={fileInputId}
            style={{
              display: 'block',
              backgroundColor: C.tint,
              color: '#fff',
              padding: '14px 16px',
              borderRadius: Radii.md,
              textAlign: 'center',
              cursor: 'pointer',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontWeight: 600,
              fontSize: Type.size.md,
              userSelect: 'none',
            }}>
            {picked ? `Selected: ${picked.name}` : 'Pick PDF'}
          </label>

          <ThemedText style={{ fontSize: Type.size.sm, opacity: 0.7 }}>Title</ThemedText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Mahler 9 — Clarinet I"
            placeholderTextColor={C.icon}
            style={[styles.input, { borderColor: C.icon, color: C.text }]}
          />

          <ThemedText style={{ fontSize: Type.size.sm, opacity: 0.7 }}>
            Composer (optional)
          </ThemedText>
          <TextInput
            value={composer}
            onChangeText={setComposer}
            placeholder="e.g. Gustav Mahler"
            placeholderTextColor={C.icon}
            style={[styles.input, { borderColor: C.icon, color: C.text }]}
          />

          {progress && (
            <View style={[styles.progressCard, { borderColor: C.icon }]}>
              <ThemedText style={{ fontWeight: Type.weight.bold }}>
                {progressLabel(progress)}
              </ThemedText>
              {progress.pages_total > 0 && (
                <ThemedText style={{ opacity: 0.7, fontSize: Type.size.sm }}>
                  {progress.pages_done} / {progress.pages_total} pages
                </ThemedText>
              )}
            </View>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </ThemedView>
      </ScrollView>

      <input
        id={fileInputId}
        type="file"
        accept="application/pdf"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />

      <Pressable
        style={[styles.saveBtn, { backgroundColor: canSave ? C.tint : C.icon }]}
        disabled={!canSave}
        onPress={onSave}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.saveText}>Upload + render</ThemedText>
        )}
      </Pressable>
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
  scroll: { padding: 20, gap: Spacing.md },
  input: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    fontSize: Type.size.md,
  },
  progressCard: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  error: {
    color: '#c0392b',
    fontSize: Type.size.sm,
  },
  saveBtn: {
    margin: 20,
    borderRadius: Radii.lg,
    padding: 18,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.xl },
});
