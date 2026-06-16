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
import { insertDocument } from '@/lib/db/repos/documents';
import { supabase } from '@/lib/supabase/client';
import { uploadDocumentPageImage } from '@/lib/supabase/storage';

// Match the document/PDF reference render scale so a photo page lives in the
// same coordinate space as PDF pages (regions_json boxes are in these pixels).
const MAX_PAGE_EDGE = 2000;

function newDocId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Pull a readable string out of any thrown value. Supabase/Postgres errors are
// plain objects, so String(e) gives a useless "[object Object]".
function errToMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; error_description?: unknown; details?: unknown };
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.error_description === 'string' && o.error_description) return o.error_description;
    if (typeof o.details === 'string' && o.details) return o.details;
  }
  return String(e);
}

// Camera files (IMG_1234, image, photo) aren't meaningful titles; fall back.
function defaultTitleFromFile(file: File): string {
  const base = (file.name || '').replace(/\.[^/.]+$/, '').trim();
  if (!base || /^(img[_\- ]?\d+|image|photo|untitled|scan)$/i.test(base)) return 'Untitled photo';
  return base.slice(0, 80);
}

// Re-encode the picked photo to a JPEG at the document reference scale, and
// read its dimensions in the same pass. Re-encoding (vs. uploading the raw
// File) guarantees the page renders in every browser — iPhone photos are often
// HEIC, which Chrome/Firefox can't display; the old flow converted via the crop
// canvas, and now there's no crop step.
async function fileToPageImage(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new window.Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Could not read that image.'));
      im.src = url;
    });
    const natW = img.naturalWidth || 1;
    const natH = img.naturalHeight || 1;
    const scale = Math.min(1, MAX_PAGE_EDGE / Math.max(natW, natH));
    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available.');
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))),
        'image/jpeg',
        0.9,
      ),
    );
    return { blob, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function UploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string; coach?: string }>();
  const targetFolderId = params.folder ? params.folder : null;
  const coach = params.coach === '1';
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

  // A photo is now a one-PAGE image document: we store the whole page and the
  // user marks as many passage boxes on it as they like (the PDF flow). So we
  // mint an image-backed `documents` row and open the document viewer — no
  // crop step. The viewer's "+ Mark passage" creates each passage from a box.
  async function ingestAsDocument(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t an image. Drop a PNG, JPG, or HEIC.');
      return;
    }
    setSaving(true);
    setError(null);
    const docId = newDocId();
    try {
      const { blob, w, h } = await fileToPageImage(file);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error('Not signed in');
      const publicUrl = await uploadDocumentPageImage(userId, docId, 1, blob);
      await insertDocument({
        id: docId,
        title: defaultTitleFromFile(file),
        composer: null,
        source_kind: 'images',
        page_count: 1,
        pages: [{ index: 1, image_uri: publicUrl, w, h }],
        folder_id: targetFolderId,
      });
      // Coach (guided onboarding): the viewer hands a passage id back to the
      // quiz after the user marks their first box. Non-coach: just open it.
      router.replace((coach ? `/document/${docId}?coach=1` : `/document/${docId}`) as never);
    } catch (e) {
      setError(errToMessage(e));
      setSaving(false);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await ingestAsDocument(file);
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
      if (file) void ingestAsDocument(file);
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
          <ThemedText type="title">Add a photo</ThemedText>

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
              Drop a photo of the page here
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
            {coach
              ? 'A photo or screenshot of the full page with the spot you want to work on — you’ll mark it right on the page next.'
              : 'A photo or screenshot of the full page — then you’ll mark the spots you want to practice right on it (as many as you like).'}
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
                {coach ? 'Saving your photo…' : 'Saving photo — opening it up…'}
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
        title="Add a photo of the page"
        body={
          "Snap or upload a photo of the whole page. Drop an image onto the box, or tap it to choose a file. On phone, \"Take a photo\" opens the camera directly — point at the music and shoot.\n\n" +
          "You'll land on the page itself; tap \"+ Mark passage\" and draw a box around each spot you want to drill — mark as many as you like. \"Hide boxes\" shows the clean full page anytime.\n\n" +
          "If a spot runs across the bottom of one page and onto the next, tap \"Passage spans two pages?\" to photograph both halves and stitch them into one continuous score."
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
