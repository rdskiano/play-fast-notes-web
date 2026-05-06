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
import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { PageBoxOverlay } from '@/components/PageBoxOverlay';
import { PassageRectDrawer } from '@/components/PassageRectDrawer';
import { PassageRectResizer } from '@/components/PassageRectResizer';
import { PostSaveSheet } from '@/components/PostSaveSheet';
import { PromptModal } from '@/components/PromptModal';
import { SectionMarkerCapturer } from '@/components/SectionMarkerCapturer';
import { SectionsModal } from '@/components/SectionsModal';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Type } from '@/constants/tokens';
import {
  getDocument,
  parsePages,
  parseSections,
  sectionForPage,
  updateDocumentSections,
  type DocumentPage,
  type DocumentRow,
  type DocumentSection,
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
type ViewMode = 'single' | 'spread';

export default function DocumentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();

  const [doc, setDoc] = useState<DocumentRow | null | undefined>(undefined);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [boxesOn, setBoxesOn] = useState(true);
  const [mode, setMode] = useState<Mode>('idle');

  // View mode is derived from orientation: landscape = spread, portrait = single.
  // The user can override (e.g. force single in landscape for tall staves).
  // Dimensions used to derive viewMode are FROZEN during any save flow —
  // iPad Safari's on-screen keyboard shrinks the viewport when a TextInput
  // focuses; without this freeze, width:height flips, viewMode auto-swaps
  // single → spread, and when the keyboard dismisses the user lands on the
  // wrong page. The freeze is set up below the state declarations so it can
  // observe all save-flow flags.
  const [viewModeOverride, setViewModeOverride] = useState<ViewMode | null>(null);
  const dimensionsBaselineRef = useRef({ w: width, h: height });
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

  const [sectionsModalOpen, setSectionsModalOpen] = useState(false);
  const [markingSection, setMarkingSection] = useState(false);

  // Save-flow flag — freezes the dimensions used by viewMode derivation so
  // the iPad on-screen keyboard's viewport resize can't trigger a spurious
  // single→spread flip while the user is mid-save.
  const isSaveActive =
    mode === 'draw' ||
    namePromptOpen ||
    postSaveTitle !== null ||
    markingSection ||
    sectionsModalOpen;
  useEffect(() => {
    if (!isSaveActive) {
      dimensionsBaselineRef.current = { w: width, h: height };
    }
  }, [width, height, isSaveActive]);
  const effectiveDims = isSaveActive ? dimensionsBaselineRef.current : { w: width, h: height };
  const isLandscape = effectiveDims.w > effectiveDims.h;
  const autoViewMode: ViewMode = isLandscape ? 'spread' : 'single';
  const viewMode: ViewMode = viewModeOverride ?? autoViewMode;
  function toggleViewMode() {
    const nextMode: ViewMode = viewMode === 'spread' ? 'single' : 'spread';
    setViewModeOverride(nextMode === autoViewMode ? null : nextMode);
  }

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

  const sections = doc ? parseSections(doc.sections_json) : [];
  // 1-indexed page on the LEFT of the current screen — used both for the
  // "Start section on p. X" affordance and for resolving the current section.
  const currentVisiblePage = currentIndex * (viewMode === 'spread' ? 2 : 1) + 1;
  const currentSection = sectionForPage(sections, currentVisiblePage);

  async function onSectionsChange(next: DocumentSection[]) {
    if (!doc) return;
    const sortedNext = [...next].sort((a, b) =>
      a.start_page === b.start_page ? a.start_y - b.start_y : a.start_page - b.start_page,
    );
    try {
      await updateDocumentSections(doc.id, sortedNext);
      // Update local state directly instead of re-fetching the whole document.
      // refresh() rebuilt the pages array (new reference) which caused the
      // ScrollView to re-render its children and snap scroll back to page 0.
      setDoc({ ...doc, sections_json: JSON.stringify(sortedNext) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[document] update sections failed', err);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Could not save section: ${msg}`);
      }
    }
  }

  function startSectionMark() {
    setSelectedPassageId(null);
    setMarkingSection(true);
  }

  function cancelSectionMark() {
    setMarkingSection(false);
  }

  async function onCaptureSection(page: number, y: number) {
    // Use the browser-native window.prompt() — no React Modal in the way, so
    // there's no Modal mount/unmount triggering layout reflow on the
    // underlying ScrollView. iPad Safari's native dialog (when not blocked)
    // is rendered by the browser chrome, not React.
    const defaultName = `Section ${sections.length + 1}`;
    let name: string | null = defaultName;
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      // Empty default — let the user type fresh; we fall back to "Section N"
      // only if they leave it blank.
      name = window.prompt('Name this section');
    }
    if (name === null) {
      // User canceled.
      setMarkingSection(false);
      return;
    }
    const finalName = name.trim() || defaultName;
    const next: DocumentSection[] = [
      ...sections.filter((s) => !(s.start_page === page && s.start_y === y)),
      { name: finalName, start_page: page, start_y: y },
    ];
    setMarkingSection(false);
    await onSectionsChange(next);
  }

  // Screen = one paging unit in the ScrollView. In single mode, screen N
  // shows page N+1. In spread mode, screen N shows pages 2N+1 and 2N+2.
  const pagesPerScreen = viewMode === 'spread' ? 2 : 1;
  const screenCount = Math.max(1, Math.ceil(pages.length / pagesPerScreen));

  function pagesForScreen(screenIdx: number): DocumentPage[] {
    const startPage = screenIdx * pagesPerScreen + 1;
    return pages.filter((p) => p.index >= startPage && p.index < startPage + pagesPerScreen);
  }

  function screenForPage(pageIndex1Based: number): number {
    return Math.floor((pageIndex1Based - 1) / pagesPerScreen);
  }

  function goTo(index: number) {
    if (index < 0 || index >= screenCount) return;
    // During draw mode the ScrollView has scrollEnabled=false (overflow: hidden
    // on RN-Web) — Safari can refuse smooth-scroll on a hidden-overflow element
    // and the page just jitters in place. Use instant scroll in that case.
    const animated = mode !== 'draw';
    scrollRef.current?.scrollTo({ x: width * index, animated });
    setCurrentIndex(index);
  }


  // When orientation changes (viewMode flips), keep the same page in view
  // by converting the current screen index into the new mode's coordinates.
  const prevViewModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    const prev = prevViewModeRef.current;
    if (prev === viewMode) return;
    prevViewModeRef.current = viewMode;
    const oldPagesPerScreen = prev === 'spread' ? 2 : 1;
    const newPagesPerScreen = viewMode === 'spread' ? 2 : 1;
    const firstVisiblePage = currentIndex * oldPagesPerScreen + 1;
    const nextScreen = Math.floor((firstVisiblePage - 1) / newPagesPerScreen);
    // Defer the scroll until React has laid out the new ScrollView geometry.
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: width * nextScreen, animated: false });
      setCurrentIndex(nextScreen);
    }, 0);
  }, [viewMode, currentIndex, width]);

  // Keyboard arrows. Disabled during draw/resize because those modes own the
  // pointer; section-mark allows nav so the user can swipe-or-arrow to the
  // right page before tapping.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function onKey(e: KeyboardEvent) {
      if (mode === 'draw' || mode === 'resize') return;
      if (e.key === 'ArrowRight') goTo(currentIndex + 1);
      else if (e.key === 'ArrowLeft') goTo(currentIndex - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, pages.length, width, mode]);

  // Set during save flows — onScroll events fired by iPad Safari's
  // keyboard dismiss / layout-shift bookkeeping shouldn't override the
  // user's actual current screen.
  const suppressScrollEndRef = useRef(false);

  // Keep onScroll suppressed throughout passage-save (name prompt open OR
  // post-save sheet up), with a 1s tail after the sheet closes to absorb
  // trailing scroll events from iPad Safari's keyboard dismiss animation.
  useEffect(() => {
    if (namePromptOpen || postSaveTitle) {
      suppressScrollEndRef.current = true;
    } else {
      const t = setTimeout(() => {
        suppressScrollEndRef.current = false;
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [namePromptOpen, postSaveTitle]);

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (suppressScrollEndRef.current) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / Math.max(width, 1));
    if (idx !== currentIndex) setCurrentIndex(idx);
  }

  // Some browsers / RN-Web combos fire onScroll continuously but not
  // onMomentumScrollEnd reliably (especially on macOS trackpad and iPad
  // Safari with paging-enabled ScrollViews). Track scroll position on
  // every scroll event so currentIndex always reflects what's visible.
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (suppressScrollEndRef.current) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / Math.max(width, 1));
    if (idx !== currentIndex) setCurrentIndex(idx);
  }

  function startDraw() {
    setBoxesOn(true);
    setSelectedPassageId(null);
    setDrafts(new Map());
    setMarkingSection(false);
    setMode('draw');
  }

  function cancelDraw() {
    setDrafts(new Map());
    setMarkingSection(false);
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

  // Multi-page draw — advance to the next page after the highest one already
  // drafted, navigating to its screen if needed.
  function addNextPageToDraft() {
    if (drafts.size === 0) return;
    const maxDrawn = Math.max(...Array.from(drafts.keys()));
    const nextPage = maxDrawn + 1;
    if (nextPage > pages.length) return;
    const targetScreen = screenForPage(nextPage);
    if (targetScreen !== currentIndex) goTo(targetScreen);
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
        label: 'Practice this passage',
        primary: true,
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
            {currentSection ? (
              <Pressable
                onLongPress={() => setSectionsModalOpen(true)}
                delayLongPress={400}
                accessibilityLabel="Manage sections (long-press)">
                <ThemedText style={styles.sectionLabel}>{currentSection.name}</ThemedText>
              </Pressable>
            ) : null}
          </View>
        }
        right={
          mode === 'idle' && pages.length > 0 ? (
            <View style={styles.headerRight}>
              {isLandscape && (
                <Button
                  label={viewMode === 'spread' ? 'Single page view' : 'Spread view'}
                  variant="outline"
                  size="sm"
                  onPress={toggleViewMode}
                />
              )}
              <Button
                label={boxesOn ? 'Boxes shown' : 'Boxes hidden'}
                variant="outline"
                size="sm"
                onPress={() => setBoxesOn(!boxesOn)}
              />
              <Button
                label={
                  sections.length === 0
                    ? 'Sections / Movements'
                    : `Sections (${sections.length})`
                }
                variant="outline"
                size="sm"
                onPress={() => setSectionsModalOpen(true)}
              />
              <Button
                label="Practice Log"
                variant="outline"
                size="sm"
                onPress={() => {
                  if (!doc) return;
                  router.push({
                    pathname: '/document-log',
                    params: { documentId: doc.id, documentTitle: doc.title },
                  } as never);
                }}
              />
              <Button
                label="+ Mark passage"
                variant="primary"
                size="sm"
                onPress={startDraw}
              />
              <ThemedText style={styles.counter}>
                {pageCounterLabel(currentIndex, pages.length, viewMode)}
              </ThemedText>
            </View>
          ) : pages.length > 0 ? (
            <ThemedText style={styles.counter}>
              {pageCounterLabel(currentIndex, pages.length, viewMode)}
            </ThemedText>
          ) : null
        }
        sub={renderSubRow({
          mode,
          drafts,
          currentIndex,
          pageCount: pages.length,
          // In spread view, the page after the most-recently-drawn one is
          // often already visible on the current screen — "Add next page →"
          // would be a no-op. Tell the renderer so it can swap the hint and
          // hide the button.
          nextPageVisibleOnScreen: (() => {
            if (drafts.size === 0) return false;
            const maxDrawn = Math.max(...Array.from(drafts.keys()));
            const nextPage = maxDrawn + 1;
            if (nextPage > pages.length) return false;
            return screenForPage(nextPage) === currentIndex;
          })(),
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
      {mode === 'idle' && (
        // Float the practice-timers pill over the PDF in the same top-right
        // area as other strategy screens, but absolute-positioned so the
        // page does not shrink to make room.
        <View pointerEvents="box-none" style={styles.timerFloat}>
          <PracticeTimersPill />
        </View>
      )}
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
              // Lock during draw mode so the ScrollView's horizontal swipe
              // recognizer doesn't intercept the user's second/third drag
              // as a page swipe. Also lock through the passage-save chain
              // (prompt → post-save sheet) so iPad Safari's keyboard
              // dismiss doesn't shift the ScrollView during transitions.
              // The page-1 reset bug we hit earlier was actually a viewMode
              // flip from the keyboard's viewport resize — fixed separately
              // via the dimensionsBaselineRef freeze above.
              scrollEnabled={
                mode !== 'draw' &&
                !markingSection &&
                !sectionsModalOpen &&
                !renamePromptFor &&
                !namePromptOpen &&
                !postSaveTitle
              }
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={32}
              onMomentumScrollEnd={onScrollEnd}
              onScrollEndDrag={onScrollEnd}>
              {Array.from({ length: screenCount }).map((_, screenIdx) => {
                const screenPages = pagesForScreen(screenIdx);
                const slotW = viewMode === 'spread' ? width / 2 : width;
                return (
                  <View
                    key={screenIdx}
                    style={[styles.pageSlot, { width, flexDirection: 'row' }]}>
                    {screenPages.map((p) => {
                      // In draw + resize modes, every page on the visible
                      // screen is interactive — user can drag in either half
                      // of a spread.
                      const drawerActive =
                        mode === 'draw' && screenForPage(p.index) === currentIndex;
                      return (
                        <View
                          key={p.index}
                          style={[styles.pageHalf, { width: slotW }]}>
                          <Image
                            source={{ uri: p.image_uri }}
                            style={styles.pageImage}
                            contentFit="contain"
                          />
                          <PageBoxOverlay
                            passages={
                              mode === 'resize' && resizingPassage
                                ? passages.filter((pp) => pp.id !== resizingPassage.id)
                                : passages
                            }
                            pageIndex={p.index}
                            sourceWidth={p.w}
                            sourceHeight={p.h}
                            slotWidth={slotW}
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
                              slotWidth={slotW}
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
                                slotWidth={slotW}
                                slotHeight={pagerSize.height}
                                region={{ x: r.x, y: r.y, w: r.w, h: r.h }}
                                onRegionChange={(next) => setRegionForPage(p.index, next)}
                              />
                            );
                          })()}
                          {markingSection && (
                            <SectionMarkerCapturer
                              pageIndex={p.index}
                              sourceWidth={p.w}
                              sourceHeight={p.h}
                              slotWidth={slotW}
                              slotHeight={pagerSize.height}
                              onCapture={onCaptureSection}
                            />
                          )}
                        </View>
                      );
                    })}
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

      {markingSection && (
        <View pointerEvents="box-none" style={styles.markBanner}>
          <View style={styles.markBannerInner}>
            <ThemedText style={styles.markBannerText}>
              Tap a page where the section starts
            </ThemedText>
            <Button label="Cancel" variant="ghost" size="sm" onPress={cancelSectionMark} />
          </View>
        </View>
      )}

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

      <SectionsModal
        visible={sectionsModalOpen}
        documentTitle={doc?.title ?? ''}
        sections={sections}
        onSectionsChange={onSectionsChange}
        onJumpToSection={(s) => {
          setSectionsModalOpen(false);
          const target = screenForPage(s.start_page);
          goTo(target);
        }}
        onAddSection={() => {
          setSectionsModalOpen(false);
          startSectionMark();
        }}
        onClose={() => setSectionsModalOpen(false)}
      />
    </ThemedView>
  );
}

function pageCounterLabel(currentIndex: number, pageCount: number, viewMode: ViewMode): string {
  if (viewMode === 'spread') {
    const left = currentIndex * 2 + 1;
    const right = left + 1;
    if (right > pageCount) return `${left} / ${pageCount}`;
    return `${left}-${right} / ${pageCount}`;
  }
  return `${currentIndex + 1} / ${pageCount}`;
}

function renderSubRow(args: {
  mode: Mode;
  drafts: Map<number, unknown>;
  currentIndex: number;
  pageCount: number;
  nextPageVisibleOnScreen: boolean;
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
    drafts,
    pageCount,
    nextPageVisibleOnScreen,
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
    // All idle controls live in the top-row right slot now — no sub row.
    return null;
  }
  if (mode === 'draw') {
    const hasAnyDraft = drafts.size > 0;
    const drawnPages = Array.from(drafts.keys()).sort((a, b) => a - b);
    const maxDrawn = drawnPages.length > 0 ? drawnPages[drawnPages.length - 1] : 0;
    const canAddNextPage = hasAnyDraft && maxDrawn < pageCount;
    // In spread view, the next page is often already on screen. Don't show
    // "Add next page →" then (it would be a no-op); instead, prompt the user
    // to drag directly on the visible page.
    const showAddNextPageButton = canAddNextPage && !nextPageVisibleOnScreen;
    const hint = !hasAnyDraft
      ? 'Drag a box on a page'
      : canAddNextPage && nextPageVisibleOnScreen
        ? `Drawn on p. ${drawnPages.join(', ')} — drag p. ${maxDrawn + 1} too if needed`
        : `Drawn on p. ${drawnPages.join(', ')}`;
    return (
      <View style={styles.subRow}>
        <Button label="Cancel" variant="ghost" size="sm" onPress={onCancelDraw} />
        <View style={{ flex: 1, paddingHorizontal: Spacing.sm }}>
          <Button label={hint} variant="ghost" size="sm" onPress={() => undefined} disabled />
        </View>
        {showAddNextPageButton && (
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
  sectionLabel: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    opacity: 0.85,
    marginTop: 2,
  },
  counter: { fontSize: Type.size.sm, opacity: 0.7, paddingRight: 6 },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  timerFloat: {
    position: 'absolute',
    top: 70,
    right: Spacing.sm,
    zIndex: 50,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pagerWrap: { flex: 1 },
  pageSlot: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageHalf: {
    height: '100%',
    position: 'relative',
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
  markBanner: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  markBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 999,
    backgroundColor: '#000c',
  },
  markBannerText: {
    color: '#fff',
    fontWeight: Type.weight.semibold,
  },
});
