import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InlineCropper } from '@/components/InlineCropper';
import { PromptModal } from '@/components/PromptModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { insertPassage, renamePassage, updatePassageAssets } from '@/lib/db/repos/passages';
import { stitchVertically } from '@/lib/image/canvasCrop';
import { uploadPassageImage } from '@/lib/supabase/storage';

type Step = 'pick' | 'crop_1' | 'crop_2' | 'preview';
type PageNum = 1 | 2;
type CroppedPage = {
  url: string;
  w: number;
  h: number;
  blob: Blob;
  /** Natural pixel width of the *source page* this crop came from. The
   *  stitcher uses this to scale each crop by `pageScale / srcW` so a
   *  narrow crop from page 2 doesn't get blown up to match a wide crop
   *  from page 1. */
  srcW: number;
};

function newPassageId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function MultiPageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const targetFolderId = params.folder ? params.folder : null;
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('pick');
  const [rawUrl1, setRawUrl1] = useState<string | null>(null);
  const [rawUrl2, setRawUrl2] = useState<string | null>(null);
  const [cropped1, setCropped1] = useState<CroppedPage | null>(null);
  const [cropped2, setCropped2] = useState<CroppedPage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [namePromptVisible, setNamePromptVisible] = useState(false);
  const [savedPassageId, setSavedPassageId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPageRef = useRef<PageNum>(1);
  const dropZoneRef = useRef<View | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Mirror the latest rawUrl* into refs so the drop listener (bound once per
  // step in useEffect) revokes the *current* preview URL rather than a stale
  // closure capture from when the effect first ran.
  const rawUrl1Ref = useRef<string | null>(null);
  const rawUrl2Ref = useRef<string | null>(null);
  useEffect(() => {
    rawUrl1Ref.current = rawUrl1;
  }, [rawUrl1]);
  useEffect(() => {
    rawUrl2Ref.current = rawUrl2;
  }, [rawUrl2]);

  function openFilePicker(page: PageNum) {
    pendingPageRef.current = page;
    fileInputRef.current?.click();
  }

  function ingest(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t an image. Drop a PNG, JPG, or HEIC.');
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    if (pendingPageRef.current === 1) {
      if (rawUrl1Ref.current) URL.revokeObjectURL(rawUrl1Ref.current);
      setRawUrl1(url);
    } else {
      if (rawUrl2Ref.current) URL.revokeObjectURL(rawUrl2Ref.current);
      setRawUrl2(url);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    ingest(file);
    e.target.value = '';
  }

  // RN-Web's Pressable doesn't forward HTML drag events, so we wire them on
  // the underlying DOM node. Rebound whenever the missing page changes so a
  // drop without a prior click still routes to the right slot.
  useEffect(() => {
    if (step !== 'pick') return;
    const missing: PageNum | null = !rawUrl1 ? 1 : !rawUrl2 ? 2 : null;
    if (!missing) return;
    pendingPageRef.current = missing;
    const node = dropZoneRef.current as unknown as HTMLDivElement | null;
    if (!node) return;
    function handleDrop(e: DragEvent) {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) ingest(file);
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
  }, [step, rawUrl1, rawUrl2]);

  function clearPicked(page: PageNum) {
    if (page === 1) {
      if (rawUrl1) URL.revokeObjectURL(rawUrl1);
      setRawUrl1(null);
    } else {
      if (rawUrl2) URL.revokeObjectURL(rawUrl2);
      setRawUrl2(null);
    }
  }

  async function handleCropDone(
    blob: Blob,
    dims: { w: number; h: number },
    srcDims: { w: number; h: number },
    page: PageNum,
  ) {
    const url = URL.createObjectURL(blob);
    const cropped: CroppedPage = {
      url,
      w: dims.w,
      h: dims.h,
      blob,
      srcW: srcDims.w,
    };
    if (page === 1) {
      if (cropped1?.url) URL.revokeObjectURL(cropped1.url);
      setCropped1(cropped);
      setStep('crop_2');
    } else {
      if (cropped2?.url) URL.revokeObjectURL(cropped2.url);
      setCropped2(cropped);
      setStep('preview');
    }
  }

  // Back out of crop → return to the unified pick step. Keep both raw URLs so
  // the user doesn't have to re-drop the pages they already chose.
  function handleCropCancel(_page: PageNum) {
    setStep('pick');
  }

  function swapOrder() {
    const a = cropped1;
    const b = cropped2;
    setCropped1(b);
    setCropped2(a);
  }

  function redoPage(page: PageNum) {
    if (page === 1) {
      if (cropped1?.url) URL.revokeObjectURL(cropped1.url);
      if (rawUrl1) URL.revokeObjectURL(rawUrl1);
      setCropped1(null);
      setRawUrl1(null);
    } else {
      if (cropped2?.url) URL.revokeObjectURL(cropped2.url);
      if (rawUrl2) URL.revokeObjectURL(rawUrl2);
      setCropped2(null);
      setRawUrl2(null);
    }
    setStep('pick');
  }

  async function saveComposite() {
    if (!cropped1 || !cropped2) return;
    setSaving(true);
    setError(null);
    const id = newPassageId();
    try {
      const compositeBlob = await stitchVertically(
        [cropped1.blob, cropped2.blob],
        { srcWidths: [cropped1.srcW, cropped2.srcW] },
      );
      await insertPassage({
        id,
        title: 'Untitled',
        composer: null,
        source_kind: 'image',
        source_uri: '',
        thumbnail_uri: null,
        folder_id: targetFolderId,
      });
      const file = new File([compositeBlob], `${id}.jpg`, { type: 'image/jpeg' });
      const publicUrl = await uploadPassageImage(id, file);
      await updatePassageAssets(id, publicUrl, publicUrl);
      setSavedPassageId(id);
      setNamePromptVisible(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleName(name: string) {
    if (!savedPassageId) return;
    setNamePromptVisible(false);
    const trimmed = name.trim();
    if (trimmed) {
      try {
        await renamePassage(savedPassageId, trimmed);
      } catch {
        // ignore — fall through to navigation anyway
      }
    }
    // Pop both modals (/upload and /multi-page) so back from the passage detail
    // returns the user to /library — not back into the upload flow.
    router.dismissAll();
    router.push(`/passage/${savedPassageId}`);
  }

  function renderPickStep() {
    // Drop zone targets whichever page is still missing. Once both are
    // dropped it disappears and the previews + Next button take over.
    const missing: PageNum | null = !rawUrl1 ? 1 : !rawUrl2 ? 2 : null;
    const bothDropped = !!rawUrl1 && !!rawUrl2;
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.pickContent}>
          <ThemedText style={styles.pickHint}>
            {bothDropped
              ? 'Both pages in. Tap Next to crop each one.'
              : missing === 1
                ? 'Drop the first page of the passage.'
                : 'Now drop the second page.'}
          </ThemedText>

          {missing && (
            <Pressable
              ref={dropZoneRef}
              onPress={() => openFilePicker(missing)}
              style={[
                styles.dropZone,
                {
                  borderColor: dragOver ? Palette.accent : Palette.border,
                  backgroundColor: dragOver ? Palette.accentSoft : Palette.surfaceSunk,
                },
              ]}>
              <ThemedText style={styles.dropTitle}>
                Drop page {missing} here
              </ThemedText>
              <ThemedText style={styles.dropSub}>
                or click to choose a file
              </ThemedText>
            </Pressable>
          )}

          {rawUrl1 && (
            <PickedPreview
              label="Page 1"
              uri={rawUrl1}
              onRemove={() => clearPicked(1)}
            />
          )}
          {rawUrl2 && (
            <PickedPreview
              label="Page 2"
              uri={rawUrl2}
              onRemove={() => clearPicked(2)}
            />
          )}
        </ScrollView>
        {bothDropped && (
          <Pressable
            style={styles.saveBtn}
            onPress={() => setStep('crop_1')}>
            <ThemedText style={styles.saveBtnText}>Next: Crop pages</ThemedText>
          </Pressable>
        )}
      </View>
    );
  }

  function renderPreview() {
    if (!cropped1 || !cropped2) return null;
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.previewScroll}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            Stacked preview
          </ThemedText>
          <ThemedText style={[styles.pickHint, { textAlign: 'center' }]}>
            This is how the two pages will look combined.
          </ThemedText>
          {/* Mirror the relative-scale stitch the save step will produce: each
              crop occupies (cropW / srcW) of the preview width, so the user
              sees the final layout (narrow page 2 → narrow band centered with
              white margins) before they commit. */}
          {(() => {
            const f1 = cropped1.w / Math.max(1, cropped1.srcW);
            const f2 = cropped2.w / Math.max(1, cropped2.srcW);
            const fMax = Math.max(f1, f2);
            return (
              <View style={styles.previewWrap}>
                <View style={{ alignItems: 'center' }}>
                  <Image
                    source={{ uri: cropped1.url }}
                    style={{
                      width: `${(f1 / fMax) * 100}%`,
                      aspectRatio: cropped1.w / cropped1.h,
                    }}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.divider} />
                <View style={{ alignItems: 'center' }}>
                  <Image
                    source={{ uri: cropped2.url }}
                    style={{
                      width: `${(f2 / fMax) * 100}%`,
                      aspectRatio: cropped2.w / cropped2.h,
                    }}
                    contentFit="contain"
                  />
                </View>
              </View>
            );
          })()}
          <View style={styles.previewActions}>
            <Pressable style={styles.actionBtn} onPress={swapOrder}>
              <ThemedText style={styles.actionBtnText}>Swap order</ThemedText>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => redoPage(1)}>
              <ThemedText style={styles.actionBtnText}>Redo page 1</ThemedText>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => redoPage(2)}>
              <ThemedText style={styles.actionBtnText}>Redo page 2</ThemedText>
            </Pressable>
          </View>
          {error && (
            <ThemedText style={[styles.error, { textAlign: 'center' }]}>
              {error}
            </ThemedText>
          )}
        </ScrollView>
        <Pressable
          style={styles.saveBtn}
          disabled={saving}
          onPress={saveComposite}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.saveBtnText}>Save</ThemedText>
          )}
        </Pressable>

        <PromptModal
          visible={namePromptVisible}
          title="Name this passage"
          message="Pick something specific so you can recognize it in your practice log — like a measure number, section name, or a fun label. Keep it positive!"
          placeholder="e.g. mm. 32-40, Coda, The Tricky Run"
          submitLabel="Save"
          onSubmit={handleName}
          onCancel={() => handleName('')}
        />
      </View>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={styles.backLink}>‹ Back</ThemedText>
        </Pressable>
        <ThemedText type="title">Two-page passage</ThemedText>
      </View>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />

      {step === 'pick' && renderPickStep()}
      {step === 'preview' && renderPreview()}
      {step === 'crop_1' && rawUrl1 && (
        <InlineCropper
          imageUrl={rawUrl1}
          hint="Crop to just the passage on this page"
          saveLabel="Next"
          onCrop={(blob, dims, srcDims) => handleCropDone(blob, dims, srcDims, 1)}
          onCancel={() => handleCropCancel(1)}
        />
      )}
      {step === 'crop_2' && rawUrl2 && (
        <InlineCropper
          imageUrl={rawUrl2}
          hint="Crop to just the passage on this page"
          saveLabel="Done"
          onCrop={(blob, dims, srcDims) => handleCropDone(blob, dims, srcDims, 2)}
          onCancel={() => handleCropCancel(2)}
        />
      )}

      <TutorialStep
        id="upload-multipage"
        visible={false}
        title="Two-page passage"
        body={
          "When a passage spans the end of one page and the start of the next, snap each half separately and the app stitches them into one continuous score.\n\n" +
          "Pick or drop page 1, then page 2 (each preview has a ✕ to remove it and re-pick; Cancel backs out of the whole flow). When both are in, tap \"Next: Crop pages.\"\n\n" +
          "Crop each photo to just the passage portion of that page — \"Next\" advances from page 1 to page 2, \"Done\" finishes.\n\n" +
          "On the stacked preview you'll see how the two halves combine. \"Swap order\" flips which page is on top; \"Redo page 1\" / \"Redo page 2\" sends you back to re-pick and re-crop that half. Tap \"Save\" to stitch and store it — you'll be prompted to name the passage."
        }
      />
    </ThemedView>
  );
}

function PickedPreview({
  label,
  uri,
  onRemove,
}: {
  label: string;
  uri: string;
  onRemove: () => void;
}) {
  return (
    <View style={styles.previewCard}>
      <ThemedText style={styles.previewLabel}>{label}</ThemedText>
      <View style={styles.previewWrap}>
        <Image
          source={{ uri }}
          style={{ width: '100%', height: 160, borderRadius: Radii.sm }}
          contentFit="contain"
        />
        <Pressable
          style={styles.removeBtn}
          onPress={onRemove}
          hitSlop={8}>
          <Feather name="x" size={16} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  backLink: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
  },
  pickContent: { flexGrow: 1, padding: Spacing.xl, gap: Spacing.lg, justifyContent: 'center' },
  pickHint: {
    color: Palette.textSecondary,
    fontSize: Type.size.sm,
    textAlign: 'center',
  },
  dropZone: {
    borderWidth: Borders.thick,
    borderStyle: 'dashed',
    borderRadius: Radii.lg,
    paddingVertical: 48,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dropTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xl,
    fontWeight: Type.weight.bold,
    color: Palette.text,
  },
  dropSub: { fontSize: Type.size.md, color: Palette.textMuted },
  previewCard: { gap: Spacing.xs },
  previewLabel: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
    color: Palette.textSecondary,
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.danger,
  },
  previewScroll: { padding: Spacing.lg, gap: Spacing.md },
  previewWrap: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    padding: 6,
    overflow: 'hidden',
    ...Lift,
  },
  divider: { height: 2, marginVertical: 2, backgroundColor: Palette.border },
  previewActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  actionBtn: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  actionBtnText: {
    fontWeight: Type.weight.semibold,
    color: Palette.text,
  },
  error: {
    color: Palette.danger,
    fontSize: Type.size.sm,
  },
  saveBtn: {
    margin: Spacing.lg,
    borderRadius: Radii.lg,
    padding: 18,
    alignItems: 'center',
    backgroundColor: Palette.accent,
  },
  saveBtnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.xl },
});
