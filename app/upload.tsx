import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { insertPassage, updatePassageAssets } from '@/lib/db/repos/passages';
import { uploadPassageImage } from '@/lib/supabase/storage';

function newPassageId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type Picked = { file: File; previewUrl: string; aspectRatio: number };

function readImageAspectRatio(url: string): Promise<number> {
  if (typeof window === 'undefined') return Promise.resolve(1);
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      resolve(w / h);
    };
    img.onerror = () => resolve(1);
    img.src = url;
  });
}

export default function UploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const targetFolderId = params.folder ? params.folder : null;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [picked, setPicked] = useState<Picked | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (picked?.previewUrl) URL.revokeObjectURL(picked.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    const aspectRatio = await readImageAspectRatio(previewUrl);
    setPicked({ file, previewUrl, aspectRatio });
    // Reset so re-picking the same file re-fires onChange.
    e.target.value = '';
  }

  function clearPicked() {
    if (picked?.previewUrl) URL.revokeObjectURL(picked.previewUrl);
    setPicked(null);
  }

  const canSave = !!picked && !saving;

  async function onSave() {
    if (!canSave || !picked) return;
    setSaving(true);
    setError(null);
    const id = newPassageId();
    try {
      await insertPassage({
        id,
        title: 'Untitled',
        composer: null,
        source_kind: 'image',
        source_uri: '',
        thumbnail_uri: null,
        folder_id: targetFolderId,
      });
      const publicUrl = await uploadPassageImage(id, picked.file);
      await updatePassageAssets(id, publicUrl, publicUrl);
      if (picked.previewUrl) URL.revokeObjectURL(picked.previewUrl);
      router.replace(`/passage/${id}/crop`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedView style={{ gap: 14 }}>
          <ThemedText type="title">Add a passage</ThemedText>

          <View style={styles.sourceRow}>
            <Button
              label="Pick from photos"
              onPress={openFilePicker}
              style={{ flex: 1 }}
            />
            <Button
              label="Scan music"
              onPress={openFilePicker}
              style={{ flex: 1 }}
            />
          </View>
          <ThemedText style={{ opacity: 0.55, fontSize: 12, textAlign: 'center' }}>
            Take a photo or screenshot of your sheet music — you&apos;ll crop it to
            just the passage you want to practice next.
          </ThemedText>

          <Pressable
            style={[styles.multiPageBtn, { borderColor: C.icon }]}
            onPress={() =>
              router.push({
                pathname: '/multi-page',
                params: { folder: targetFolderId ?? '' },
              })
            }>
            <ThemedText style={{ opacity: 0.6, fontSize: 13 }}>
              Passage spans two pages?
            </ThemedText>
          </Pressable>

          {picked && (
            <View style={[styles.previewWrap, { borderColor: C.icon }]}>
              <Image
                source={{ uri: picked.previewUrl }}
                style={[styles.preview, { aspectRatio: picked.aspectRatio }]}
                contentFit="contain"
              />
              <Pressable
                style={styles.removeBtn}
                onPress={clearPicked}
                hitSlop={8}>
                <ThemedText style={styles.removeText}>✕</ThemedText>
              </Pressable>
            </View>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </ThemedView>
      </ScrollView>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
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
          <ThemedText style={styles.saveText}>Next: Crop</ThemedText>
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 14 },
  sourceRow: { flexDirection: 'row', gap: 10 },
  multiPageBtn: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  previewWrap: {
    borderWidth: Borders.thin,
    borderRadius: Radii.lg,
    padding: 6,
    position: 'relative',
  },
  preview: {
    width: '100%',
    borderRadius: Radii.sm,
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: Radii.xl,
    backgroundColor: '#c0392b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.md,
  },
  error: {
    color: '#c0392b',
    textAlign: 'center',
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
