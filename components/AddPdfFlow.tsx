import Feather from '@expo/vector-icons/Feather';
import * as DocumentPicker from 'expo-document-picker';
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
import { addPdfDocument } from '@/lib/pdf/addPdfDocument';
import { addScannedDocument } from '@/lib/scan/addScannedDocument';

// The in-modal "add a full part" flow (native). Lives INSIDE the library's
// little Add window so adding a part never navigates to a full-screen page
// (Ralph, 2026-09-13: it should feel like "another side of the same little
// modal"). Tapping Add PDF/Scan in the menu swaps the card to this component,
// which immediately presents the Files picker or the VisionKit scanner, then
// flips the card to a name step. Only on success does the app navigate — to
// the finished part.
//
// The IMSLP import path still uses the full /document-upload screen (it needs
// its download-first instructions); this flow is the everyday path.

type ScannedPage = { id: string; uri: string };
type BatchItem = { key: string; uri: string; title: string };

export type AddPdfFlowProps = {
  /** 'pick' presents the Files picker on mount; 'scan' the camera scanner. */
  start: 'pick' | 'scan';
  folderId: string | null;
  /** Success: docId for a single part (open it), null after a batch (stay). */
  onDone: (docId: string | null) => void;
  /** Cancelled with nothing added — flip the card back to the Add menu. */
  onClose: () => void;
  /** Tell the parent modal an add is running so it refuses to dismiss. */
  onBusyChange?: (busy: boolean) => void;
};

function newPageId(): string {
  return `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AddPdfFlow({ start, folderId, onDone, onClose, onBusyChange }: AddPdfFlowProps) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [picked, setPicked] = useState<{ uri: string; name: string } | null>(null);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [scanned, setScanned] = useState<ScannedPage[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setBusyBoth(b: boolean) {
    setBusy(b);
    onBusyChange?.(b);
  }

  async function pickPdf() {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (res.canceled || !res.assets || res.assets.length === 0) {
      // Nothing chosen — flip back to the Add menu.
      if (!picked && batch.length === 0 && scanned.length === 0) onClose();
      return;
    }
    setScanned([]);
    if (res.assets.length === 1) {
      const asset = res.assets[0];
      setBatch([]);
      setPicked({ uri: asset.uri, name: asset.name ?? 'document.pdf' });
      setName((asset.name ?? '').replace(/\.pdf$/i, ''));
      return;
    }
    setPicked(null);
    setBatch(
      res.assets.map((a, i) => ({
        key: `b_${Date.now()}_${i}`,
        uri: a.uri,
        title: (a.name ?? `Part ${i + 1}`).replace(/\.pdf$/i, ''),
      })),
    );
  }

  async function runScanner(): Promise<string[] | null> {
    // Lazy require — the plugin runs a TurboModule lookup on import, which
    // would take down the web bundle (same note as app/document-upload.tsx).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DocumentScanner = require('react-native-document-scanner-plugin').default;
    const { scannedImages, status } = await DocumentScanner.scanDocument({
      croppedImageQuality: 100,
    });
    if (status !== 'success' || !scannedImages || scannedImages.length === 0) return null;
    return scannedImages;
  }

  async function scanPages() {
    setError(null);
    try {
      const imgs = await runScanner();
      if (!imgs) {
        if (scanned.length === 0) onClose();
        return;
      }
      setPicked(null);
      setBatch([]);
      setScanned((prev) => [...prev, ...imgs.map((uri) => ({ id: newPageId(), uri }))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function retakePage(id: string) {
    setError(null);
    try {
      const imgs = await runScanner();
      if (!imgs) return;
      setScanned((prev) =>
        prev.flatMap((p) => (p.id === id ? imgs.map((uri) => ({ id: newPageId(), uri })) : [p])),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Present the picker/scanner as soon as the card flips to this flow. A
  // short delay lets the card's own render settle; the picker presents on
  // top of the open modal, so there's no dismissal transition to race.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = setTimeout(() => {
      if (start === 'scan') void scanPages();
      else void pickPdf();
    }, 250);
    return () => clearTimeout(t);
    // Mount-only hand-off from the Add menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBatch = batch.length > 0;
  const hasSource = !!picked || isBatch || scanned.length > 0;
  const canAdd =
    hasSource &&
    !busy &&
    (isBatch ? batch.every((b) => b.title.trim().length > 0) : name.trim().length > 0);

  async function onAdd() {
    if (!canAdd) return;
    setBusyBoth(true);
    setError(null);
    try {
      if (isBatch) {
        for (let i = 0; i < batch.length; i++) {
          const item = batch[i];
          const prefix = `Part ${i + 1} of ${batch.length}: ${item.title}`;
          try {
            await addPdfDocument({
              fileUri: item.uri,
              title: item.title.trim(),
              composer: '',
              folderId,
              onProgress: (msg) => setProgress(`${prefix}\n${msg}`),
            });
          } catch (e) {
            setBatch(batch.slice(i));
            throw new Error(
              `"${item.title}" failed (${e instanceof Error ? e.message : String(e)}). ` +
                `${i} of ${batch.length} parts were added; the rest are still listed. Tap Add again.`,
            );
          }
        }
        onDone(null);
        return;
      }
      let docId: string;
      if (picked) {
        ({ docId } = await addPdfDocument({
          fileUri: picked.uri,
          title: name.trim(),
          composer: '',
          folderId,
          onProgress: setProgress,
        }));
      } else {
        ({ docId } = await addScannedDocument({
          imageUris: scanned.map((p) => p.uri),
          title: name.trim(),
          composer: '',
          folderId,
          onProgress: setProgress,
        }));
      }
      onDone(docId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusyBoth(false);
      setProgress(null);
    }
  }

  // While the picker/scanner is up (nothing chosen yet) the card shows a
  // quiet waiting state — it's only on screen for a beat.
  if (!hasSource) {
    return (
      <View style={styles.waitWrap}>
        <ActivityIndicator color={C.tint} />
        <ThemedText style={styles.waitText}>
          {start === 'scan' ? 'Opening the scanner…' : 'Opening Files…'}
        </ThemedText>
        <Pressable onPress={onClose} hitSlop={8}>
          <ThemedText style={[styles.linkText, { color: C.tint }]}>‹ Back</ThemedText>
        </Pressable>
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      </View>
    );
  }

  if (busy) {
    return (
      <View style={styles.waitWrap}>
        <ActivityIndicator color={C.tint} />
        <ThemedText style={styles.waitText}>{progress ?? 'Adding…'}</ThemedText>
      </View>
    );
  }

  if (isBatch) {
    return (
      <View style={styles.stepWrap}>
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

  // Name step — single PDF or a scan session.
  return (
    <View style={styles.stepWrap}>
      <ThemedText type="subtitle" style={styles.stepTitle}>
        Name this part
      </ThemedText>

      {picked && (
        <View style={styles.fileChip}>
          <Feather name="file-text" size={16} color={C.tint} />
          <ThemedText style={styles.fileChipName} numberOfLines={1}>
            {picked.name}
          </ThemedText>
          <Feather name="check" size={18} color={Palette.success} />
        </View>
      )}

      {scanned.length > 0 && (
        <View style={{ gap: Spacing.xs }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStrip}>
            {scanned.map((p, i) => (
              <Pressable key={p.id} onPress={() => void retakePage(p.id)} style={styles.thumbCell}>
                <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
                <ThemedText style={styles.thumbLabel}>{i + 1}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.scanRow}>
            <ThemedText style={styles.scanHint}>
              {scanned.length === 1 ? '1 page. Tap it to rescan it' : `${scanned.length} pages. Tap one to rescan it`}
            </ThemedText>
            <Pressable onPress={() => void scanPages()} hitSlop={8}>
              <ThemedText style={[styles.linkText, { color: C.tint }]}>+ Scan more</ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Mahler 9, Clarinet I"
        placeholderTextColor={Palette.textMuted}
        autoFocus={scanned.length > 0}
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

const styles = StyleSheet.create({
  waitWrap: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
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
    flex: undefined,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.borderStrong,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    fontSize: Type.size.md,
    color: Palette.text,
  },
  batchScroll: { maxHeight: 260 },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
  scanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scanHint: { fontSize: Type.size.xs, color: Palette.textSecondary },
  addBtn: { borderRadius: Radii.lg, padding: Spacing.lg, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.lg },
  cancelRow: { alignItems: 'center', paddingVertical: 2 },
  linkText: { fontWeight: Type.weight.semibold, fontSize: Type.size.sm },
  error: { color: Palette.danger, fontSize: Type.size.sm, textAlign: 'center' },
});
