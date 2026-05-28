import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
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
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<View | null>(null);
  // Keep the latest preview URL in a ref so the drop-zone listeners (which
  // are bound once in useEffect) revoke the *current* URL on re-pick rather
  // than a stale closure capture.
  const pickedPreviewRef = useRef<string | null>(null);
  useEffect(() => {
    pickedPreviewRef.current = picked?.previewUrl ?? null;
  }, [picked]);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function openCamera() {
    cameraInputRef.current?.click();
  }

  async function ingest(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t an image. Drop a PNG, JPG, or HEIC.');
      return;
    }
    if (pickedPreviewRef.current) URL.revokeObjectURL(pickedPreviewRef.current);
    const previewUrl = URL.createObjectURL(file);
    const aspectRatio = await readImageAspectRatio(previewUrl);
    setPicked({ file, previewUrl, aspectRatio });
    setError(null);
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await ingest(file);
    // Reset so re-picking the same file re-fires onChange.
    e.target.value = '';
  }

  // RN-Web's Pressable doesn't forward HTML drag events, so we wire them on
  // the underlying DOM node directly. The ref is typed as View for the JSX
  // contract but resolves to an HTMLDivElement at runtime on web.
  useEffect(() => {
    const node = dropZoneRef.current as unknown as HTMLDivElement | null;
    if (!node) return;
    function handleDrop(e: DragEvent) {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void ingest(file);
    }
    function handleOver(e: DragEvent) {
      e.preventDefault();
      setDragOver(true);
    }
    function handleLeave(e: DragEvent) {
      e.preventDefault();
      setDragOver(false);
    }
    node.addEventListener('drop', handleDrop);
    node.addEventListener('dragover', handleOver);
    node.addEventListener('dragleave', handleLeave);
    return () => {
      node.removeEventListener('drop', handleDrop);
      node.removeEventListener('dragover', handleOver);
      node.removeEventListener('dragleave', handleLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

          {/* The drop zone IS the picker — click it to open the OS file
              picker, or drag a file from Finder/Explorer onto it. Drag-and-
              drop handlers are web-only (HTMLDivElement events) — fine here
              because this whole screen is web-shaped; native imports go
              through a different path. */}
          <Pressable
            ref={dropZoneRef}
            onPress={openFilePicker}
            style={[
              styles.dropZone,
              {
                borderColor: dragOver ? C.tint : C.icon,
                backgroundColor: dragOver ? C.tint + '14' : 'transparent',
              },
            ]}>
            <ThemedText style={styles.dropTitle}>
              Drop an image here
            </ThemedText>
            <ThemedText style={[styles.dropSub, { color: C.icon }]}>
              or click to choose a file
            </ThemedText>
          </Pressable>

          {/* On phones the camera button is the in-lesson shortcut: snap
              the page on the music stand and crop. Tapping it invokes the
              hidden `<input capture="environment">` below, which iOS/
              Android Safari/Chrome route to the rear camera. On desktop
              browsers the `capture` attribute is ignored and the user
              gets a regular file picker — so the button stays harmless
              there too, just less useful. */}
          <Pressable
            onPress={openCamera}
            style={[styles.cameraBtn, { borderColor: C.tint }]}>
            <ThemedText style={[styles.cameraBtnText, { color: C.tint }]}>
              📷  Take a photo
            </ThemedText>
          </Pressable>

          <ThemedText style={{ opacity: 0.55, fontSize: 12, textAlign: 'center' }}>
            A photo or screenshot of your sheet music — you&apos;ll crop it to
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
      {/* `capture="environment"` asks the OS to open the rear camera
          directly on mobile browsers. Desktop browsers ignore it and
          fall through to the standard file picker — same behavior as
          the regular input, just an extra entry point. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
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

      <TutorialStep
        id="upload-passage"
        visible={false}
        title="Add a passage photo"
        body={
          "Snap or upload a photo of one passage you want to drill. On phone, the camera opens directly — point at the music and shoot.\n\n" +
          "Don't worry about getting the crop perfect here; you'll trim it on the next screen."
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 14 },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: Radii.lg,
    paddingVertical: 48,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dropTitle: {
    fontSize: Type.size.lg,
    fontWeight: Type.weight.bold,
  },
  dropSub: {
    fontSize: Type.size.sm,
  },
  cameraBtn: {
    borderWidth: 2,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBtnText: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
  },
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
