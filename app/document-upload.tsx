import Feather from '@expo/vector-icons/Feather';
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
// Scanned pages get a review list before "Add to library" (B-009): reorder,
// remove, retake a single page, or scan more — nothing is saved until Add.
type ScannedPage = { id: string; uri: string };

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
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setScanned([]);
    setPicked({ uri: asset.uri, name: asset.name ?? 'document.pdf' });
    if (!title.trim()) setTitle((asset.name ?? '').replace(/\.pdf$/i, ''));
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
      setScanned((prev) => [...prev, ...imgs.map((uri) => ({ id: newPageId(), uri }))]);
      if (!title.trim()) setTitle('Scanned music');
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

  function removeScannedPage(id: string) {
    setScanned((prev) => prev.filter((p) => p.id !== id));
  }

  function moveScannedPage(id: string, dir: -1 | 1) {
    setScanned((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const hasSource = !!picked || scanned.length > 0;
  const canAdd = hasSource && title.trim().length > 0 && !busy;

  async function onAdd() {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    try {
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
          </ThemedText>
        )}

        <View style={styles.btnRow}>
          <Pressable
            style={[styles.pickBtn, { backgroundColor: C.tint, flex: 1 }]}
            disabled={busy}
            onPress={pickPdf}>
            <ThemedText style={styles.pickText}>Choose PDF</ThemedText>
          </Pressable>
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

        {scanned.length > 0 && (
          <View style={styles.pagesBlock}>
            <ThemedText style={styles.pagesHeading}>
              {scanned.length === 1 ? '1 page scanned' : `${scanned.length} pages scanned`} —
              check each one before adding
            </ThemedText>
            {scanned.map((p, i) => (
              <View key={p.id} style={styles.pageRow}>
                <Image source={{ uri: p.uri }} style={styles.pageThumb} contentFit="cover" />
                <ThemedText style={styles.pageLabel}>Page {i + 1}</ThemedText>
                <View style={styles.pageActions}>
                  <Pressable
                    onPress={() => moveScannedPage(p.id, -1)}
                    disabled={busy || i === 0}
                    hitSlop={6}
                    style={[styles.pageIconBtn, i === 0 && styles.pageIconDisabled]}>
                    <Feather name="arrow-up" size={16} color={Palette.text} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveScannedPage(p.id, 1)}
                    disabled={busy || i === scanned.length - 1}
                    hitSlop={6}
                    style={[
                      styles.pageIconBtn,
                      i === scanned.length - 1 && styles.pageIconDisabled,
                    ]}>
                    <Feather name="arrow-down" size={16} color={Palette.text} />
                  </Pressable>
                  <Pressable
                    onPress={() => retakePage(p.id)}
                    disabled={busy}
                    hitSlop={6}
                    style={styles.pageIconBtn}>
                    <Feather name="camera" size={16} color={Palette.text} />
                  </Pressable>
                  <Pressable
                    onPress={() => removeScannedPage(p.id)}
                    disabled={busy}
                    hitSlop={6}
                    style={styles.pageIconBtn}>
                    <Feather name="x" size={16} color={Palette.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
            <ThemedText style={styles.pagesHint}>
              📷 = retake that page with the camera. Arrows reorder; ✕ removes.
            </ThemedText>
          </View>
        )}

        <ThemedText style={{ fontSize: Type.size.sm, opacity: 0.7 }}>Title</ThemedText>
        <TextInput
          value={title}
          onChangeText={setTitle}
          editable={!busy}
          placeholder="e.g. Mahler 9 — Clarinet I"
          placeholderTextColor={C.icon}
          style={[styles.input, { borderColor: C.icon, color: C.text }]}
        />

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
          <ThemedText style={styles.addText}>Add to library</ThemedText>
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
  pageActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  pageIconBtn: {
    width: 34,
    height: 34,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceSunk,
  },
  pageIconDisabled: { opacity: 0.35 },
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
