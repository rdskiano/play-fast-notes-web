import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addPhotoDocument } from '@/lib/photo/addPhotoDocument';

// The in-modal "add a photo" flow (native) — the photo sibling of AddPdfFlow,
// living inside the library's little Add window instead of a full-screen
// page. First side: choose vs take. Once pages are in, the card shows a
// thumbnail strip + name + Save. Photos become a page-and-boxes image
// document (lib/photo/addPhotoDocument), same as the retired /upload screen.
//
// Deliberately dropped from the card (vs the old page): the up/down reorder
// arrows (photos keep their selection order; remove and re-add to fix an
// order mistake) and the legacy "/multi-page" link — a passage spanning two
// pages is joined in the document viewer via "Add next page →".

type PickedPage = { id: string; uri: string };

export type AddPhotoFlowProps = {
  folderId: string | null;
  onDone: (docId: string | null) => void;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
};

function newPageId(): string {
  return `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AddPhotoFlow({ folderId, onDone, onClose, onBusyChange }: AddPhotoFlowProps) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [pages, setPages] = useState<PickedPage[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setBusyBoth(b: boolean) {
    setBusy(b);
    onBusyChange?.(b);
  }

  function addUris(uris: string[]) {
    if (uris.length === 0) return;
    setError(null);
    setPages((prev) => [...prev, ...uris.map((uri) => ({ id: newPageId(), uri }))]);
  }

  async function choosePhotos() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo access is needed to choose a photo. Enable it in Settings.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 12,
      orderedSelection: true,
    });
    if (res.canceled || !res.assets?.length) return;
    addUris(res.assets.map((a) => a.uri));
  }

  async function takePhoto() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera access is needed to take a photo. Enable it in Settings.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    addUris([res.assets[0].uri]);
  }

  function removePage(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }

  const hasPages = pages.length > 0;
  const canSave = hasPages && !busy && name.trim().length > 0;

  async function save() {
    if (!canSave) return;
    setBusyBoth(true);
    setError(null);
    try {
      const { docId } = await addPhotoDocument({
        imageUris: pages.map((p) => p.uri),
        title: name.trim(),
        folderId,
        onProgress: setProgress,
      });
      onDone(docId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusyBoth(false);
      setProgress(null);
    }
  }

  if (busy) {
    return (
      <View style={styles.waitWrap}>
        <ActivityIndicator color={C.tint} />
        <ThemedText style={styles.waitText}>{progress ?? 'Saving…'}</ThemedText>
      </View>
    );
  }

  // First side: where's the photo coming from?
  if (!hasPages) {
    return (
      <View style={styles.stepWrap}>
        <ThemedText type="subtitle" style={styles.stepTitle}>
          Add a photo
        </ThemedText>
        <ThemedText style={styles.hint}>
          Get the whole page in. You’ll mark the spots to practice right on it.
        </ThemedText>
        <Pressable style={[styles.srcBtn, { backgroundColor: C.tint }]} onPress={() => void choosePhotos()}>
          <Feather name="image" size={18} color="#fff" />
          <ThemedText style={styles.srcBtnText}>Choose from Photos</ThemedText>
        </Pressable>
        <Pressable style={styles.srcBtnOutline} onPress={() => void takePhoto()}>
          <Feather name="camera" size={18} color={C.tint} />
          <ThemedText style={[styles.srcBtnText, { color: C.tint }]}>Take a photo</ThemedText>
        </Pressable>
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        <Pressable onPress={onClose} hitSlop={8} style={styles.cancelRow}>
          <ThemedText style={[styles.linkText, { color: Palette.textSecondary }]}>‹ Back</ThemedText>
        </Pressable>
      </View>
    );
  }

  // Pages are in: thumbnails + name + save, all in the card.
  return (
    <View style={styles.stepWrap}>
      <ThemedText type="subtitle" style={styles.stepTitle}>
        Name this piece
      </ThemedText>

      <View style={{ gap: Spacing.xs }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbStrip}>
          {pages.map((p, i) => (
            <View key={p.id} style={styles.thumbCell}>
              <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
              <ThemedText style={styles.thumbLabel}>{i + 1}</ThemedText>
              <Pressable
                onPress={() => removePage(p.id)}
                hitSlop={8}
                accessibilityLabel={`Remove page ${i + 1}`}
                style={styles.thumbRemove}>
                <Feather name="x" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <View style={styles.moreRow}>
          <ThemedText style={styles.moreHint}>
            {pages.length === 1 ? '1 page' : `${pages.length} pages. They’ll turn like a PDF`}
          </ThemedText>
          <View style={styles.moreLinks}>
            <Pressable onPress={() => void choosePhotos()} hitSlop={8}>
              <ThemedText style={[styles.linkText, { color: C.tint }]}>+ Choose more</ThemedText>
            </Pressable>
            <Pressable onPress={() => void takePhoto()} hitSlop={8}>
              <ThemedText style={[styles.linkText, { color: C.tint }]}>📷 Take another</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Bach Invention 4"
        placeholderTextColor={Palette.textMuted}
        style={styles.input}
      />

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      <Pressable
        style={[styles.addBtn, { backgroundColor: canSave ? C.tint : Palette.borderStrong }]}
        disabled={!canSave}
        onPress={() => void save()}>
        <ThemedText style={styles.addBtnText}>
          Save{pages.length > 1 ? ` ${pages.length} pages` : ''}
        </ThemedText>
      </Pressable>
      <Pressable onPress={onClose} hitSlop={8} style={styles.cancelRow}>
        <ThemedText style={[styles.linkText, { color: Palette.textSecondary }]}>Cancel</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  waitWrap: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  waitText: { color: Palette.textSecondary, fontSize: Type.size.sm, textAlign: 'center' },
  stepWrap: { gap: Spacing.md },
  stepTitle: { textAlign: 'center' },
  hint: {
    fontSize: Type.size.sm,
    color: Palette.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  srcBtn: {
    flexDirection: 'row',
    gap: Spacing.sm,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  srcBtnOutline: {
    flexDirection: 'row',
    gap: Spacing.sm,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.borderStrong,
  },
  srcBtnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.md },
  thumbStrip: { flexDirection: 'row', gap: Spacing.sm },
  thumbCell: {
    alignItems: 'center',
    gap: 2,
    backgroundColor: Palette.surfaceSunk,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    padding: Spacing.xs,
  },
  thumb: { width: 44, height: 58, borderRadius: Radii.sm, backgroundColor: Palette.card },
  thumbLabel: { fontSize: Type.size.xs, color: Palette.textSecondary },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Palette.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreRow: { gap: Spacing.xs },
  moreHint: { fontSize: Type.size.xs, color: Palette.textSecondary },
  moreLinks: { flexDirection: 'row', gap: Spacing.lg },
  input: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.borderStrong,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    fontSize: Type.size.md,
    color: Palette.text,
  },
  addBtn: { borderRadius: Radii.lg, padding: Spacing.lg, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.lg },
  cancelRow: { alignItems: 'center', paddingVertical: 2 },
  linkText: { fontWeight: Type.weight.semibold, fontSize: Type.size.sm },
  error: { color: Palette.danger, fontSize: Type.size.sm, textAlign: 'center' },
});
