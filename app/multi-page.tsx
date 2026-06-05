// Native "two-page passage" flow.
//
// When a passage runs across the bottom of one page and onto the top of the
// next, the user photographs each half, crops each to just the passage, and we
// stitch the two crops into one continuous score image — then create a normal
// photo passage from it (local-first, syncs when signed in).
//
// Mirrors the web flow (multi-page.web.tsx): pick → crop → pick → crop →
// preview → save. Building blocks: expo-image-picker (pick/snap), CropView
// (native crop), stitchVerticallyUris (native view-shot stitcher), and
// addPhotoPassage (the same create path the single-photo flow uses).

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { CropView } from '@/components/CropView';
import { PromptModal } from '@/components/PromptModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { stitchVerticallyUris } from '@/lib/image/canvasCrop';
import { addPhotoPassage } from '@/lib/photo/addPhotoPassage';

type Step = 'pick1' | 'crop1' | 'pick2' | 'crop2' | 'preview';

export default function MultiPageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const folderId = params.folder ? params.folder : null;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [step, setStep] = useState<Step>('pick1');
  const [raw, setRaw] = useState<string | null>(null); // image waiting to be cropped
  const [cropped1, setCropped1] = useState<string | null>(null);
  const [cropped2, setCropped2] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [namePromptVisible, setNamePromptVisible] = useState(false);
  // The stitched image, held between Save (stitch) and the name prompt.
  const [stitchedUri, setStitchedUri] = useState<string | null>(null);

  const pageNum = step === 'pick1' || step === 'crop1' ? 1 : 2;

  async function pickFrom(source: 'library' | 'camera') {
    setError(null);
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(
        source === 'camera'
          ? 'Camera access is needed to take a photo. Enable it in Settings.'
          : 'Photo access is needed to choose a photo. Enable it in Settings.',
      );
      return;
    }
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setRaw(res.assets[0].uri);
    setStep(pageNum === 1 ? 'crop1' : 'crop2');
  }

  function onCropDone(uri: string) {
    setRaw(null);
    if (step === 'crop1') {
      setCropped1(uri);
      setStep('pick2');
    } else {
      setCropped2(uri);
      setStep('preview');
    }
  }

  function onCropCancel() {
    setRaw(null);
    setStep(step === 'crop1' ? 'pick1' : 'pick2');
  }

  function swapOrder() {
    setCropped1(cropped2);
    setCropped2(cropped1);
  }

  function redoPage(page: 1 | 2) {
    if (page === 1) setCropped1(null);
    else setCropped2(null);
    setRaw(null);
    setStep(page === 1 ? 'pick1' : 'pick2');
  }

  async function onSave() {
    if (!cropped1 || !cropped2) return;
    setSaving(true);
    setError(null);
    try {
      const stitched = await stitchVerticallyUris([cropped1, cropped2]);
      setStitchedUri(stitched);
      setNamePromptVisible(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleName(name: string) {
    setNamePromptVisible(false);
    if (!stitchedUri) return;
    setSaving(true);
    try {
      const { passageId } = await addPhotoPassage({
        imageUri: stitchedUri,
        title: name.trim() || 'Untitled',
        folderId,
      });
      // Pop the upload + multi-page modals so Back from the passage lands on
      // the library, not back in this flow.
      router.dismissAll();
      router.push(`/passage/${passageId}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  // ── Crop steps ────────────────────────────────────────────────────────────
  if ((step === 'crop1' || step === 'crop2') && raw) {
    return (
      <CropView
        imageUri={raw}
        hint={`Crop page ${pageNum} to just the passage`}
        onCrop={onCropDone}
        onCancel={onCropCancel}
      />
    );
  }

  // ── Pick steps ────────────────────────────────────────────────────────────
  if (step === 'pick1' || step === 'pick2') {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: 'Two-page passage' }} />
        <ThemedText type="title" style={{ textAlign: 'center' }}>
          Two-page passage
        </ThemedText>
        <ThemedText style={styles.body}>
          {pageNum === 1
            ? 'Photograph the first page of the passage. You can crop it on the next screen.'
            : 'Now photograph the second page — the part that continues onto the next page.'}
        </ThemedText>

        {cropped1 && pageNum === 2 && (
          <View style={styles.miniRow}>
            <ThemedText style={[styles.miniLabel, { color: C.icon }]}>Page 1 ✓</ThemedText>
            <Image source={{ uri: cropped1 }} style={styles.mini} contentFit="contain" />
          </View>
        )}

        <Pressable style={[styles.btn, { backgroundColor: C.tint }]} onPress={() => pickFrom('library')}>
          <ThemedText style={styles.btnText}>Choose photo</ThemedText>
        </Pressable>
        <Pressable style={[styles.btn, { backgroundColor: C.tint }]} onPress={() => pickFrom('camera')}>
          <ThemedText style={styles.btnText}>Take photo</ThemedText>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.cancelLink}>
          <ThemedText style={{ color: C.tint }}>Cancel</ThemedText>
        </Pressable>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      </ThemedView>
    );
  }

  // ── Preview / save ────────────────────────────────────────────────────────
  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Two-page passage' }} />
      <ScrollView contentContainerStyle={styles.previewScroll}>
        <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
          Stacked preview
        </ThemedText>
        <ThemedText style={{ opacity: 0.55, fontSize: 13, textAlign: 'center' }}>
          This is how the two pages will combine into one passage.
        </ThemedText>
        <View style={[styles.previewWrap, { borderColor: C.icon }]}>
          {cropped1 && (
            <Image source={{ uri: cropped1 }} style={styles.previewImg} contentFit="contain" />
          )}
          <View style={[styles.divider, { backgroundColor: C.icon }]} />
          {cropped2 && (
            <Image source={{ uri: cropped2 }} style={styles.previewImg} contentFit="contain" />
          )}
        </View>
        <View style={styles.previewActions}>
          <Pressable style={[styles.actionBtn, { borderColor: C.icon }]} onPress={swapOrder}>
            <ThemedText style={{ fontWeight: '600' }}>Swap order</ThemedText>
          </Pressable>
          <Pressable style={[styles.actionBtn, { borderColor: C.icon }]} onPress={() => redoPage(1)}>
            <ThemedText style={{ fontWeight: '600' }}>Redo page 1</ThemedText>
          </Pressable>
          <Pressable style={[styles.actionBtn, { borderColor: C.icon }]} onPress={() => redoPage(2)}>
            <ThemedText style={{ fontWeight: '600' }}>Redo page 2</ThemedText>
          </Pressable>
        </View>
        {error && (
          <ThemedText style={[styles.error, { textAlign: 'center' }]}>{error}</ThemedText>
        )}
      </ScrollView>
      <Pressable
        style={[styles.saveBtn, { backgroundColor: C.tint }]}
        disabled={saving}
        onPress={onSave}>
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: Spacing.md, justifyContent: 'center' },
  body: { fontSize: Type.size.md, lineHeight: 24, opacity: 0.7, textAlign: 'center' },
  btn: { borderRadius: Radii.lg, padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.lg },
  cancelLink: { alignSelf: 'center', paddingVertical: 8 },
  error: { color: '#c0392b', fontSize: Type.size.sm },
  miniRow: { alignItems: 'center', gap: 4 },
  miniLabel: { fontSize: Type.size.xs, fontWeight: Type.weight.bold },
  mini: { width: '70%', height: 90, borderRadius: 8 },
  previewScroll: { padding: 20, gap: 14, flexGrow: 1 },
  previewWrap: { borderWidth: 1, borderRadius: 12, padding: 6, overflow: 'hidden' },
  previewImg: { width: '100%', height: 200 },
  divider: { height: 2, marginVertical: 2 },
  previewActions: { flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  actionBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  saveBtn: { margin: 20, borderRadius: 12, padding: 18, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 18 },
});
