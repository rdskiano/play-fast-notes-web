import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { insertDocument } from '@/lib/db/repos/documents';
import { logOnboardingStep } from '@/lib/onboarding/telemetry';
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

// Detect HEIC/HEIF. iOS sometimes reports an empty file.type for HEIC, so the
// filename extension is the reliable signal.
function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;

// Chrome and Firefox have no HEIC codec, so new Image()/canvas can't decode an
// iPhone HEIC at all — re-encoding can't help because the DECODE itself fails.
// Convert HEIC to JPEG first with the libheif WASM decoder, lazily imported so
// its ~1.5 MB only loads when a HEIC is actually picked. (Safari decodes HEIC
// natively, so this branch is for everyone else.)
async function toDisplayableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  const heic2any = (await import('heic2any')).default;
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

// Produce a JPEG page image at the document reference scale, and read its
// dimensions in the same pass. HEIC is decoded to JPEG first (above); then the
// browser-decodable blob is drawn to a canvas so the stored page renders
// everywhere (the old flow re-encoded via the crop canvas; there's no crop step
// now).
async function fileToPageImage(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  const displayable = await toDisplayableBlob(file);
  const url = URL.createObjectURL(displayable);
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
  const params = useLocalSearchParams<{
    folder?: string;
    coach?: string;
    piece?: string;
    source?: string;
  }>();
  const targetFolderId = params.folder ? params.folder : null;
  const coach = params.coach === '1';
  // Guided onboarding sends the source the user picked ("Take a photo" vs
  // "Choose a photo") so we open that picker directly instead of asking again.
  const intent =
    params.source === 'camera'
      ? 'camera'
      : params.source === 'library'
        ? 'library'
        : null;
  // Onboarding asks the piece name up front and passes it here so the photo/page
  // is titled the piece (and the first marked spot can auto-name "<piece> 1").
  const pieceTitle = params.piece?.trim();
  const insets = useSafeAreaInsets();

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

  // Open the picker the user chose in onboarding straight away. Best-effort:
  // iOS Safari blocks a programmatic file-input click that isn't from a direct
  // tap, so the buttons below remain as a one-tap fallback when this no-ops.
  useEffect(() => {
    if (!intent) return;
    if (intent === 'camera') openCamera();
    else openFilePicker();
    // Fire once on mount for the onboarding hand-off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A photo is now a one-PAGE image document: we store the whole page and the
  // user marks as many passage boxes on it as they like (the PDF flow). So we
  // mint an image-backed `documents` row and open the document viewer — no
  // crop step. The viewer's "+ Mark passage" creates each passage from a box.
  async function ingestAsDocument(file: File) {
    // iOS often hands HEIC files with an empty file.type, so fall back to the
    // extension before rejecting.
    if (!file.type.startsWith('image/') && !IMAGE_EXT_RE.test(file.name)) {
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
        title: pieceTitle || defaultTitleFromFile(file),
        composer: null,
        source_kind: 'images',
        page_count: 1,
        pages: [{ index: 1, image_uri: publicUrl, w, h }],
        folder_id: targetFolderId,
      });
      // Coach (guided onboarding): the viewer hands a passage id back to the
      // quiz after the user marks their first box. Non-coach: just open it.
      if (coach) void logOnboardingStep('photo_uploaded');
      router.replace((coach ? `/document/${docId}?coach=1` : `/document/${docId}`) as never);
    } catch (e) {
      const msg = errToMessage(e);
      setError(
        isHeic(file)
          ? `Couldn't read that HEIC photo (${msg}). Try a JPG or PNG, or retake it.`
          : msg,
      );
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
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.column}>
          {/* Big-title header (DESIGN_RULES §3 — left-aligned page title) */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <ThemedText style={styles.backLink}>‹ Back</ThemedText>
            </Pressable>
            <ThemedText type="title">Add a photo</ThemedText>
          </View>

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
                borderColor: dragOver ? Palette.accent : Palette.border,
                backgroundColor: dragOver ? Palette.accentSoft : Palette.surfaceSunk,
                opacity: saving ? 0.5 : 1,
              },
            ]}>
            <Feather name="image" size={28} color={Palette.textMuted} />
            <ThemedText style={styles.dropTitle}>
              Choose a photo of the page
            </ThemedText>
            <ThemedText style={styles.dropSub}>
              tap to pick one — or drag a file here
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
            style={[styles.cameraBtn, { opacity: saving ? 0.5 : 1 }]}>
            <Feather name="camera" size={18} color={Palette.accent} />
            <ThemedText style={styles.cameraBtnText}>
              Take a photo
            </ThemedText>
          </Pressable>

          <ThemedText style={styles.hint}>
            {coach
              ? 'A photo or screenshot of the full page with the spot you want to work on — you’ll mark it right on the page next.'
              : 'A photo or screenshot of the full page — then you’ll mark the spots you want to practice right on it (as many as you like).'}
          </ThemedText>

          <Pressable
            style={styles.multiPageBtn}
            disabled={saving}
            onPress={() =>
              router.push({
                pathname: '/multi-page',
                params: { folder: targetFolderId ?? '' },
              })
            }>
            <ThemedText style={styles.multiPageText}>
              Passage spans two pages?
            </ThemedText>
          </Pressable>

          {saving && (
            <View style={styles.savingRow}>
              <ActivityIndicator color={Palette.accent} />
              <ThemedText style={styles.savingText}>
                {coach ? 'Saving your photo…' : 'Saving photo — opening it up…'}
              </ThemedText>
            </View>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </View>
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
          "You'll land on the page itself; tap \"+ Mark passage\" and draw a box around each spot you want to practice — mark as many as you like. \"Hide boxes\" shows the clean full page anytime.\n\n" +
          "If a spot runs across the bottom of one page and onto the next, tap \"Passage spans two pages?\" to photograph both halves and stitch them into one continuous score."
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing['2xl'], alignItems: 'center' },
  // Centered column on wide screens (iPad / laptop); full width on phone.
  column: { width: '100%', maxWidth: 640, gap: Spacing.lg },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.xs },
  backLink: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, color: Palette.accent },
  dropZone: {
    borderWidth: Borders.medium,
    borderStyle: 'dashed',
    borderColor: Palette.border,
    backgroundColor: Palette.surfaceSunk,
    borderRadius: Radii['2xl'],
    paddingVertical: 48,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  dropTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.bold,
    color: Palette.text,
  },
  dropSub: {
    fontSize: Type.size.sm,
    color: Palette.textMuted,
  },
  cameraBtn: {
    flexDirection: 'row',
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    ...Lift,
  },
  cameraBtnText: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
    color: Palette.accent,
  },
  hint: {
    color: Palette.textMuted,
    fontSize: Type.size.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  multiPageBtn: {
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    alignItems: 'center',
  },
  multiPageText: {
    fontSize: Type.size.sm,
    color: Palette.textSecondary,
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
    color: Palette.textSecondary,
  },
  error: {
    color: Palette.danger,
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
});
