import Feather from '@expo/vector-icons/Feather';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
// NOTE: react-native-document-scanner-plugin is iOS-only and runs a
// TurboModule lookup the instant it's imported — which throws on web
// ("getEnforcing of undefined"). Because Expo Router evaluates this native
// route file even on web (the web screen is document-upload.web.tsx), a
// top-level import here takes down the whole dev site. So it's lazily
// require()'d inside scanPages() instead (require, not dynamic import(),
// which breaks Hermes on native).

import { CollapsibleHelp } from '@/components/CollapsibleHelp';
import { PromptModal } from '@/components/PromptModal';
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
  const params = useLocalSearchParams<{
    folder?: string;
    title?: string;
    composer?: string;
    imslp?: string;
    pick?: string;
    scan?: string;
  }>();
  const folderId = params.folder ? params.folder : null;
  const fromImslp = params.imslp === '1';
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [picked, setPicked] = useState<{ uri: string; name: string } | null>(null);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [scanned, setScanned] = useState<ScannedPage[]>([]);
  // Prefilled when arriving from IMSLP, so the imported part is labeled right.
  const [title, setTitle] = useState(typeof params.title === 'string' ? params.title : '');
  // Naming happens in a pop-up AFTER a file/scans are in (Ralph, 2026-09-13:
  // "nobody's going to be entering it before they upload it") — there are no
  // inline Title/Composer fields anymore. Composer rides along only when IMSLP
  // hands it to us.
  const composer = typeof params.composer === 'string' ? params.composer : '';
  const [namePromptVisible, setNamePromptVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickPdf(opts?: { backOnCancel?: boolean }) {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (res.canceled || !res.assets || res.assets.length === 0) {
      // Auto-launched from the library's Add menu: a cancel means there's
      // nothing to name here, so return to the library instead of stranding
      // the user on an empty screen they never asked for.
      if (opts?.backOnCancel) router.back();
      return;
    }
    setScanned([]);
    if (res.assets.length === 1) {
      const asset = res.assets[0];
      setBatch([]);
      setPicked({ uri: asset.uri, name: asset.name ?? 'document.pdf' });
      if (!title.trim()) setTitle((asset.name ?? '').replace(/\.pdf$/i, ''));
      // File's in — go straight to the name pop-up so the whole flow is
      // pick → confirm name → done.
      setNamePromptVisible(true);
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
  async function scanPages(opts?: { backOnCancel?: boolean }) {
    setError(null);
    try {
      const imgs = await runScanner();
      if (!imgs) {
        if (opts?.backOnCancel) router.back();
        return;
      }
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

  // The library's Add menu jumps straight into the Files picker (pick=1) or
  // the camera scanner (scan=1), so this screen normally appears only once
  // there's something to name. Fire once on mount; cancelling goes back.
  const autoLaunched = useRef(false);
  useEffect(() => {
    if (autoLaunched.current) return;
    autoLaunched.current = true;
    if (params.scan !== '1' && params.pick !== '1') return;
    // Wait out the Add-menu modal dismissal + the push transition: iOS
    // refuses to present a picker/scanner view controller while another
    // presentation is still animating, and the refusal is silent — the
    // screen just sits there (seen on the 2026-09-13 sim test).
    const t = setTimeout(() => {
      if (params.scan === '1') void scanPages({ backOnCancel: true });
      else void pickPdf({ backOnCancel: true });
    }, 450);
    return () => clearTimeout(t);
    // Mount-only hand-off from the library's Add menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBatch = batch.length > 0;
  const hasSource = !!picked || isBatch || scanned.length > 0;
  // The name arrives via the pop-up when Add is tapped, so a missing title
  // no longer disables the button (batch rows still each need one).
  const canAdd =
    hasSource &&
    !busy &&
    (isBatch ? batch.every((b) => b.title.trim().length > 0) : true);

  async function onAdd(nameArg?: string) {
    if (!canAdd) return;
    const finalTitle = (nameArg ?? title).trim();
    if (!isBatch && !finalTitle) return;
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
              // Batch parts carry no composer — the field is hidden in this
              // mode, and a leftover value typed in single mode must not
              // silently stamp every part.
              composer: '',
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
          title: finalTitle,
          composer,
          folderId,
          onProgress: setProgress,
        }));
      } else {
        ({ docId } = await addScannedDocument({
          imageUris: scanned.map((p) => p.uri),
          title: finalTitle,
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
        ) : hasSource ? null : (
          <ThemedText style={{ opacity: 0.6, fontSize: Type.size.sm }}>
            Choose a PDF from Files, or scan paper pages with the camera. After
            it&apos;s added you can mark passages inside it.
          </ThemedText>
        )}

        <View style={styles.btnRow}>
          {/* Once pages are scanned this is a scan session — mixing in a PDF
              would replace them, so the only paths are scan more or Add. */}
          {scanned.length === 0 && (
            <Pressable
              style={[styles.pickBtn, { backgroundColor: C.tint, flex: 1 }]}
              disabled={busy}
              onPress={() => pickPdf()}>
              <ThemedText style={styles.pickText}>
                {picked || isBatch ? 'Choose a different PDF' : 'From Files'}
              </ThemedText>
              {!picked && !isBatch && (
                <ThemedText style={styles.pickSub}>
                  Your PDFs on this iPad or iCloud
                </ThemedText>
              )}
            </Pressable>
          )}
          {/* A picked PDF is a done deal — scanning would silently replace it,
              so the scan button only shows while nothing is chosen yet. */}
          {!picked && !isBatch && (
            <Pressable
              style={[styles.pickBtn, { backgroundColor: C.tint, flex: 1 }]}
              disabled={busy}
              onPress={() => scanPages()}>
              <ThemedText style={styles.pickText}>
                {scanned.length > 0 ? 'Scan more pages' : 'Scan pages'}
              </ThemedText>
              {scanned.length === 0 && (
                <ThemedText style={styles.pickSub}>auto-cropped, black and white</ThemedText>
              )}
            </Pressable>
          )}
        </View>

        {picked && (
          <View style={styles.fileChip}>
            <Feather name="file-text" size={16} color={C.tint} />
            <ThemedText style={styles.fileChipName} numberOfLines={1}>
              {picked.name}
            </ThemedText>
            <Feather name="check" size={18} color={Palette.success} />
          </View>
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
              Tap a page to rescan just that page. Done? Tap Add to library.
            </ThemedText>
          </View>
        )}

        {/* The scanner coaching used to be a permanent paragraph up top; it
            only matters when scanning, so it now folds away here. */}
        {!fromImslp && (scanned.length > 0 || !hasSource) && (
          <CollapsibleHelp title="Scanning tips">
            <ThemedText style={{ fontSize: Type.size.sm, opacity: 0.7 }}>
              In the scanner, switch Auto to Manual (top right) to check and fix
              each page&apos;s corners as you shoot.
              {'\n\n'}For a bound part (facing pages with a center fold), a
              dedicated scanner app like Genius Scan splits the pages better.
              Scan there, save the PDF to Files, then add it with From Files.
            </ThemedText>
          </CollapsibleHelp>
        )}

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
        onPress={() => {
          // Batch rows carry their own titles; single PDF / scans get named
          // in the pop-up, which is also how the flow confirms the add.
          if (isBatch) void onAdd();
          else setNamePromptVisible(true);
        }}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.addText}>
            {isBatch ? `Add ${batch.length} parts` : 'Add to library'}
          </ThemedText>
        )}
      </Pressable>

      {/* The one place naming happens: pops right after a PDF is picked, and
          again from the Add button (scans, or if the first prompt was
          dismissed). Pre-filled from the filename / IMSLP title. */}
      <PromptModal
        visible={namePromptVisible}
        title="Name this part"
        message="So you can find it in your library."
        initialValue={title}
        placeholder="e.g. Mahler 9, Clarinet I"
        submitLabel="Add to library"
        onSubmit={(name) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          setNamePromptVisible(false);
          setTitle(trimmed);
          void onAdd(trimmed);
        }}
        onCancel={() => setNamePromptVisible(false)}
      />
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
  pickSub: { color: '#D9EAF1', fontWeight: Type.weight.semibold, fontSize: Type.size.xs },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    ...Lift,
  },
  fileChipName: {
    flex: 1,
    fontWeight: Type.weight.semibold,
    fontSize: Type.size.sm,
  },
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
