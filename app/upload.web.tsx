import Feather from '@expo/vector-icons/Feather';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PromptModal } from '@/components/PromptModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import type { DocumentPage } from '@/lib/db/repos/documents';
import { insertDocument } from '@/lib/db/repos/documents';
import { fileToPageImage, isHeic } from '@/lib/image/fileToPageImage';
import { logOnboardingStep } from '@/lib/onboarding/telemetry';
import { supabase } from '@/lib/supabase/client';
import { uploadDocumentPageImage } from '@/lib/supabase/storage';

// Dismiss key for the top direction banner. People tap "Take a photo" before
// reading the small hint, so the key instruction (snap the WHOLE page, you'll
// mark spots next) gets a prominent dismissible callout. Remembered so repeat
// users aren't nagged.
const HINT_DISMISS_KEY = 'pfn:upload-hint-dismissed:v1';

// A page the user has picked but not yet saved. `rawUrl` is an object URL for
// the thumbnail preview; `file` is re-encoded to the reference scale at save.
type PickedPage = { id: string; file: File; rawUrl: string };

function newDocId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function newPageId(): string {
  return `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name);
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

  const [pages, setPages] = useState<PickedPage[]>([]);
  // Coach/onboarding pre-fills the title (asked up front); the normal flow names
  // the piece in a prompt at Save time (see namePromptVisible), so there's no
  // inline field to setTitle from.
  const [title] = useState(pieceTitle ?? '');
  // Naming happens in a focused prompt on Save instead of a buried inline field
  // that was easy to miss (→ "Untitled photo"). Mirrors app/multi-page.tsx.
  const [namePromptVisible, setNamePromptVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(HINT_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  function dismissHint() {
    setHintDismissed(true);
    try {
      window.localStorage.setItem(HINT_DISMISS_KEY, '1');
    } catch {
      // private mode / storage disabled — fine, it just shows again next time.
    }
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<View | null>(null);
  // Refs mirror state so the once-bound drop listener + the coach auto-save see
  // current values rather than stale closure captures.
  const coachRef = useRef(coach);
  coachRef.current = coach;

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function openCamera() {
    cameraInputRef.current?.click();
  }

  // Save a multi-page image-document: re-encode each page to the reference
  // scale, upload it, then insert one `documents` row the user marks passage
  // boxes on (the same flow as a PDF). Takes the page list explicitly so the
  // coach auto-save path can pass a freshly-picked file without waiting on a
  // state update.
  async function saveDocument(list: PickedPage[], nameArg?: string) {
    if (list.length === 0) return;
    setSaving(true);
    setError(null);
    const docId = newDocId();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error('Not signed in');
      const docPages: DocumentPage[] = [];
      for (let i = 0; i < list.length; i++) {
        const { blob, w, h } = await fileToPageImage(list[i].file);
        const pageNum = i + 1;
        const publicUrl = await uploadDocumentPageImage(userId, docId, pageNum, blob);
        docPages.push({ index: pageNum, image_uri: publicUrl, w, h });
      }
      await insertDocument({
        id: docId,
        title:
          (nameArg ?? title).trim() || pieceTitle || defaultTitleFromFile(list[0].file),
        composer: null,
        source_kind: 'images',
        page_count: list.length,
        pages: docPages,
        folder_id: targetFolderId,
      });
      // Free the preview object URLs now that we're navigating away.
      list.forEach((p) => URL.revokeObjectURL(p.rawUrl));
      // Coach (guided onboarding): the viewer hands a passage id back to the
      // quiz after the user marks their first box. Non-coach: just open it.
      if (coach) void logOnboardingStep('photo_uploaded');
      router.replace((coach ? `/document/${docId}?coach=1` : `/document/${docId}`) as never);
    } catch (e) {
      const msg = errToMessage(e);
      const heicInList = list.some((p) => isHeic(p.file));
      setError(
        heicInList
          ? `Couldn't read one of those HEIC photos (${msg}). Try a JPG or PNG, or retake it.`
          : msg,
      );
      setSaving(false);
    }
  }

  // Add picked/dropped files to the page list. In coach mode the onboarding
  // wants a single quick photo, so the first valid file saves immediately with
  // the name already collected up front — preserving the old fast path.
  function addFiles(files: File[]) {
    const valid = files.filter(isImageFile);
    if (valid.length === 0) {
      setError('That file isn’t an image. Drop a PNG, JPG, or HEIC.');
      return;
    }
    setError(null);
    if (coachRef.current) {
      const page: PickedPage = {
        id: newPageId(),
        file: valid[0],
        rawUrl: URL.createObjectURL(valid[0]),
      };
      void saveDocument([page]);
      return;
    }
    const added: PickedPage[] = valid.map((file) => ({
      id: newPageId(),
      file,
      rawUrl: URL.createObjectURL(file),
    }));
    // The Save-time name prompt derives its own default from the first page's
    // filename, so no title side-effect is needed here.
    setPages((prev) => [...prev, ...added]);
  }

  function removePage(id: string) {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.rawUrl);
      return prev.filter((p) => p.id !== id);
    });
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

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) addFiles(files);
    // Reset so re-picking the same file re-fires onChange.
    e.target.value = '';
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

  // RN-Web's Pressable doesn't forward HTML drag events, so we wire them on
  // the underlying DOM node directly. The ref is typed as View for the JSX
  // contract but resolves to an HTMLDivElement at runtime on web.
  useEffect(() => {
    const node = dropZoneRef.current as unknown as HTMLDivElement | null;
    if (!node) return;
    function handleDrop(e: DragEvent) {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
      if (files.length) addFiles(files);
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

  const hasPages = pages.length > 0;

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

          {/* Prominent, dismissible direction. The small hint below was missed —
              people tap "Take a photo" first — so the key instruction gets a
              callout right where the eye lands. Hidden in coach onboarding
              (which has its own guidance) and once dismissed. */}
          {!coach && !hintDismissed && (
            <View style={styles.directionCard}>
              <Feather name="info" size={18} color={Palette.accent} style={styles.directionIcon} />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.directionTitle}>Snap the whole page</ThemedText>
                <ThemedText style={styles.directionBody}>
                  Get the full page in frame — you’ll mark the exact spots you want
                  to practice right on it next. More than one page? Add them all and
                  they’ll turn like a PDF.
                </ThemedText>
              </View>
              <Pressable onPress={dismissHint} hitSlop={8} accessibilityLabel="Dismiss">
                <Feather name="x" size={18} color={Palette.textMuted} />
              </Pressable>
            </View>
          )}

          {/* The drop zone IS the picker — click it to open the OS file
              picker, or drag file(s) from Finder/Explorer onto it. */}
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
              {hasPages ? 'Add another page' : 'Choose a photo of the page'}
            </ThemedText>
            <ThemedText style={styles.dropSub}>
              tap to pick — or drag file(s) here
            </ThemedText>
          </Pressable>

          {/* Camera shortcut: snap the page on the music stand. Tapping it
              invokes the hidden `<input capture="environment">` below, which
              iOS/Android route to the rear camera. Desktop ignores `capture`
              and shows a normal file picker, so it stays harmless there. */}
          <Pressable
            onPress={openCamera}
            disabled={saving}
            style={[styles.cameraBtn, { opacity: saving ? 0.5 : 1 }]}>
            <Feather name="camera" size={18} color={Palette.accent} />
            <ThemedText style={styles.cameraBtnText}>
              {hasPages ? 'Take another page' : 'Take a photo'}
            </ThemedText>
          </Pressable>

          {/* Picked pages — order is the page order, like a PDF. */}
          {hasPages && (
            <View style={styles.pagesBlock}>
              <ThemedText style={styles.pagesHeading}>
                {pages.length === 1 ? '1 page' : `${pages.length} pages`} — they’ll
                turn like a PDF
              </ThemedText>
              {pages.map((p, i) => (
                <View key={p.id} style={styles.pageRow}>
                  <Image
                    source={{ uri: p.rawUrl }}
                    style={styles.pageThumb}
                    contentFit="cover"
                  />
                  <ThemedText style={styles.pageLabel}>Page {i + 1}</ThemedText>
                  <View style={styles.pageActions}>
                    <Pressable
                      onPress={() => movePage(p.id, -1)}
                      disabled={i === 0 || saving}
                      hitSlop={6}
                      style={[styles.pageIconBtn, (i === 0 || saving) && styles.pageIconDisabled]}>
                      <Feather name="arrow-up" size={16} color={Palette.text} />
                    </Pressable>
                    <Pressable
                      onPress={() => movePage(p.id, 1)}
                      disabled={i === pages.length - 1 || saving}
                      hitSlop={6}
                      style={[
                        styles.pageIconBtn,
                        (i === pages.length - 1 || saving) && styles.pageIconDisabled,
                      ]}>
                      <Feather name="arrow-down" size={16} color={Palette.text} />
                    </Pressable>
                    <Pressable
                      onPress={() => removePage(p.id)}
                      disabled={saving}
                      hitSlop={6}
                      style={styles.pageIconBtn}>
                      <Feather name="x" size={16} color={Palette.danger} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          <ThemedText style={styles.hint}>
            {coach
              ? 'A photo or screenshot of the full page with the spot you want to work on — you’ll mark it right on the page next.'
              : hasPages
                ? 'Then you’ll mark the spots you want to practice right on each page (as many as you like).'
                : 'A photo or screenshot of the full page — then you’ll mark the spots you want to practice right on it. Add more pages for a multi-page piece.'}
          </ThemedText>

          {!hasPages && (
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
                One passage spans two pages?
              </ThemedText>
            </Pressable>
          )}

          {/* Save — opens a name prompt (coach saves on pick with its own title).
              Naming lives in the prompt so it can't be skipped into an
              "Untitled photo". */}
          {hasPages && !coach && (
            <Pressable
              style={[styles.saveBtn, { opacity: saving ? 0.6 : 1 }]}
              disabled={saving}
              onPress={() => setNamePromptVisible(true)}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.saveBtnText}>
                  Save &amp; name{pages.length > 1 ? ` (${pages.length} pages)` : ''}
                </ThemedText>
              )}
            </Pressable>
          )}

          {saving && coach && (
            <View style={styles.savingRow}>
              <ActivityIndicator color={Palette.accent} />
              <ThemedText style={styles.savingText}>Saving your photo…</ThemedText>
            </View>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </View>
      </ScrollView>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
      {/* `capture="environment"` asks the OS to open the rear camera directly
          on mobile browsers. Desktop browsers ignore it and fall through to the
          standard file picker. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />

      <PromptModal
        visible={namePromptVisible}
        title="Name this piece"
        message="So you can find it in your library."
        initialValue={
          pieceTitle ||
          (pages[0] && defaultTitleFromFile(pages[0].file) !== 'Untitled photo'
            ? defaultTitleFromFile(pages[0].file)
            : '')
        }
        placeholder="e.g. Bach Invention 4, mm. 1–16"
        submitLabel="Save"
        onSubmit={(name) => {
          setNamePromptVisible(false);
          saveDocument(pages, name);
        }}
        onCancel={() => setNamePromptVisible(false)}
      />

      <TutorialStep
        id="upload-passage"
        visible={false}
        title="Add a photo of the page"
        body={
          "Snap or upload a photo of the whole page. Drop an image onto the box, or tap it to choose a file. On phone, \"Take a photo\" opens the camera directly — point at the music and shoot.\n\n" +
          "Adding more than one page? Tap \"Add another page\" (or pick several at once) and they'll turn like a PDF. Use the arrows to reorder, the ✕ to remove a page. Tap Save and give the piece a name.\n\n" +
          "You'll land on the page itself; tap \"+ Mark passage\" and draw a box around each spot you want to practice — mark as many as you like, on any page. \"Hide boxes\" shows the clean full page anytime.\n\n" +
          "If one passage runs across two pages, draw the box on the first page, tap \"Add next page →\", and finish it on the next — the two halves join into one passage."
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
  directionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Palette.accentSoft,
    borderWidth: Borders.thin,
    borderColor: Palette.accent,
    borderRadius: Radii.lg,
    padding: Spacing.md,
  },
  directionIcon: { marginTop: 1 },
  directionTitle: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
    color: Palette.accentDeep,
  },
  directionBody: {
    fontSize: Type.size.sm,
    color: Palette.text,
    lineHeight: 19,
    marginTop: 2,
  },
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
  pagesBlock: {
    gap: Spacing.sm,
  },
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
  pageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  pageIconBtn: {
    width: 34,
    height: 34,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceSunk,
  },
  pageIconDisabled: { opacity: 0.35 },
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
  saveBtn: {
    borderRadius: Radii.lg,
    padding: 18,
    alignItems: 'center',
    backgroundColor: Palette.accent,
  },
  saveBtnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.xl },
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
