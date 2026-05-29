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

export default function UploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const targetFolderId = params.folder ? params.folder : null;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<View | null>(null);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function openCamera() {
    cameraInputRef.current?.click();
  }

  // The previous flow required two taps: pick the file → see a preview →
  // tap "Next: Crop" to save and navigate. The preview added no value
  // (the crop screen is the natural next step), so we now save and
  // navigate as soon as a file is in hand — one tap from camera shutter
  // to the crop view.
  async function ingestAndCrop(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t an image. Drop a PNG, JPG, or HEIC.');
      return;
    }
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
      const publicUrl = await uploadPassageImage(id, file);
      await updatePassageAssets(id, publicUrl, publicUrl);
      router.replace(`/passage/${id}/crop`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await ingestAndCrop(file);
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
      if (file) void ingestAndCrop(file);
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
            disabled={saving}
            style={[
              styles.dropZone,
              {
                borderColor: dragOver ? C.tint : C.icon,
                backgroundColor: dragOver ? C.tint + '14' : 'transparent',
                opacity: saving ? 0.5 : 1,
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
            disabled={saving}
            style={[
              styles.cameraBtn,
              { borderColor: C.tint, opacity: saving ? 0.5 : 1 },
            ]}>
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
            disabled={saving}
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

          {saving && (
            <View style={styles.savingRow}>
              <ActivityIndicator color={C.tint} />
              <ThemedText style={[styles.savingText, { color: C.icon }]}>
                Saving photo — opening crop tool…
              </ThemedText>
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

      <TutorialStep
        id="upload-passage"
        visible={false}
        title="Add a passage photo"
        body={
          "Snap or upload a photo of one passage you want to drill. Drop an image onto the box, or tap it to choose a file. On phone, \"Take a photo\" opens the camera directly — point at the music and shoot.\n\n" +
          "You'll land on the crop screen right away; trim it to just the bars you want to practice.\n\n" +
          "If the passage runs across the bottom of one page and onto the next, tap \"Passage spans two pages?\" to photograph both halves and stitch them into one continuous score."
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
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  savingText: {
    fontSize: Type.size.sm,
  },
  error: {
    color: '#c0392b',
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
});
