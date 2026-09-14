import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
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
import type { DocumentPage } from '@/lib/db/repos/documents';
import { insertDocument } from '@/lib/db/repos/documents';
import { fileToPageImage, isHeic } from '@/lib/image/fileToPageImage';
import { supabase } from '@/lib/supabase/client';
import { uploadDocumentPageImage } from '@/lib/supabase/storage';

// Web sibling of the in-modal add-a-photo flow. Same card-sized steps as
// native: choose/take → thumbnails + name → save, never leaving the library.
// The save pipeline mirrors app/upload.web.tsx's saveDocument (re-encode each
// page to the doc reference scale, upload, insert one image-document); the
// /upload page itself stays for the guided onboarding hand-off.

type PickedPage = { id: string; file: File; rawUrl: string };

export type AddPhotoFlowProps = {
  folderId: string | null;
  onDone: (docId: string | null) => void;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
};

function newDocId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function newPageId(): string {
  return `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name);
}

function errToMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown };
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.details === 'string' && o.details) return o.details;
  }
  return String(e);
}

export function AddPhotoFlow({ folderId, onDone, onClose, onBusyChange }: AddPhotoFlowProps) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [pages, setPages] = useState<PickedPage[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  function addFiles(files: File[]) {
    const valid = files.filter(isImageFile);
    if (valid.length === 0) {
      setError('That file isn’t an image. Pick a PNG, JPG, or HEIC.');
      return;
    }
    setError(null);
    setPages((prev) => [
      ...prev,
      ...valid.map((file) => ({
        id: newPageId(),
        file,
        rawUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) addFiles(files);
    e.target.value = '';
  }

  function removePage(id: string) {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.rawUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  const hasPages = pages.length > 0;
  const canSave = hasPages && !busy && name.trim().length > 0;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const docId = newDocId();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error('Not signed in');
      const docPages: DocumentPage[] = [];
      for (let i = 0; i < pages.length; i++) {
        const { blob, w, h } = await fileToPageImage(pages[i].file);
        const pageNum = i + 1;
        const publicUrl = await uploadDocumentPageImage(userId, docId, pageNum, blob);
        docPages.push({ index: pageNum, image_uri: publicUrl, w, h });
      }
      await insertDocument({
        id: docId,
        title: name.trim(),
        composer: null,
        source_kind: 'images',
        page_count: pages.length,
        pages: docPages,
        folder_id: folderId,
      });
      pages.forEach((p) => URL.revokeObjectURL(p.rawUrl));
      onDone(docId);
    } catch (e) {
      const msg = errToMessage(e);
      const heicInList = pages.some((p) => isHeic(p.file));
      setError(
        heicInList
          ? `Couldn't read one of those HEIC photos (${msg}). Try a JPG or PNG, or retake it.`
          : msg,
      );
      setBusy(false);
    }
  }

  const inputs = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
    </>
  );

  if (busy) {
    return (
      <View style={styles.waitWrap}>
        {inputs}
        <ActivityIndicator color={C.tint} />
        <ThemedText style={styles.waitText}>Saving your photo…</ThemedText>
      </View>
    );
  }

  if (!hasPages) {
    return (
      <View style={styles.stepWrap}>
        {inputs}
        <ThemedText type="subtitle" style={styles.stepTitle}>
          Add a photo
        </ThemedText>
        <ThemedText style={styles.hint}>
          Get the whole page in. You’ll mark the spots to practice right on it.
        </ThemedText>
        <Pressable
          style={[styles.srcBtn, { backgroundColor: C.tint }]}
          onPress={() => fileInputRef.current?.click()}>
          <Feather name="image" size={18} color="#fff" />
          <ThemedText style={styles.srcBtnText}>Choose photos</ThemedText>
        </Pressable>
        <Pressable style={styles.srcBtnOutline} onPress={() => cameraInputRef.current?.click()}>
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

  return (
    <View style={styles.stepWrap}>
      {inputs}
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
              <Image source={{ uri: p.rawUrl }} style={styles.thumb} contentFit="cover" />
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
            <Pressable onPress={() => fileInputRef.current?.click()} hitSlop={8}>
              <ThemedText style={[styles.linkText, { color: C.tint }]}>+ Choose more</ThemedText>
            </Pressable>
            <Pressable onPress={() => cameraInputRef.current?.click()} hitSlop={8}>
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
    flexGrow: 1,
  },
  addBtn: { borderRadius: Radii.lg, padding: Spacing.lg, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.lg },
  cancelRow: { alignItems: 'center', paddingVertical: 2 },
  linkText: { fontWeight: Type.weight.semibold, fontSize: Type.size.sm },
  error: { color: Palette.danger, fontSize: Type.size.sm, textAlign: 'center' },
});
