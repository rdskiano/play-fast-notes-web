import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addPdfDocument } from '@/lib/pdf/addPdfDocument';

// Native "Add a full part (PDF)" screen. Local-first: pick a PDF from Files,
// save it on-device (the viewer renders pages via the pdf-render module), and
// sync to the user's Supabase account when signed in. See lib/pdf/addPdfDocument.
export default function DocumentUploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const folderId = params.folder ? params.folder : null;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [picked, setPicked] = useState<{ uri: string; name: string } | null>(null);
  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickPdf() {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setPicked({ uri: asset.uri, name: asset.name ?? 'document.pdf' });
    if (!title.trim()) {
      setTitle((asset.name ?? '').replace(/\.pdf$/i, ''));
    }
  }

  const canAdd = !!picked && title.trim().length > 0 && !busy;

  async function onAdd() {
    if (!canAdd || !picked) return;
    setBusy(true);
    setError(null);
    try {
      const { docId } = await addPdfDocument({
        fileUri: picked.uri,
        title,
        composer,
        folderId,
        onProgress: setProgress,
      });
      // Cast: expo-router typed routes regenerate when the dev server starts.
      router.replace(`/document/${docId}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="title">Add a full part (PDF)</ThemedText>
        <ThemedText style={{ opacity: 0.6, fontSize: Type.size.sm }}>
          Choose a PDF — typically your part for an orchestral work or a multi-page
          solo. After it&apos;s added you can mark passages directly inside it.
        </ThemedText>

        <Pressable
          style={[styles.pickBtn, { backgroundColor: C.tint }]}
          disabled={busy}
          onPress={pickPdf}>
          <ThemedText style={styles.pickText}>
            {picked ? `Selected: ${picked.name}` : 'Choose PDF'}
          </ThemedText>
        </Pressable>

        <ThemedText style={{ fontSize: Type.size.sm, opacity: 0.7 }}>Title</ThemedText>
        <TextInput
          value={title}
          onChangeText={setTitle}
          editable={!busy}
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
          editable={!busy}
          placeholder="e.g. Gustav Mahler"
          placeholderTextColor={C.icon}
          style={[styles.input, { borderColor: C.icon, color: C.text }]}
        />

        {progress && (
          <View style={[styles.progressCard, { borderColor: C.icon }]}>
            <ThemedText style={{ fontSize: Type.size.sm }}>{progress}</ThemedText>
          </View>
        )}
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      </ScrollView>

      <Pressable
        style={[styles.addBtn, { backgroundColor: canAdd ? C.tint : C.icon }]}
        disabled={!canAdd}
        onPress={onAdd}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.addText}>Add to library</ThemedText>
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: Spacing.md },
  pickBtn: {
    borderRadius: Radii.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  pickText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.md },
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
  },
  error: { color: '#c0392b', fontSize: Type.size.sm },
  addBtn: {
    margin: 20,
    borderRadius: Radii.lg,
    padding: 18,
    alignItems: 'center',
  },
  addText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.xl },
});
