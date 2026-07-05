import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Lift, Palette } from '@/constants/palette';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { addPhotoDocument } from '@/lib/photo/addPhotoDocument';

// Native "Add a photo" screen — parity with upload.web.tsx: photos become a
// page-and-boxes IMAGE-DOCUMENT the user marks multiple passage boxes on in
// the document viewer (the post-Izumi model), not a single-passage crop.
// Choose one or more photos (or take them) → order them → name the piece →
// save → document viewer. See lib/photo/addPhotoDocument.
type PickedPage = { id: string; uri: string };

function newPageId(): string {
  return `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function UploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const folderId = params.folder ? params.folder : null;

  const [pages, setPages] = useState<PickedPage[]>([]);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addUris(uris: string[]) {
    if (uris.length === 0) return;
    setError(null);
    setPages((prev) => [...prev, ...uris.map((uri) => ({ id: newPageId(), uri }))]);
  }

  async function choosePhotos() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo access is needed to choose a photo. Enable it in Settings.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 12,
      orderedSelection: true,
    });
    if (res.canceled || !res.assets?.length) return;
    addUris(res.assets.map((a) => a.uri));
  }

  async function takePhoto() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera access is needed to take a photo. Enable it in Settings.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    addUris([res.assets[0].uri]);
  }

  function removePage(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }

  function movePage(id: string, dir: -1 | 1) {
    setPages((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    if (pages.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const { docId } = await addPhotoDocument({
        imageUris: pages.map((p) => p.uri),
        title,
        folderId,
        onProgress: setProgress,
      });
      router.replace(`/document/${docId}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
      setProgress(null);
    }
  }

  const hasPages = pages.length > 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <ThemedText style={styles.backLink}>‹ Back</ThemedText>
            </Pressable>
            <ThemedText type="title">Add a photo</ThemedText>
          </View>

          <ThemedText style={styles.body}>
            Snap the whole page — you’ll mark the exact spots you want to
            practice right on it next. More than one page? Add them all and
            they’ll turn like a PDF.
          </ThemedText>

          {saving ? (
            <View style={styles.center}>
              <ActivityIndicator color={Palette.accent} />
              <ThemedText style={styles.savingText}>
                {progress ?? 'Saving…'}
              </ThemedText>
            </View>
          ) : (
            <>
              <Button
                label={hasPages ? 'Add another page' : 'Choose photo'}
                fullWidth
                onPress={choosePhotos}
              />
              <Button
                label={hasPages ? 'Take another page' : 'Take photo'}
                variant="outline"
                fullWidth
                onPress={takePhoto}
              />

              {hasPages && (
                <View style={styles.pagesBlock}>
                  <ThemedText style={styles.pagesHeading}>
                    {pages.length === 1 ? '1 page' : `${pages.length} pages`} —
                    they’ll turn like a PDF
                  </ThemedText>
                  {pages.map((p, i) => (
                    <View key={p.id} style={styles.pageRow}>
                      <Image source={{ uri: p.uri }} style={styles.pageThumb} contentFit="cover" />
                      <ThemedText style={styles.pageLabel}>Page {i + 1}</ThemedText>
                      <View style={styles.pageActions}>
                        <Pressable
                          onPress={() => movePage(p.id, -1)}
                          disabled={i === 0}
                          hitSlop={6}
                          style={[styles.pageIconBtn, i === 0 && styles.pageIconDisabled]}>
                          <Feather name="arrow-up" size={16} color={Palette.text} />
                        </Pressable>
                        <Pressable
                          onPress={() => movePage(p.id, 1)}
                          disabled={i === pages.length - 1}
                          hitSlop={6}
                          style={[
                            styles.pageIconBtn,
                            i === pages.length - 1 && styles.pageIconDisabled,
                          ]}>
                          <Feather name="arrow-down" size={16} color={Palette.text} />
                        </Pressable>
                        <Pressable onPress={() => removePage(p.id)} hitSlop={6} style={styles.pageIconBtn}>
                          <Feather name="x" size={16} color={Palette.danger} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {hasPages && (
                <View style={styles.nameBlock}>
                  <ThemedText style={styles.nameLabel}>Name</ThemedText>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="e.g. Bach Invention 4, mm. 1–16"
                    placeholderTextColor={Palette.textMuted}
                    style={styles.nameInput}
                  />
                </View>
              )}

              {hasPages && (
                <Pressable style={styles.saveBtn} onPress={save}>
                  <ThemedText style={styles.saveBtnText}>
                    Save{pages.length > 1 ? ` ${pages.length} pages` : ''}
                  </ThemedText>
                </Pressable>
              )}

              {!hasPages && (
                <Pressable
                  style={styles.multiPageBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/multi-page',
                      params: { folder: folderId ?? '' },
                    } as never)
                  }>
                  <ThemedText style={styles.multiPageText}>
                    One passage spans two pages?
                  </ThemedText>
                </Pressable>
              )}
            </>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing.xl, paddingTop: 60, alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, gap: Spacing.md },
  header: { gap: Spacing.xs, marginBottom: Spacing.sm },
  backLink: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, color: Palette.accent },
  body: { fontSize: Type.size.md, lineHeight: 24, color: Palette.textSecondary },
  center: { alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  savingText: { color: Palette.textSecondary },
  pagesBlock: { gap: Spacing.sm, marginTop: Spacing.sm },
  pagesHeading: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
    color: Palette.textSecondary,
    paddingHorizontal: Spacing.xs,
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    padding: Spacing.sm,
    ...Lift,
  },
  pageThumb: {
    width: 48,
    height: 48,
    borderRadius: Radii.sm,
    backgroundColor: Palette.surfaceSunk,
  },
  pageLabel: {
    flex: 1,
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.text,
  },
  pageActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  pageIconBtn: {
    width: 34,
    height: 34,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceSunk,
  },
  pageIconDisabled: { opacity: 0.35 },
  nameBlock: { gap: Spacing.xs },
  nameLabel: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
    color: Palette.textSecondary,
    paddingHorizontal: Spacing.xs,
  },
  nameInput: {
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: Type.size.md,
    color: Palette.text,
    backgroundColor: Palette.card,
  },
  saveBtn: {
    borderRadius: Radii.lg,
    padding: 18,
    alignItems: 'center',
    backgroundColor: Palette.accent,
  },
  saveBtnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.xl },
  multiPageBtn: {
    alignSelf: 'center',
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  multiPageText: { fontSize: Type.size.sm, color: Palette.textSecondary },
  error: { color: Palette.danger, fontSize: Type.size.sm },
});
