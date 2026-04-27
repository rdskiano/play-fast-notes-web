import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { insertPiece, updatePieceAssets } from '@/lib/db/repos/pieces';
import { uploadPieceImage } from '@/lib/supabase/storage';

function newPieceId(): string {
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
  const folderId = params.folder ? params.folder : null;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // We render a hidden <input type="file"> on web and trigger it from a Pressable.
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function openFilePicker() {
    if (Platform.OS !== 'web') return;
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (picked?.previewUrl) URL.revokeObjectURL(picked.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    const aspectRatio = await readImageAspectRatio(previewUrl);
    setPicked({ file, previewUrl, aspectRatio });
  }

  function clearPicked() {
    if (picked?.previewUrl) URL.revokeObjectURL(picked.previewUrl);
    setPicked(null);
  }

  const canSave = title.trim().length > 0 && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const id = newPieceId();
    try {
      // Insert piece first (no image yet) so it appears in the library even if
      // upload fails or stalls. We then upload the image and patch the URLs.
      await insertPiece({
        id,
        title: title.trim(),
        composer: composer.trim() || null,
        source_kind: 'image',
        source_uri: '',
        thumbnail_uri: null,
        folder_id: folderId,
      });

      if (picked) {
        const publicUrl = await uploadPieceImage(id, picked.file);
        // For v1, source and thumbnail point at the same URL. Browsers
        // downscale efficiently for the 72px thumbnail; bandwidth cost is
        // minor for a testing surface. Server-side thumbnail generation
        // can come later.
        await updatePieceAssets(id, publicUrl, publicUrl);
      }

      if (picked?.previewUrl) URL.revokeObjectURL(picked.previewUrl);
      router.replace('/library');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled">
      <ThemedView style={styles.card}>
        <ThemedText type="title" style={{ textAlign: 'center' }}>
          Add a piece
        </ThemedText>

        <View style={{ gap: Spacing.sm }}>
          <ThemedText style={styles.label}>Title</ThemedText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Bach Invention No. 1"
            placeholderTextColor={C.icon}
            autoCapitalize="words"
            style={[
              styles.input,
              { borderColor: C.icon, color: C.text, backgroundColor: C.background },
            ]}
            editable={!saving}
          />
        </View>

        <View style={{ gap: Spacing.sm }}>
          <ThemedText style={styles.label}>Composer (optional)</ThemedText>
          <TextInput
            value={composer}
            onChangeText={setComposer}
            placeholder="e.g. J.S. Bach"
            placeholderTextColor={C.icon}
            autoCapitalize="words"
            style={[
              styles.input,
              { borderColor: C.icon, color: C.text, backgroundColor: C.background },
            ]}
            editable={!saving}
          />
        </View>

        <View style={{ gap: Spacing.sm }}>
          <ThemedText style={styles.label}>Sheet music image (optional)</ThemedText>
          {!picked ? (
            <Pressable
              onPress={openFilePicker}
              disabled={saving}
              style={[styles.dropzone, { borderColor: C.icon }]}>
              <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
                Choose an image…
              </ThemedText>
              <ThemedText style={{ color: C.icon, fontSize: Type.size.xs }}>
                PNG, JPG, or screenshot of your music
              </ThemedText>
            </Pressable>
          ) : (
            <View style={[styles.previewWrap, { borderColor: C.icon }]}>
              <Image
                source={{ uri: picked.previewUrl }}
                style={[styles.preview, { aspectRatio: picked.aspectRatio }]}
                contentFit="contain"
              />
              <View style={styles.previewActions}>
                <Button
                  label="Replace"
                  variant="outline"
                  size="sm"
                  onPress={openFilePicker}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Remove"
                  variant="outline"
                  size="sm"
                  onPress={clearPicked}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}
          {/*
            Hidden file input. React Native Web does not have a native file
            picker, so we drop down to a regular HTML input and trigger it
            from the Pressable above.
          */}
          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
          )}
        </View>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <View style={styles.row}>
          <Button
            label="Cancel"
            variant="outline"
            onPress={() => router.back()}
            style={{ flex: 1 }}
          />
          <Button
            label={saving ? 'Saving…' : 'Save'}
            onPress={onSave}
            disabled={!canSave}
            style={{ flex: 1 }}
          />
        </View>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    gap: Spacing.lg,
  },
  label: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    opacity: 0.8,
  },
  input: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Type.size.lg,
  },
  dropzone: {
    borderWidth: Borders.medium,
    borderRadius: Radii.md,
    borderStyle: 'dashed',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  previewWrap: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
    opacity: 1,
  },
  preview: {
    width: '100%',
    maxHeight: 400,
    borderRadius: Radii.sm,
  },
  previewActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  error: {
    color: '#c0392b',
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
});
