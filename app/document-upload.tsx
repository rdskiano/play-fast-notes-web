import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
// NOTE: react-native-document-scanner-plugin is iOS-only and runs a
// TurboModule lookup the instant it's imported — which throws on web
// ("getEnforcing of undefined"). Because Expo Router evaluates this native
// route file even on web (the web screen is document-upload.web.tsx), a
// top-level import here takes down the whole dev site. So it's lazily
// require()'d inside scanPages() instead (require, not dynamic import(),
// which breaks Hermes on native).

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Lift, Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addPdfDocument } from '@/lib/pdf/addPdfDocument';
import { addScannedDocument } from '@/lib/scan/addScannedDocument';

// Native "Add a full part" screen. Local-first, two ways in:
//  • Choose PDF — pick a PDF from Files (lib/pdf/addPdfDocument).
//  • Scan pages — camera scan (auto edge-detect + crop), cleaned to B&W
//    (lib/scan/addScannedDocument).
// Both save on-device and sync to the user's account when signed in.
//
// Per-page fixing happens INSIDE the system scanner (adjust corners / retake
// right after each shot), so there's no review list here — just a thumbnail
// strip (tap a page to rescan it) and the naming fields. Nothing is saved
// until Add.
type ScannedPage = { id: string; uri: string };
// Batch mode: picking SEVERAL PDFs at once (concert-folder filling — the
// parts are usually all scanned already, F29). Each gets its own editable
// title, prefilled from its filename; composer is shared.
type BatchItem = { key: string; uri: string; title: string };

function newPageId(): string {
  return `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function DocumentUploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string; title?: string; composer?: string; imslp?: string }>();
  const folderId = params.folder ? params.folder : null;
  const fromImslp = params.imslp === '1';
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [picked, setPicked] = useState<{ uri: string; name: string } | null>(null);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [scanned, setScanned] = useState<ScannedPage[]>([]);
  // Prefilled when arriving from IMSLP, so the imported part is labeled right.
  const [title, setTitle] = useState(typeof params.title === 'string' ? params.title : '');
  const [composer, setComposer] = useState(typeof params.composer === 'string' ? params.composer : '');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickPdf() {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (res.canceled || !res.assets || res.assets.length === 0) return;
    setScanned([]);
    if (res.assets.length === 1) {
      const asset = res.assets[0];
      setBatch([]);
      setPicked({ uri: asset.uri, name: asset.name ?? 'document.pdf' });
      if (!title.trim()) setTitle((asset.name ?? '').replace(/\.pdf$/i, ''));
      return;
    }
    // Several PDFs → batch mode: one row per part, titles from filenames.
    setPicked(null);
    setBatch(
      res.assets.map((a, i) => ({
        key: `b_${Date.now()}_${i}`,
        uri: a.uri,
        title: (a.name ?? `Part ${i + 1}`).replace(/\.pdf$/i, ''),
      })),
    );
  }

  // Launch the VisionKit scanner; returns page image URIs, or null on cancel.
  async function runScanner(): Promise<string[] | null> {
    // Lazy load — see the import note at the top of this file.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DocumentScanner = require('react-native-document-scanner-plugin').default;
    const { scannedImages, status } = await DocumentScanner.scanDocument({
      croppedImageQuality: 100,
    });
    if (status !== 'success' || !scannedImages || scannedImages.length === 0) return null;
    return scannedImages;
  }

  // First scan starts the page list; later runs append to it ("Scan more pages").
  async function scanPages() {
    setError(null);
    try {
      const imgs = await runScanner();
      if (!imgs) return;
      setPicked(null);
      setBatch([]);
      setScanned((prev) => [...prev, ...imgs.map((uri) => ({ id: newPageId(), uri }))]);
      // No default title — the Add button stays disabled until the user names
      // the piece, so naming can't be skipped by accident.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Re-scan one page in place. If the scanner returns several, they all land
  // where the old page was (useful when a "page" turns out to be two).
  async function retakePage(id: string) {
    setError(null);
    try {
      const imgs = await runScanner();
      if (!imgs) return;
      setScanned((prev) =>
        prev.flatMap((p) =>
          p.id === id ? imgs.map((uri) => ({ id: newPageId(), uri })) : [p],
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const isBatch = batch.length > 0;
  const hasSource = !!picked || isBatch || scanned.length > 0;
  const canAdd =
    hasSource &&
    !busy &&
    (isBatch
      ? batch.every((b) => b.title.trim().length > 0)
      : title.trim().length > 0);

  async function onAdd() {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    try {
      if (isBatch) {
        // Sequential ingest — one part at a time so progress stays honest
        // and a failure names the part it stopped on. Successfully added
        // parts stay added; the failed one and the rest remain listed.
        for (let i = 0; i < batch.length; i++) {
          const item = batch[i];
          const prefix = `Part ${i + 1} of ${batch.length} — ${item.title}`;
          try {
            await addPdfDocument({
              fileUri: item.uri,
              title: item.title.trim(),
              composer,
              folderId,
              onProgress: (msg) => setProgress(`${prefix}\n${msg}`),
            });
          } catch (e) {
            const remaining = batch.slice(i);
            setBatch(remaining);
            throw new Error(
              `"${item.title}" failed (${e instanceof Error ? e.message : String(e)}). ` +
                `${i} of ${batch.length} parts were added; the rest are still listed below — fix and tap Add again.`,
            );
          }
        }
        // All parts landed — back to the library/folder they were aimed at.
        router.back();
        return;
      }
      let docId: string;
      if (picked) {
        ({ docId } = await addPdfDocument({
          fileUri: picked.uri,
          title,
          composer,
          folderId,
          onProgress: setProgress,
        }));
      } else {
        ({ docId } = await addScannedDocument({
          imageUris: scanned.map((p) => p.uri),
          title,
          composer,
          folderId,
          onProgress: setProgress,
        }));
      }
      // Cast: expo-router typed routes regenerate when the dev server starts.
      router.replace(`/document/${docId}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="title">Add a full part</ThemedText>
        {fromImslp ? (
          <ThemedText style={{ fontSize: Type.size.sm, color: C.tint }}>
            IMSLP opened so you can accept their disclaimer and download the PDF
            (free — non-members wait ~15 seconds). Save it to Files, then choose
            it below. Title and composer are filled in for you.
          </ThemedText>
        ) : (
          <ThemedText style={{ opacity: 0.6, fontSize: Type.size.sm }}>
            Choose a PDF, or scan pages with the camera (auto-cropped and cleaned to
            black &amp; white). After it&apos;s added you can mark passages inside it.
            {'\n\n'}Tip: in the scanner, switch Auto to Manual (top right) to check
            and fix each page&apos;s corners as you shoot.
            {'\n\n'}Tip: for a bound part (facing pages with a center fold), a
            dedicated scanner app like Genius Scan splits the pages better.
            Scan there, save the PDF to Files, then Choose PDF here.
          </ThemedText>
        )}

        <View style={styles.btnRow}>
          {/* Once pages are scanned this is a scan session — mixing in a PDF
              would replace them, so the only paths are scan more or Add. */}
          {scanned.length === 0 && (
            <Pressable
              style={[styles.pickBtn, { backgroundColor: C.tint, flex: 1 }]}
              disabled={busy}
              onPress={pickPdf}>
              <ThemedText style={styles.pickText}>Choose PDF</ThemedText>
            </Pressable>
          )}
          <Pressable
            style={[styles.pickBtn, { backgroundColor: C.tint, flex: 1 }]}
            disabled={busy}
            onPress={scanPages}>
            <ThemedText style={styles.pickText}>
              {scanned.length > 0 ? 'Scan more pages' : 'Scan pages'}
            </ThemedText>
          </Pressable>
        </View>

        {picked && (
          <ThemedText style={{ fontSize: Type.size.sm, opacity: 0.8 }}>
            Selected: {picked.name}
          </ThemedText>
        )}

        {isBatch && (
          <View style={styles.pagesBlock}>
            <ThemedText style={styles.pagesHeading}>
              {batch.length} PDFs selected — check each part's title
            </ThemedText>
            {batch.map((item) => (
              <View key={item.key} style={styles.batchRow}>
                <TextInput
                  value={item.title}
                  editable={!busy}
                  onChangeText={(t) =>
                    setBatch((prev) =>
                      prev.map((b) => (b.key === item.key ? { ...b, title: t } : b)),
                    )
                  }
                  placeholder="Part title"
                  placeholderTextColor={C.icon}
                  style={[styles.input, styles.batchInput, { borderColor: C.icon, color: C.text }]}
                />
                <Pressable
                  onPress={() =>
                    setBatch((prev) => prev.filter((b) => b.key !== item.key))
                  }
                  disabled={busy}
                  hitSlop={8}
                  accessibilityLabel={`Remove ${item.title}`}>
                  <ThemedText style={{ color: C.icon, fontSize: Type.size.lg }}>✕</ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {scanned.length > 0 && (
          <View style={styles.pagesBlock}>
            <ThemedText style={styles.pagesHeading}>
              {scanned.length === 1 ? '1 page scanned' : `${scanned.length} pages scanned`}
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbStrip}>
              {scanned.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => retakePage(p.id)}
                  disabled={busy}
                  style={styles.thumbCell}>
                  <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
                  <ThemedText style={styles.thumbLabel}>{i + 1}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            <ThemedText style={styles.pagesHint}>
              Tap a page to rescan just that page. Now name your piece below.
            </ThemedText>
          </View>
        )}

        {!isBatch && (
          <>
            <ThemedText style={{ fontSize: Type.size.sm, opacity: 0.7 }}>Title</ThemedText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              editable={!busy}
              placeholder="e.g. Mahler 9 — Clarinet I"
              placeholderTextColor={C.icon}
              style={[styles.input, { borderColor: C.icon, color: C.text }]}
            />
          </>
        )}

        <ThemedText style={{ fontSize: Type.size.sm, opacity: 0.7 }}>
          Composer (optional)
        </ThemedText>
        <TextInput
          value={composer}
          onChangeText={setComposer}
          editable={!busy}
          placeholder="e.g. Gustav Mahler"
          placeholderTextColor={C.icon}
          style={[styles.input, { borderColor: C.icon, color: C.text }]}
        />

        {progress && (
          <View style={[styles.progressCard, { borderColor: C.icon }]}>
            <ThemedText style={{ fontSize: Type.size.sm }}>{progress}</ThemedText>
          </View>
        )}
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      </ScrollView>

      <Pressable
        style={[styles.addBtn, { backgroundColor: canAdd ? C.tint : C.icon }]}
        disabled={!canAdd}
        onPress={onAdd}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.addText}>
            {isBatch ? `Add ${batch.length} parts` : 'Add to library'}
          </ThemedText>
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: Spacing.md },
  btnRow: { flexDirection: 'row', gap: Spacing.md },
  pickBtn: {
    borderRadius: Radii.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  pickText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.md },
  input: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    fontSize: Type.size.md,
  },
  progressCard: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  pagesBlock: { gap: Spacing.sm },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  batchInput: { flex: 1 },
  pagesHeading: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
    color: Palette.textSecondary,
    paddingHorizontal: Spacing.xs,
  },
  thumbStrip: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xs },
  thumbCell: {
    alignItems: 'center',
    gap: 2,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    padding: Spacing.xs,
    ...Lift,
  },
  thumb: {
    width: 64,
    height: 84,
    borderRadius: Radii.sm,
    backgroundColor: Palette.surfaceSunk,
  },
  thumbLabel: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    color: Palette.textSecondary,
  },
  pagesHint: {
    fontSize: Type.size.xs,
    color: Palette.textSecondary,
    paddingHorizontal: Spacing.xs,
  },
  error: { color: Palette.danger, fontSize: Type.size.sm },
  addBtn: {
    margin: 20,
    borderRadius: Radii.lg,
    padding: 18,
    alignItems: 'center',
  },
  addText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.xl },
});
