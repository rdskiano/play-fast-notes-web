import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { InlineCropper } from '@/components/InlineCropper';
import { PromptModal } from '@/components/PromptModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { insertPassage, renamePassage, updatePassageAssets } from '@/lib/db/repos/passages';
import { stitchVertically } from '@/lib/image/canvasCrop';
import { uploadPassageImage } from '@/lib/supabase/storage';

type Step = 'pick_1' | 'crop_1' | 'pick_2' | 'crop_2' | 'preview';
type PageNum = 1 | 2;
type CroppedPage = { url: string; w: number; h: number; blob: Blob };

function newPassageId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function MultiPageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const targetFolderId = params.folder ? params.folder : null;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [step, setStep] = useState<Step>('pick_1');
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

  function openFilePicker(page: PageNum) {
    pendingPageRef.current = page;
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (pendingPageRef.current === 1) {
      if (rawUrl1) URL.revokeObjectURL(rawUrl1);
      setRawUrl1(url);
    } else {
      if (rawUrl2) URL.revokeObjectURL(rawUrl2);
      setRawUrl2(url);
    }
    e.target.value = '';
  }

  function clearPicked(page: PageNum) {
    if (page === 1) {
      if (rawUrl1) URL.revokeObjectURL(rawUrl1);
      setRawUrl1(null);
    } else {
      if (rawUrl2) URL.revokeObjectURL(rawUrl2);
      setRawUrl2(null);
    }
  }

  function goToCrop(page: PageNum) {
    setStep(page === 1 ? 'crop_1' : 'crop_2');
  }

  async function handleCropDone(blob: Blob, dims: { w: number; h: number }, page: PageNum) {
    const url = URL.createObjectURL(blob);
    const cropped: CroppedPage = { url, w: dims.w, h: dims.h, blob };
    if (page === 1) {
      if (cropped1?.url) URL.revokeObjectURL(cropped1.url);
      setCropped1(cropped);
      setStep('pick_2');
    } else {
      if (cropped2?.url) URL.revokeObjectURL(cropped2.url);
      setCropped2(cropped);
      setStep('preview');
    }
  }

  function handleCropCancel(page: PageNum) {
    if (page === 1) {
      if (rawUrl1) URL.revokeObjectURL(rawUrl1);
      setRawUrl1(null);
      setStep('pick_1');
    } else {
      if (rawUrl2) URL.revokeObjectURL(rawUrl2);
      setRawUrl2(null);
      setStep('pick_2');
    }
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
      setStep('pick_1');
    } else {
      if (cropped2?.url) URL.revokeObjectURL(cropped2.url);
      if (rawUrl2) URL.revokeObjectURL(rawUrl2);
      setCropped2(null);
      setRawUrl2(null);
      setStep('pick_2');
    }
  }

  async function saveComposite() {
    if (!cropped1 || !cropped2) return;
    setSaving(true);
    setError(null);
    const id = newPassageId();
    try {
      const compositeBlob = await stitchVertically([cropped1.blob, cropped2.blob]);
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

  function renderPickStep(page: PageNum) {
    const picked = page === 1 ? rawUrl1 : rawUrl2;
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.pickContent}>
          <ThemedText type="title" style={{ textAlign: 'center' }}>
            {page === 1 ? 'Page 1 of 2' : 'Page 2 of 2'}
          </ThemedText>
          <ThemedText style={{ opacity: 0.55, fontSize: 13, textAlign: 'center' }}>
            {page === 1
              ? 'Start with the first page of the passage.'
              : 'Now get the second page.'}
          </ThemedText>
          <View style={styles.sourceRow}>
            <Pressable
              style={[styles.sourceBtn, { backgroundColor: C.tint }]}
              onPress={() => openFilePicker(page)}>
              <ThemedText style={styles.sourceBtnText}>Scan music</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.sourceBtnOutline, { borderColor: C.tint }]}
              onPress={() => openFilePicker(page)}>
              <ThemedText style={{ color: C.tint, fontWeight: '600' }}>
                Pick from photos
              </ThemedText>
            </Pressable>
          </View>
          {picked ? (
            <>
              <ThemedText style={{ opacity: 0.7, fontSize: 13 }}>
                Image selected — tap &quot;Next: Crop&quot; below.
              </ThemedText>
              <View style={[styles.previewWrap, { borderColor: C.icon }]}>
                <Image
                  source={{ uri: picked }}
                  style={{ width: '100%', height: 200, borderRadius: 8 }}
                  contentFit="contain"
                />
                <Pressable
                  style={[styles.removeBtn, { backgroundColor: '#c0392b' }]}
                  onPress={() => clearPicked(page)}
                  hitSlop={8}>
                  <ThemedText style={styles.removeText}>✕</ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <ThemedText style={{ opacity: 0.4, fontSize: 12, textAlign: 'center' }}>
              No image selected yet.
            </ThemedText>
          )}
          {page === 1 && (
            <Pressable onPress={() => router.back()} style={styles.cancelLink}>
              <ThemedText style={{ color: C.tint }}>Cancel</ThemedText>
            </Pressable>
          )}
        </ScrollView>
        {picked && (
          <Pressable
            style={[styles.saveBtn, { backgroundColor: C.tint }]}
            onPress={() => goToCrop(page)}>
            <ThemedText style={styles.saveBtnText}>Next: Crop</ThemedText>
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
          <ThemedText style={{ opacity: 0.55, fontSize: 13, textAlign: 'center' }}>
            This is how the two pages will look combined.
          </ThemedText>
          <View style={[styles.previewWrap, { borderColor: C.icon }]}>
            <Image
              source={{ uri: cropped1.url }}
              style={{ width: '100%', aspectRatio: cropped1.w / cropped1.h }}
              contentFit="contain"
            />
            <View style={[styles.divider, { backgroundColor: C.icon }]} />
            <Image
              source={{ uri: cropped2.url }}
              style={{ width: '100%', aspectRatio: cropped2.w / cropped2.h }}
              contentFit="contain"
            />
          </View>
          <View style={styles.previewActions}>
            <Pressable
              style={[styles.actionBtn, { borderColor: C.icon }]}
              onPress={swapOrder}>
              <ThemedText style={{ fontWeight: '600' }}>Swap order</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { borderColor: C.icon }]}
              onPress={() => redoPage(1)}>
              <ThemedText style={{ fontWeight: '600' }}>Redo page 1</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { borderColor: C.icon }]}
              onPress={() => redoPage(2)}>
              <ThemedText style={{ fontWeight: '600' }}>Redo page 2</ThemedText>
            </Pressable>
          </View>
          {error && (
            <ThemedText style={{ color: '#c0392b', fontSize: 13, textAlign: 'center' }}>
              {error}
            </ThemedText>
          )}
        </ScrollView>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: C.tint }]}
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
      <Stack.Screen options={{ title: 'Two-page passage' }} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />

      {step === 'pick_1' && renderPickStep(1)}
      {step === 'pick_2' && renderPickStep(2)}
      {step === 'preview' && renderPreview()}
      {step === 'crop_1' && rawUrl1 && (
        <InlineCropper
          imageUrl={rawUrl1}
          hint="Crop to just the passage on this page"
          saveLabel="Next"
          onCrop={(blob, dims) => handleCropDone(blob, dims, 1)}
          onCancel={() => handleCropCancel(1)}
        />
      )}
      {step === 'crop_2' && rawUrl2 && (
        <InlineCropper
          imageUrl={rawUrl2}
          hint="Crop to just the passage on this page"
          saveLabel="Done"
          onCrop={(blob, dims) => handleCropDone(blob, dims, 2)}
          onCancel={() => handleCropCancel(2)}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  pickContent: { flexGrow: 1, padding: 24, gap: 16, justifyContent: 'center' },
  sourceRow: { flexDirection: 'row', gap: 10 },
  sourceBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  sourceBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  sourceBtnOutline: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
  },
  cancelLink: { alignSelf: 'center', paddingVertical: 8 },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  previewScroll: { padding: 20, gap: 14 },
  previewWrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 6,
    overflow: 'hidden',
  },
  divider: { height: 2, marginVertical: 2 },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  saveBtn: {
    margin: 20,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 18 },
});
