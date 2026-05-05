// Document viewer.
//
// One page on screen at a time. Navigate with:
//   - Tap the left or right edge of the page → previous / next.
//   - Swipe horizontally → previous / next (paging-enabled ScrollView).
//   - Arrow keys on desktop → previous / next.
//
// Sub-toolbar holds the passage-marking controls (idle / draw / resize states).

import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ActionSheet, type ActionSheetItem } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PageBoxOverlay } from '@/components/PageBoxOverlay';
import { PassageRectDrawer } from '@/components/PassageRectDrawer';
import { PassageRectResizer } from '@/components/PassageRectResizer';
import { PostSaveSheet } from '@/components/PostSaveSheet';
import { PromptModal } from '@/components/PromptModal';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Type } from '@/constants/tokens';
import {
  getDocument,
  parsePages,
  type DocumentPage,
  type DocumentRow,
} from '@/lib/db/repos/documents';
import {
  insertPassage,
  listPassagesInDocument,
  parseRegions,
  renamePassage,
  softDeletePassage,
  updatePassageRegionsAndAssets,
  type Passage,
  type PassageRegion,
} from '@/lib/db/repos/passages';
import { cropToBlob, stitchVertically, type Rect } from '@/lib/image/canvasCrop';
import { uploadPassageImage } from '@/lib/supabase/storage';

function newPassageId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type Mode = 'idle' | 'draw' | 'resize';

export default function DocumentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();

  const [doc, setDoc] = useState<DocumentRow | null | undefined>(undefined);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [boxesOn, setBoxesOn] = useState(true);
  const [mode, setMode] = useState<Mode>('idle');
  const [selectedPassageId, setSelectedPassageId] = useState<string | null>(null);
  const [renamePromptFor, setRenamePromptFor] = useState<Passage | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<Passage | null>(null);
  const [pagerSize, setPagerSize] = useState({ width: 0, height: 0 });

  // Draw-mode state. drafts maps 1-indexed pageIndex → source-pixel rect.
  // The page on which the user dragged FIRST is "drag-anchor"; subsequent
  // pages are added via "Add next page →" (Step 6).
  const [drafts, setDrafts] = useState<Map<number, Rect>>(new Map());
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [postSaveTitle, setPostSaveTitle] = useState<string | null>(null);
  const lastCreatedPassageIdRef = useRef<string | null>(null);
  const pendingFirstDrawnPageRef = useRef<number | null>(null);

  // Resize-mode state. resizingPassage = the passage being edited; resizeRegions
  // is the live (uncommitted) regions array — Done writes it back.
  const [resizingPassage, setResizingPassage] = useState<Passage | null>(null);
  const [resizeRegions, setResizeRegions] = useState<PassageRegion[]>([]);
  const [savingResize, setSavingResize] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    const [row, ps] = await Promise.all([getDocument(id), listPassagesInDocument(id)]);
    setDoc(row);
    if (row) setPages(parsePages(row.pages_json));
    setPassages(ps);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const onPagerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setPagerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }, []);

  const selectedPassage = selectedPassageId
    ? passages.find((p) => p.id === selectedPassageId) ?? null
    : null;

  function goTo(index: number) {
    if (index < 0 || index >= pages.length) return;
    scrollRef.current?.scrollTo({ x: width * index, animated: true });
    setCurrentIndex(index);
  }

  // Keyboard arrows (no-op while drawing/resizing — that mode owns the gestures).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function onKey(e: KeyboardEvent) {
      if (mode !== 'idle') return;
      if (e.key === 'ArrowRight') goTo(currentIndex + 1);
      else if (e.key === 'ArrowLeft') goTo(currentIndex - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, pages.length, width, mode]);

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / Math.max(width, 1));
    if (idx !== currentIndex) setCurrentIndex(idx);
  }

  function startDraw() {
    setBoxesOn(true);
    setSelectedPassageId(null);
    setDrafts(new Map());
    setMode('draw');
  }

  function cancelDraw() {
    setDrafts(new Map());
    setMode('idle');
    pendingFirstDrawnPageRef.current = null;
  }

  function setDraftForPage(pageIndex: number, region: Rect | null) {
    setDrafts((prev) => {
      const next = new Map(prev);
      if (region) {
        if (pendingFirstDrawnPageRef.current === null) {
          pendingFirstDrawnPageRef.current = pageIndex;
        }
        next.set(pageIndex, region);
      } else {
        next.delete(pageIndex);
      }
      return next;
    });
  }

  // Step 6 hook — multi-page draw.
  function addNextPageToDraft() {
    const next = currentIndex + 1;
    if (next >= pages.length) return;
    goTo(next);
  }

  async function onSaveDraftClick() {
    if (drafts.size === 0) return;
    setNamePromptOpen(true);
  }

  async function onNamePromptSubmit(value: string) {
    setNamePromptOpen(false);
    const title = value.trim();
    if (!title) {
      // Empty name = cancel the save but keep drafts so user can retry.
      return;
    }
    if (drafts.size === 0 || !doc) return;
    setSavingDraft(true);
    try {
      // Sort drafts by page so the composite stacks top-to-bottom in document order.
      const ordered = Array.from(drafts.entries()).sort((a, b) => a[0] - b[0]);
      const blobs: Blob[] = [];
      const regions: PassageRegion[] = [];
      for (const [pageIndex, rect] of ordered) {
        const page = pages.find((pp) => pp.index === pageIndex);
        if (!page) continue;
        const blob = await cropToBlob(page.image_uri, rect);
        blobs.push(blob);
        regions.push({ page: pageIndex, x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      }
      const finalBlob = blobs.length === 1 ? blobs[0] : await stitchVertically(blobs);

      const passageId = newPassageId();
      const file = new File([finalBlob], `${passageId}.jpg`, { type: 'image/jpeg' });
      const publicUrl = await uploadPassageImage(passageId, file);
      await insertPassage({
        id: passageId,
        title,
        source_kind: 'image',
        source_uri: publicUrl,
        thumbnail_uri: publicUrl,
        document_id: doc.id,
        regions,
      });

      lastCreatedPassageIdRef.current = passageId;
      setDrafts(new Map());
      setMode('idle');
      pendingFirstDrawnPageRef.current = null;
      setPostSaveTitle(title);
      // Refresh in background so the new gray box appears when user picks "Mark another".
      refresh();
    } catch (e) {
      console.warn('[document] save passage failed', e);
    } finally {
      setSavingDraft(false);
    }
  }

  function buildSelectedActions(passage: Passage): ActionSheetItem[] {
    return [
      {
        label: 'Practice this',
        onPress: () => {
          setSelectedPassageId(null);
          router.push(`/passage/${passage.id}` as never);
        },
      },
      {
        label: 'Rename',
        onPress: () => {
          setSelectedPassageId(null);
          setRenamePromptFor(passage);
        },
      },
      {
        label: 'Resize',
        onPress: () => {
          setSelectedPassageId(null);
          startResize(passage);
        },
      },
      {
        label: 'Delete',
        destructive: true,
        onPress: () => {
          // Open the confirm modal instead of window.confirm — iPad Safari
          // suppresses native dialogs, and this also looks cohesive with the
          // rest of the app's modals.
          setSelectedPassageId(null);
          setDeleteConfirmFor(passage);
        },
      },
    ];
  }

  async function onPassageRenameSubmit(value: string) {
    if (!renamePromptFor) return;
    const trimmed = value.trim();
    if (trimmed) await renamePassage(renamePromptFor.id, trimmed);
    setRenamePromptFor(null);
    refresh();
  }

  async function onConfirmDelete() {
    if (!deleteConfirmFor) return;
    const id = deleteConfirmFor.id;
    setDeleteConfirmFor(null);
    try {
      await softDeletePassage(id);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[document] delete passage failed', err);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Could not delete passage: ${msg}`);
      }
    }
  }

  function startResize(passage: Passage) {
    const regions = parseRegions(passage.regions_json);
    if (regions.length === 0) return;
    setResizingPassage(passage);
    setResizeRegions(regions);
    setBoxesOn(true);
    setMode('resize');
    // Snap to the first region's page so the user starts on something they can edit.
    const firstPage = regions[0].page - 1;
    if (firstPage !== currentIndex) goTo(firstPage);
  }

  function cancelResize() {
    setResizingPassage(null);
    setResizeRegions([]);
    setMode('idle');
  }

  function setRegionForPage(pageIndex: number, next: Rect) {
    setResizeRegions((prev) =>
      prev.map((r) => (r.page === pageIndex ? { page: pageIndex, ...next } : r)),
    );
  }

  async function commitResize() {
    if (!resizingPassage || resizeRegions.length === 0) return;
    setSavingResize(true);
    try {
      const ordered = [...resizeRegions].sort((a, b) => a.page - b.page);
      const blobs: Blob[] = [];
      for (const r of ordered) {
        const page = pages.find((pp) => pp.index === r.page);
        if (!page) continue;
        const blob = await cropToBlob(page.image_uri, { x: r.x, y: r.y, w: r.w, h: r.h });
        blobs.push(blob);
      }
      const finalBlob = blobs.length === 1 ? blobs[0] : await stitchVertically(blobs);
      const file = new File([finalBlob], `${resizingPassage.id}.jpg`, { type: 'image/jpeg' });
      const publicUrl = await uploadPassageImage(resizingPassage.id, file);
      await updatePassageRegionsAndAssets(resizingPassage.id, ordered, publicUrl, publicUrl);
      setResizingPassage(null);
      setResizeRegions([]);
      setMode('idle');
      await refresh();
    } catch (err) {
      console.warn('[document] resize commit failed', err);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const msg = err instanceof Error ? err.message : String(err);
        window.alert(`Could not save resize: ${msg}`);
      }
    } finally {
      setSavingResize(false);
    }
  }

  if (doc === undefined) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }
  if (doc === null) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Document not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="LIBRARY"
        center={
          <View style={{ alignItems: 'center' }}>
            <ThemedText style={styles.title}>{doc.title}</ThemedText>
            {doc.composer ? (
              <ThemedText style={styles.subtitle}>{doc.composer}</ThemedText>
            ) : null}
          </View>
        }
        right={
          pages.length > 0 ? (
            <ThemedText style={styles.counter}>
              {currentIndex + 1} / {pages.length}
            </ThemedText>
          ) : null
        }
        sub={renderSubRow({
          mode,
          boxesOn,
          setBoxesOn,
          startDraw,
          drafts,
          currentIndex,
          pageCount: pages.length,
          savingDraft,
          onCancelDraw: cancelDraw,
          onAddNextPage: addNextPageToDraft,
          onSaveDraft: onSaveDraftClick,
          resizeRegionCount: resizeRegions.length,
          resizingTitle: resizingPassage?.title ?? null,
          savingResize,
          onCancelResize: cancelResize,
          onCommitResize: commitResize,
        })}
      />
      <View style={styles.pagerWrap} onLayout={onPagerLayout}>
        {pages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <ThemedText style={styles.emptyText}>No pages rendered yet.</ThemedText>
          </View>
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              // Resize mode keeps swipes enabled so the user can move between
              // pages of a multi-page passage; the handles capture pointer
              // events on touchstart, so handle drags don't trigger paging.
              scrollEnabled={mode !== 'draw'}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onScrollEnd}
              onScrollEndDrag={onScrollEnd}>
              {pages.map((p) => {
                const drawerActive = mode === 'draw' && p.index === currentIndex + 1;
                return (
                  <View key={p.index} style={[styles.pageSlot, { width }]}>
                    <Image
                      source={{ uri: p.image_uri }}
                      style={styles.pageImage}
                      contentFit="contain"
                    />
                    <PageBoxOverlay
                      passages={
                        mode === 'resize' && resizingPassage
                          ? // Hide the passage being resized; the resizer renders it.
                            passages.filter((pp) => pp.id !== resizingPassage.id)
                          : passages
                      }
                      pageIndex={p.index}
                      sourceWidth={p.w}
                      sourceHeight={p.h}
                      slotWidth={width}
                      slotHeight={pagerSize.height}
                      visible={boxesOn && mode !== 'draw'}
                      selectedId={selectedPassageId}
                      onSelect={setSelectedPassageId}
                      onDeselect={() => setSelectedPassageId(null)}
                    />
                    {mode === 'draw' && (
                      <PassageRectDrawer
                        pageIndex={p.index}
                        sourceWidth={p.w}
                        sourceHeight={p.h}
                        slotWidth={width}
                        slotHeight={pagerSize.height}
                        draftRegion={drafts.get(p.index) ?? null}
                        active={drawerActive}
                        onDraftChange={(r) => setDraftForPage(p.index, r)}
                      />
                    )}
                    {mode === 'resize' && resizingPassage && (() => {
                      const r = resizeRegions.find((rr) => rr.page === p.index);
                      if (!r) return null;
                      return (
                        <PassageRectResizer
                          pageIndex={p.index}
                          sourceWidth={p.w}
                          sourceHeight={p.h}
                          slotWidth={width}
                          slotHeight={pagerSize.height}
                          region={{ x: r.x, y: r.y, w: r.w, h: r.h }}
                          onRegionChange={(next) => setRegionForPage(p.index, next)}
                        />
                      );
                    })()}
                  </View>
                );
              })}
            </ScrollView>

            {/* Edge tap zones — only active in idle mode so they don't swallow
                drag gestures during draw/resize, and only active when nothing
                is selected so the deselect-by-tapping-backdrop still works. */}
            {mode === 'idle' && !selectedPassageId && (
              <>
                <Pressable
                  style={[styles.tapZone, { left: 0, width: 60 }]}
                  onPress={() => goTo(currentIndex - 1)}
                  accessibilityLabel="Previous page"
                />
                <Pressable
                  style={[styles.tapZone, { right: 0, width: 60 }]}
                  onPress={() => goTo(currentIndex + 1)}
                  accessibilityLabel="Next page"
                />
              </>
            )}
          </>
        )}
      </View>

      <ActionSheet
        visible={selectedPassage !== null}
        title={selectedPassage?.title}
        items={selectedPassage ? buildSelectedActions(selectedPassage) : []}
        onCancel={() => setSelectedPassageId(null)}
      />

      <PromptModal
        visible={renamePromptFor !== null}
        title="Rename passage"
        initialValue={renamePromptFor?.title ?? ''}
        placeholder="New name"
        submitLabel="Save"
        onSubmit={onPassageRenameSubmit}
        onCancel={() => setRenamePromptFor(null)}
      />

      <PromptModal
        visible={namePromptOpen}
        title="Name this passage"
        initialValue=""
        placeholder="e.g. bars 281–291"
        submitLabel="Save"
        onSubmit={onNamePromptSubmit}
        onCancel={() => setNamePromptOpen(false)}
      />

      <PostSaveSheet
        visible={postSaveTitle !== null}
        passageTitle={postSaveTitle ?? ''}
        onPracticeNow={() => {
          const newId = lastCreatedPassageIdRef.current;
          setPostSaveTitle(null);
          if (newId) router.push(`/passage/${newId}` as never);
        }}
        onMarkAnother={() => {
          setPostSaveTitle(null);
          startDraw();
        }}
        onDone={() => setPostSaveTitle(null)}
        onCancel={() => setPostSaveTitle(null)}
      />

      <ConfirmModal
        visible={deleteConfirmFor !== null}
        title={`Delete "${deleteConfirmFor?.title ?? ''}"?`}
        message="The box will be removed from this document. Your practice records for it stay in your log."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirmDelete}
        onCancel={() => setDeleteConfirmFor(null)}
      />
    </ThemedView>
  );
}

function renderSubRow(args: {
  mode: Mode;
  boxesOn: boolean;
  setBoxesOn: (v: boolean) => void;
  startDraw: () => void;
  drafts: Map<number, unknown>;
  currentIndex: number;
  pageCount: number;
  savingDraft: boolean;
  onCancelDraw: () => void;
  onAddNextPage: () => void;
  onSaveDraft: () => void;
  resizeRegionCount: number;
  resizingTitle: string | null;
  savingResize: boolean;
  onCancelResize: () => void;
  onCommitResize: () => void;
}) {
  const {
    mode,
    boxesOn,
    setBoxesOn,
    startDraw,
    drafts,
    currentIndex,
    pageCount,
    savingDraft,
    onCancelDraw,
    onAddNextPage,
    onSaveDraft,
    resizeRegionCount,
    resizingTitle,
    savingResize,
    onCancelResize,
    onCommitResize,
  } = args;
  if (mode === 'idle') {
    return (
      <View style={styles.subRow}>
        <Button
          label={boxesOn ? 'Boxes shown' : 'Boxes hidden'}
          variant={boxesOn ? 'outline' : 'ghost'}
          size="sm"
          onPress={() => setBoxesOn(!boxesOn)}
        />
        <View style={{ flex: 1 }} />
        <Button label="+ Mark passage" variant="primary" size="sm" onPress={startDraw} />
      </View>
    );
  }
  if (mode === 'draw') {
    const hasDraftOnCurrent = drafts.has(currentIndex + 1);
    const hasAnyDraft = drafts.size > 0;
    const canAddNextPage = hasDraftOnCurrent && currentIndex + 1 < pageCount;
    return (
      <View style={styles.subRow}>
        <Button label="Cancel" variant="ghost" size="sm" onPress={onCancelDraw} />
        <View style={{ flex: 1, paddingHorizontal: Spacing.sm }}>
          <Button
            label={hasDraftOnCurrent ? `Drawn on p. ${currentIndex + 1}` : 'Drag a box on this page'}
            variant="ghost"
            size="sm"
            onPress={() => {
              /* hint, no action */
            }}
            disabled
          />
        </View>
        {canAddNextPage && (
          <Button label="Add next page →" variant="outline" size="sm" onPress={onAddNextPage} />
        )}
        <Button
          label={savingDraft ? 'Saving…' : 'Save'}
          variant="primary"
          size="sm"
          onPress={onSaveDraft}
          disabled={!hasAnyDraft || savingDraft}
        />
      </View>
    );
  }
  if (mode === 'resize') {
    const hint = resizingTitle
      ? resizeRegionCount > 1
        ? `Resizing "${resizingTitle}" — swipe between pages to edit each region`
        : `Resizing "${resizingTitle}" — drag the corners or edges`
      : 'Drag the corners or edges';
    return (
      <View style={styles.subRow}>
        <Button label="Cancel" variant="ghost" size="sm" onPress={onCancelResize} />
        <View style={{ flex: 1, paddingHorizontal: Spacing.sm }}>
          <Button label={hint} variant="ghost" size="sm" onPress={() => undefined} disabled />
        </View>
        <Button
          label={savingResize ? 'Saving…' : 'Done'}
          variant="primary"
          size="sm"
          onPress={onCommitResize}
          disabled={savingResize}
        />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: Type.size.md, fontWeight: Type.weight.bold },
  subtitle: { fontSize: Type.size.sm, opacity: 0.6 },
  counter: { fontSize: Type.size.sm, opacity: 0.7, paddingRight: 6 },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  pagerWrap: { flex: 1 },
  pageSlot: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageImage: {
    width: '100%',
    height: '100%',
  },
  tapZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { opacity: 0.6 },
});
