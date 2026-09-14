import Feather from '@expo/vector-icons/Feather';
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
import { uploadPdfDocument, type UploadProgress } from '@/lib/pdf/upload';

// Web sibling of the in-modal add-a-part flow. Same card-sized steps as
// native: pick → name → add, never leaving the library screen. The file
// dialog is auto-opened right after the menu tap (still inside the browser's
// user-activation window); if a browser refuses, the card shows a Choose
// button as the fallback. 'scan' never arrives on web — the menu doesn't
// offer it — but the prop shape matches the native component.

type BatchItem = { key: string; file: File; title: string };

export type AddPdfFlowProps = {
  start: 'pick' | 'scan';
  folderId: string | null;
  onDone: (docId: string | null) => void;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
};

export function AddPdfFlow({ folderId, onDone, onClose, onBusyChange }: AddPdfFlowProps) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [picked, setPicked] = useState<File | null>(null);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [batchLabel, setBatchLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const saving = progress !== null && progress.phase !== 'done';

  useEffect(() => {
    onBusyChange?.(saving);
  }, [saving, onBusyChange]);

  // Try to open the OS file dialog immediately — the tap on "Add PDF" a
  // moment ago usually still counts as user activation. When it doesn't
  // (stricter browsers), the visible button below is the one-tap fallback.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    inputRef.current?.click();
  }, []);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setError(null);
    if (files.length === 1) {
      setBatch([]);
      setPicked(files[0]);
      setName(files[0].name.replace(/\.pdf$/i, ''));
      return;
    }
    setPicked(null);
    setBatch(
      files.map((file, i) => ({
        key: `b_${Date.now()}_${i}`,
        file,
        title: file.name.replace(/\.pdf$/i, ''),
      })),
    );
  }

  const isBatch = batch.length > 0;
  const hasSource = !!picked || isBatch;
  const canAdd =
    hasSource &&
    !saving &&
    (isBatch ? batch.every((b) => b.title.trim().length > 0) : name.trim().length > 0);

  async function onAdd() {
    if (!canAdd) return;
    setError(null);
    if (isBatch) {
      setProgress({ phase: 'uploading', pages_done: 0, pages_total: 0 });
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        setBatchLabel(`Part ${i + 1} of ${batch.length}: ${item.title}`);
        try {
          await uploadPdfDocument({
            file: item.file,
            title: item.title.trim(),
            composer: null,
            folder_id: folderId,
            onProgress: (p) => setProgress(p),
          });
        } catch (e) {
          setBatch(batch.slice(i));
          setBatchLabel(null);
          setProgress(null);
          setError(
            `"${item.title}" failed (${e instanceof Error ? e.message : String(e)}). ` +
              `${i} of ${batch.length} parts were added; the rest are still listed. Tap Add again.`,
          );
          return;
        }
      }
      onDone(null);
      return;
    }
    if (!picked) return;
    setProgress({ phase: 'uploading', pages_done: 0, pages_total: 0 });
    try {
      const document = await uploadPdfDocument({
        file: picked,
        title: name.trim(),
        composer: null,
        folder_id: folderId,
        onProgress: (p) => setProgress(p),
      });
      onDone(document.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProgress(null);
    }
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf"
      multiple
      onChange={onFileChange}
      style={{ display: 'none' }}
    />
  );

  if (saving) {
    return (
      <View style={styles.waitWrap}>
        {fileInput}
        <ActivityIndicator color={C.tint} />
        {batchLabel && <ThemedText style={styles.waitText}>{batchLabel}</ThemedText>}
        <ThemedText style={styles.waitText}>{progressLabel(progress!)}</ThemedText>
        {progress!.pages_total > 0 && (
          <ThemedText style={styles.waitText}>
            {progress!.pages_done} / {progress!.pages_total} pages
          </ThemedText>
        )}
      </View>
    );
  }

  if (!hasSource) {
    return (
      <View style={styles.waitWrap}>
        {fileInput}
        <Pressable style={[styles.addBtn, { backgroundColor: C.tint, alignSelf: 'stretch' }]} onPress={() => inputRef.current?.click()}>
          <ThemedText style={styles.addBtnText}>Choose PDF</ThemedText>
        </Pressable>
        <ThemedText style={styles.waitText}>Pick several at once to add a whole concert.</ThemedText>
        <Pressable onPress={onClose} hitSlop={8}>
          <ThemedText style={[styles.linkText, { color: C.tint }]}>‹ Back</ThemedText>
        </Pressable>
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      </View>
    );
  }

  if (isBatch) {
    return (
      <View style={styles.stepWrap}>
        {fileInput}
        <ThemedText type="subtitle" style={styles.stepTitle}>
          {batch.length} PDFs: check each title
        </ThemedText>
        <ScrollView style={styles.batchScroll} contentContainerStyle={{ gap: Spacing.sm }}>
          {batch.map((item) => (
            <View key={item.key} style={styles.batchRow}>
              <TextInput
                value={item.title}
                onChangeText={(t) =>
                  setBatch((prev) =>
                    prev.map((b) => (b.key === item.key ? { ...b, title: t } : b)),
                  )
                }
                placeholder="Part title"
                placeholderTextColor={Palette.textMuted}
                style={styles.input}
              />
              <Pressable
                onPress={() => setBatch((prev) => prev.filter((b) => b.key !== item.key))}
                hitSlop={8}
                accessibilityLabel={`Remove ${item.title}`}>
                <Feather name="x" size={18} color={Palette.textMuted} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        <Pressable
          style={[styles.addBtn, { backgroundColor: canAdd ? C.tint : Palette.borderStrong }]}
          disabled={!canAdd}
          onPress={() => void onAdd()}>
          <ThemedText style={styles.addBtnText}>Add {batch.length} parts</ThemedText>
        </Pressable>
        <Pressable onPress={onClose} hitSlop={8} style={styles.cancelRow}>
          <ThemedText style={[styles.linkText, { color: Palette.textSecondary }]}>Cancel</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.stepWrap}>
      {fileInput}
      <ThemedText type="subtitle" style={styles.stepTitle}>
        Name this part
      </ThemedText>
      <View style={styles.fileChip}>
        <Feather name="file-text" size={16} color={C.tint} />
        <ThemedText style={styles.fileChipName} numberOfLines={1}>
          {picked?.name}
        </ThemedText>
        <Feather name="check" size={18} color={Palette.success} />
      </View>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Mahler 9, Clarinet I"
        placeholderTextColor={Palette.textMuted}
        style={styles.input}
      />
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      <Pressable
        style={[styles.addBtn, { backgroundColor: canAdd ? C.tint : Palette.borderStrong }]}
        disabled={!canAdd}
        onPress={() => void onAdd()}>
        <ThemedText style={styles.addBtnText}>Add to library</ThemedText>
      </Pressable>
      <Pressable onPress={onClose} hitSlop={8} style={styles.cancelRow}>
        <ThemedText style={[styles.linkText, { color: Palette.textSecondary }]}>Cancel</ThemedText>
      </Pressable>
    </View>
  );
}

function progressLabel(p: UploadProgress): string {
  switch (p.phase) {
    case 'uploading': return 'Uploading PDF…';
    case 'init': return 'Reading PDF…';
    case 'rendering': return 'Rendering pages…';
    case 'saving': return 'Saving…';
    case 'done': return 'Done';
  }
}

const styles = StyleSheet.create({
  waitWrap: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  waitText: { color: Palette.textSecondary, fontSize: Type.size.sm, textAlign: 'center' },
  stepWrap: { gap: Spacing.md },
  stepTitle: { textAlign: 'center' },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.surfaceSunk,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    padding: Spacing.md,
  },
  fileChipName: { flex: 1, fontWeight: Type.weight.semibold, fontSize: Type.size.sm },
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
  batchScroll: { maxHeight: 260 },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  addBtn: { borderRadius: Radii.lg, padding: Spacing.lg, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.lg },
  cancelRow: { alignItems: 'center', paddingVertical: 2 },
  linkText: { fontWeight: Type.weight.semibold, fontSize: Type.size.sm },
  error: { color: Palette.danger, fontSize: Type.size.sm, textAlign: 'center' },
});
