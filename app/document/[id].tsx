// Document viewer.
//
// One page on screen at a time. Navigate with:
//   - Tap the left or right edge of the page → previous / next.
//   - Swipe horizontally → previous / next (paging-enabled ScrollView).
//   - Arrow keys on desktop → previous / next.
//
// Sub-toolbar holds the passage-marking controls (idle / draw / resize states).

import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import { RegionAnnotationCanvas } from '@/components/RegionAnnotationCanvas';
import { Button } from '@/components/Button';
import { DocumentPageImage } from '@/components/DocumentPageImage';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PageBoxOverlay } from '@/components/PageBoxOverlay';
import { ZoomableImage } from '@/components/ZoomableImage';
import { PassageRectDrawer } from '@/components/PassageRectDrawer';
import { PassageRectResizer } from '@/components/PassageRectResizer';
import { PostSaveSheet } from '@/components/PostSaveSheet';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { PromptModal } from '@/components/PromptModal';
import { SectionMarkerCapturer } from '@/components/SectionMarkerCapturer';
import { SectionsModal } from '@/components/SectionsModal';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { getSetting, setSetting } from '@/lib/db/repos/settings';

// One-time coach toast key. Shown on the first PDF visit where the
// user already has marked passages — teaches that the gray boxes are
// tappable to launch practice. After dismissal (tap or auto-timeout)
// the flag persists so the toast never appears again, on any PDF.
const PDF_BOX_COACHED_KEY = 'pdfBox.coached';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
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
import {
  getDocumentPassageStatus,
  type PassageStatus,
} from '@/lib/db/repos/passageStatus';
import { countPracticeLogEntries } from '@/lib/db/repos/practiceLog';
import { cropImage, stitchVerticallyUris, type Rect } from '@/lib/image/canvasCrop';
import { persistPassageImage } from '@/lib/image/persistPassageImage';
import { resolvePageImageUri } from '@/lib/pdf/pageImage';
import { consumeLastPassageInDoc } from '@/lib/sessions/lastPassageInDoc';
import { useDocumentAnnotation } from '@/hooks/useDocumentAnnotation';

function newPassageId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type Mode = 'idle' | 'draw' | 'resize';
type ViewMode = 'single' | 'spread';

export default function DocumentScreen() {
  const router = useRouter();
  const { id, resize: resizeParam } = useLocalSearchParams<{
    id: string;
    resize?: string;
  }>();
  const { width, height } = useWindowDimensions();
  const C = Colors[useColorScheme() ?? 'light'];
  // Phone density: tight icon-only header so the title + tool buttons
  // don't pile on top of each other in narrow viewports.
  const isPhone = Math.min(width, height) < 600;
  // Touch surfaces (iPhone + iPad, and iPad Safari on web) get pinch-zoom of
  // the page; mouse-only laptops don't (no pinch gesture, and they have the
  // framed static view instead).
  const isTouch = useIsTouchDevice();

  const [doc, setDoc] = useState<DocumentRow | null | undefined>(undefined);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [statusByPassage, setStatusByPassage] = useState<Map<string, PassageStatus>>(
    new Map(),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [boxesOn, setBoxesOn] = useState(true);
  const [mode, setMode] = useState<Mode>('idle');
  // One-time "tap a box to practice" coach. `null` until we've checked
  // the persisted flag so we don't flash the toast and then immediately
  // hide it on a returning user.
  const [pdfBoxCoachVisible, setPdfBoxCoachVisible] = useState<boolean | null>(null);
  // Global practice-log count for the PDF-overview tutorial gate.
  // null = still loading; 0 = first-timer. Combined with
  // passages.length === 0 below so the modal only fires on an empty
  // PDF AND only for users who've never run a practice session.
  const [practiceLogCount, setPracticeLogCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    countPracticeLogEntries()
      .then((n) => {
        if (!cancelled) setPracticeLogCount(n);
      })
      .catch(() => {
        // count failing just suppresses the tutorial — not fatal
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  // Sub-sheet for the secondary "Edit" actions (Rename / Resize / Delete).
  // Splitting them off the main passage-box sheet keeps the primary
  // "Practice this passage" action visually obvious — the edit options
  // are demoted to a single small "Edit" entry on the main sheet that
  // opens this sub-sheet on tap.
  const [editPassage, setEditPassage] = useState<Passage | null>(null);
  const [renamePromptFor, setRenamePromptFor] = useState<Passage | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<Passage | null>(null);
  const [pagerSize, setPagerSize] = useState({ width: 0, height: 0 });
  // Phone-only pinch-zoom of the page (idle reading mode only — never during
  // draw/resize/section-marking/annotating, where the box-drawing math runs in
  // un-zoomed slot coordinates). While a page is zoomed we lock the horizontal
  // pager so one-finger pan moves the page instead of flipping to the next.
  const [zoomedScreens, setZoomedScreens] = useState<Set<number>>(new Set());
  const setScreenZoomed = useCallback((idx: number, zoomed: boolean) => {
    setZoomedScreens((prev) => {
      if (zoomed === prev.has(idx)) return prev;
      const next = new Set(prev);
      if (zoomed) next.add(idx);
      else next.delete(idx);
      return next;
    });
  }, []);

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
  // Phone "more actions" menu — replaces a stack of header buttons that
  // wouldn't fit alongside the title.
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);
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
  // Phones are always single-page, even in landscape — a two-page spread on a
  // ~6" screen makes each page too small to read; the user wants one page +
  // pinch-zoom instead. Spread is an iPad/tablet (large-screen) affordance.
  const spreadCapable = isLandscape && !isPhone;
  const autoViewMode: ViewMode = spreadCapable ? 'spread' : 'single';
  // Portrait is always single-page — a two-page spread only makes sense in
  // landscape, where there's room for two pages side by side. The spread/
  // single toggle (and any saved override) only applies in landscape; in
  // portrait we ignore the override so a spread set in landscape doesn't
  // carry over when the iPad is rotated upright.
  const viewMode: ViewMode = spreadCapable ? (viewModeOverride ?? autoViewMode) : 'single';
  function toggleViewMode() {
    const nextMode: ViewMode = viewMode === 'spread' ? 'single' : 'spread';
    setViewModeOverride(nextMode === autoViewMode ? null : nextMode);
  }

  // The page Apple Pencil annotation applies to — 1-indexed, matching
  // DocumentPage.index (so `p.index === currentPage` picks the visible page).
  const currentPage = currentIndex * (viewMode === 'spread' ? 2 : 1) + 1;
  const docAnn = useDocumentAnnotation(id, currentPage);
  // Pinch-zoom on any touch device (iPhone + iPad) in idle mode — INCLUDING
  // while annotating, where it runs in draw mode (two-finger zoom, one-finger
  // draws on the pencil canvas). Still excluded during draw/resize/section-
  // marking, where the box math needs un-zoomed slot coordinates.
  const pageZoomEnabled = isTouch && mode === 'idle' && !markingSection;
  const currentPageZoomed = zoomedScreens.has(currentIndex);

  // Forward navigation (a push) doesn't fire 'beforeRemove', so an unsaved
  // page annotation must be flushed here first — else the next screen loads
  // stale data. Also drop the annotation-forced single-page view.
  const guardedNav = useCallback(
    async (navigate: () => void) => {
      if (docAnn.annotating) setViewModeOverride(null);
      await docAnn.flush();
      navigate();
    },
    [docAnn],
  );

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

  // If the caller navigated here with ?resize=<passageId> (the Crop button on
  // the passage screen for document-backed passages), jump straight into
  // resize mode for that passage once the passage list has loaded.
  const autoResizeFiredRef = useRef(false);
  useEffect(() => {
    if (autoResizeFiredRef.current) return;
    if (!resizeParam || passages.length === 0) return;
    const target = passages.find((p) => p.id === resizeParam);
    if (!target) return;
    autoResizeFiredRef.current = true;
    startResize(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeParam, passages]);

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

  // When returning from a passage, jump to that passage's first page. Effect
  // fires on every focus AND whenever passages / pages populate, so the
  // first-load race (focus before data arrives) self-resolves once data is in.
  // consumeLastPassageInDoc clears the hint after use so it does not fire
  // again on a later innocuous focus event.
  useFocusEffect(
    useCallback(() => {
      if (!id || passages.length === 0 || pages.length === 0) return;
      const lastId = consumeLastPassageInDoc(id);
      if (!lastId) return;
      const target = passages.find((p) => p.id === lastId);
      if (!target) return;
      const regions = parseRegions(target.regions_json);
      if (regions.length === 0) return;
      const targetPage = Math.min(...regions.map((r) => r.page));
      goTo(screenForPage(targetPage));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, passages, pages]),
  );

  // One-time "tap a box to practice" coach toast. Triggered the first
  // time a user opens any PDF that already has marked passages — the
  // common case where a returning user has gray boxes on the page but
  // doesn't know they're tappable. Auto-dismisses after 6 s; tap also
  // dismisses. The persisted flag is global (one toast, one PDF, ever).
  useEffect(() => {
    if (passages.length === 0) return;
    if (pdfBoxCoachVisible !== null) return; // already loaded
    let cancelled = false;
    getSetting(PDF_BOX_COACHED_KEY).then((raw) => {
      if (cancelled) return;
      setPdfBoxCoachVisible(raw !== '1');
    });
    return () => {
      cancelled = true;
    };
  }, [passages.length, pdfBoxCoachVisible]);

  // Auto-dismiss the coach after a few seconds — long enough to read the
  // single line of copy, short enough that it gets out of the way.
  useEffect(() => {
    if (pdfBoxCoachVisible !== true) return;
    const timer = setTimeout(() => {
      setPdfBoxCoachVisible(false);
      setSetting(PDF_BOX_COACHED_KEY, '1').catch(() => {});
    }, 6000);
    return () => clearTimeout(timer);
  }, [pdfBoxCoachVisible]);

  function dismissPdfBoxCoach() {
    setPdfBoxCoachVisible(false);
    setSetting(PDF_BOX_COACHED_KEY, '1').catch(() => {});
  }

  // Pull per-passage practice status (last date, Tempo Ladder %) on every
  // focus so the box badges reflect what happened during the just-finished
  // practice session.
  useFocusEffect(
    useCallback(() => {
      if (passages.length === 0) return;
      let cancelled = false;
      getDocumentPassageStatus(passages.map((p) => p.id))
        .then((s) => {
          if (!cancelled) setStatusByPassage(s);
        })
        .catch(() => {
          // Badges are an enhancement, not required.
        });
      return () => {
        cancelled = true;
      };
    }, [passages]),
  );

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

  // Snap the pager to the exact offset for page `x`. RN-Web's native paging can
  // land a few px off on the FIRST turn (the swipe mounts a neighbor page
  // mid-scroll, disrupting the snap), leaving a sliver of the next page
  // showing. Guarded so it's a no-op on turns that already landed square.
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function snapToExactPage(x: number) {
    // WEB ONLY. On native, iOS pagingEnabled snaps to an exact page boundary on
    // its own; calling scrollTo here mid-snap fights that native animation and
    // parks the page between two pages. The old iPad-native viewer had no such
    // correction and turned pages cleanly — so we match it and bail on native.
    // This stays for RN-Web (iPad Safari), where pagingEnabled lands a few px off.
    if (Platform.OS !== 'web') return;
    if (suppressScrollEndRef.current || width <= 0) return;
    const idx = Math.round(x / width);
    const targetX = width * idx;
    if (Math.abs(x - targetX) > 1) {
      scrollRef.current?.scrollTo({ x: targetX, animated: true });
    }
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (suppressScrollEndRef.current) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / Math.max(width, 1));
    snapToExactPage(x); // no-op on native (see above); native paging self-snaps
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
    // WEB ONLY settle-snap. onMomentumScrollEnd is unreliable on iOS Safari
    // (the first turn often never fires it), so on web we also correct the
    // snap when the scroll stream goes quiet. On native this must not run —
    // the scrollTo it triggers fights native paging and parks pages mid-turn.
    if (Platform.OS !== 'web') return;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => snapToExactPage(x), 70);
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
      const croppedUris: string[] = [];
      const regions: PassageRegion[] = [];
      for (const [pageIndex, rect] of ordered) {
        const page = pages.find((pp) => pp.index === pageIndex);
        if (!page) continue;
        const pageUri = await resolvePageImageUri(doc, page);
        const uri = await cropImage(pageUri, rect);
        croppedUris.push(uri);
        regions.push({ page: pageIndex, x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      }
      const finalUri = await stitchVerticallyUris(croppedUris);

      const passageId = newPassageId();
      const sourceUri = await persistPassageImage(passageId, finalUri);
      await insertPassage({
        id: passageId,
        title,
        source_kind: 'image',
        source_uri: sourceUri,
        thumbnail_uri: sourceUri,
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

  // Two-tier menu on the passage-box tap: the main sheet shows just
  // "Practice this passage" (the obvious common case) and a small
  // "Edit…" entry. Tapping Edit hands off to `buildEditActions` below,
  // which renders Rename / Resize / Delete as its own focused sheet.
  function buildSelectedActions(passage: Passage): ActionSheetItem[] {
    return [
      {
        label: 'Practice this passage',
        primary: true,
        onPress: () => {
          setSelectedPassageId(null);
          guardedNav(() => router.push(`/passage/${passage.id}` as never));
        },
      },
      {
        label: 'Edit…',
        onPress: () => {
          setSelectedPassageId(null);
          setEditPassage(passage);
        },
      },
    ];
  }

  function buildEditActions(passage: Passage): ActionSheetItem[] {
    return [
      {
        label: 'Rename',
        onPress: () => {
          setEditPassage(null);
          setRenamePromptFor(passage);
        },
      },
      {
        label: 'Resize',
        onPress: () => {
          setEditPassage(null);
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
          setEditPassage(null);
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
    if (!resizingPassage || resizeRegions.length === 0 || !doc) return;
    setSavingResize(true);
    try {
      const ordered = [...resizeRegions].sort((a, b) => a.page - b.page);
      const croppedUris: string[] = [];
      for (const r of ordered) {
        const page = pages.find((pp) => pp.index === r.page);
        if (!page) continue;
        const pageUri = await resolvePageImageUri(doc, page);
        const uri = await cropImage(pageUri, { x: r.x, y: r.y, w: r.w, h: r.h });
        croppedUris.push(uri);
      }
      const finalUri = await stitchVerticallyUris(croppedUris);
      const sourceUri = await persistPassageImage(resizingPassage.id, finalUri);
      await updatePassageRegionsAndAssets(resizingPassage.id, ordered, sourceUri, sourceUri);
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

  const pencilProp = {
    active: docAnn.annotating,
    onToggle: () => {
      // Annotation edits one page — force single-page view so it's unambiguous.
      if (!docAnn.annotating) setViewModeOverride('single');
      else setViewModeOverride(null);
      docAnn.pencil.onToggle();
    },
  };

  return (
    <ThemedView style={styles.container}>
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel={isPhone ? '←' : 'LIBRARY'}
        center={
          // minWidth: 0 lets this flex child shrink below its content's
          // natural width so a long title ellipsizes instead of overflowing
          // into the right-slot icon buttons (B-023). Each Text also gets an
          // explicit maxWidth so RN-Web honours the truncation.
          <View style={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
            <ThemedText
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.title, isPhone && styles.titlePhone, { maxWidth: '100%' }]}>
              {doc.title}
            </ThemedText>
            {/* Composer hides on phone — title alone already wraps if it's
                long, and the next row of icons is fighting for space. */}
            {doc.composer && !isPhone ? (
              <ThemedText
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.subtitle, { maxWidth: '100%' }]}>
                {doc.composer}
              </ThemedText>
            ) : null}
            {currentSection ? (
              <Pressable
                onLongPress={() => setSectionsModalOpen(true)}
                delayLongPress={400}
                accessibilityLabel="Manage sections (long-press)">
                <ThemedText
                  numberOfLines={1}
                  style={[styles.sectionLabel, isPhone && { fontSize: 11 }]}>
                  {currentSection.name}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        }
        right={
          mode === 'idle' && pages.length > 0 ? (
            isPhone ? (
              // Phone: keep "+ Mark" visible as the primary action, hide
              // everything else behind a single ⋯ menu so the title row
              // has room to breathe. The menu uses the same ActionSheet
              // we already use elsewhere — labeled rows, no ambiguity
              // about what each glyph means.
              <View style={styles.headerRight}>
                <Pressable
                  onPress={startDraw}
                  accessibilityLabel="Mark passage"
                  style={[
                    styles.headerIconBtn,
                    { backgroundColor: C.tint, borderColor: C.tint },
                  ]}>
                  <ThemedText style={[styles.headerIconText, { color: '#fff' }]}>+</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setPhoneMenuOpen(true)}
                  accessibilityLabel="More actions"
                  style={[styles.headerIconBtn, { borderColor: C.icon }]}>
                  <ThemedText style={styles.headerIconText}>⋯</ThemedText>
                </Pressable>
              </View>
            ) : (
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
                  label={boxesOn ? 'Hide boxes' : 'Show boxes'}
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
                    guardedNav(() =>
                      router.push({
                        pathname: '/document-log',
                        params: { documentId: doc.id, documentTitle: doc.title },
                      } as never),
                    );
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
            )
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
          isPhone,
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
                !postSaveTitle &&
                !docAnn.annotating &&
                // Locked while a page is pinch-zoomed so one-finger pan moves
                // the page instead of flipping to the next.
                !currentPageZoomed
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
                      const pageInner = (
                        <>
                          <DocumentPageImage
                            doc={doc}
                            page={p}
                            style={styles.pageImage}
                            contentFit="contain"
                            // Only render the visible screen + immediate
                            // neighbors on demand — a big PDF has dozens of
                            // pages all mounted in this ScrollView at once.
                            active={Math.abs(screenForPage(p.index) - currentIndex) <= 2}
                          />
                          <PageBoxOverlay
                            passages={
                              mode === 'resize' && resizingPassage
                                ? passages.filter((pp) => pp.id !== resizingPassage.id)
                                : passages
                            }
                            statusByPassage={statusByPassage}
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
                          {docAnn.annotating && p.index === currentPage ? (
                            <RegionAnnotationCanvas
                              pageData={
                                docAnn.annotations.get(p.index)?.data ?? null
                              }
                              region={{ x: 0, y: 0, w: p.w, h: p.h }}
                              pageW={p.w}
                              pageH={p.h}
                              canvasRef={docAnn.canvasRef}
                              onChange={docAnn.onDraw}
                            />
                          ) : docAnn.annotations.get(p.index)?.imageUri ? (
                            <View
                              style={StyleSheet.absoluteFill}
                              pointerEvents="none">
                              <Image
                                source={{
                                  uri: docAnn.annotations.get(p.index)!
                                    .imageUri!,
                                }}
                                style={StyleSheet.absoluteFill}
                                contentFit="contain"
                              />
                            </View>
                          ) : null}
                          {mode === 'draw' && (() => {
                            // Once a draft exists for this page, swap the
                            // drag-to-draw surface for resize handles so the
                            // user can fine-tune the box they just drew.
                            // Empty pages keep the drawer so the initial
                            // drag still works.
                            const draft = drafts.get(p.index);
                            if (draft) {
                              return (
                                <PassageRectResizer
                                  pageIndex={p.index}
                                  sourceWidth={p.w}
                                  sourceHeight={p.h}
                                  slotWidth={slotW}
                                  slotHeight={pagerSize.height}
                                  region={draft}
                                  onRegionChange={(next) =>
                                    setDraftForPage(p.index, next)
                                  }
                                />
                              );
                            }
                            return (
                              <PassageRectDrawer
                                pageIndex={p.index}
                                sourceWidth={p.w}
                                sourceHeight={p.h}
                                slotWidth={slotW}
                                slotHeight={pagerSize.height}
                                draftRegion={null}
                                active={drawerActive}
                                onDraftChange={(r) =>
                                  setDraftForPage(p.index, r)
                                }
                              />
                            );
                          })()}
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
                        </>
                      );
                      return (
                        <View
                          key={p.index}
                          style={[styles.pageHalf, { width: slotW }]}>
                          {pageZoomEnabled ? (
                            // Reading mode on a phone: pinch to zoom the page +
                            // its boxes together (boxes are children, so they
                            // scale and stay tappable in the same coordinate
                            // space). Lock the pager while zoomed.
                            <ZoomableImage
                              style={StyleSheet.absoluteFill}
                              persistKey={`doc:${doc.id}:p${p.index}`}
                              // While the pencil is active: one finger draws on
                              // the canvas, two fingers still pinch-zoom.
                              drawMode={docAnn.annotating}
                              onZoomedChange={(z) =>
                                setScreenZoomed(screenForPage(p.index), z)
                              }>
                              {pageInner}
                            </ZoomableImage>
                          ) : (
                            pageInner
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
                is selected so the deselect-by-tapping-backdrop still works.
                The visible chevrons (below) give mouse users an affordance;
                the wider invisible zones keep the iPad's tap-anywhere-on-the-edge
                muscle memory intact. */}
            {mode === 'idle' && !selectedPassageId && !docAnn.annotating && !currentPageZoomed && (
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
                {currentIndex > 0 && (
                  <Pressable
                    onPress={() => goTo(currentIndex - 1)}
                    hitSlop={10}
                    style={[styles.spotNavBtn, styles.spotNavLeft, { borderColor: C.icon }]}
                    accessibilityLabel="Previous page">
                    <ThemedText style={[styles.spotNavGlyph, { color: C.tint }]}>‹</ThemedText>
                  </Pressable>
                )}
                {currentIndex < screenCount - 1 && (
                  <Pressable
                    onPress={() => goTo(currentIndex + 1)}
                    hitSlop={10}
                    style={[styles.spotNavBtn, styles.spotNavRight, { borderColor: C.icon }]}
                    accessibilityLabel="Next page">
                    <ThemedText style={[styles.spotNavGlyph, { color: C.tint }]}>›</ThemedText>
                  </Pressable>
                )}
              </>
            )}
          </>
        )}
        {mode === 'idle' && (
          <PracticeToolsLayer pencil={pencilProp} recorderDocumentId={id} />
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

      {/* First-visit coach toast — only renders when the user has marked
          passages on this (or any) PDF before, hasn't dismissed the toast
          yet, and isn't in the middle of section-marking or draw mode
          (those have their own banners that would compete). Auto-dismisses
          after 6 s or on tap. */}
      {pdfBoxCoachVisible === true &&
        boxesOn &&
        mode === 'idle' &&
        !markingSection &&
        passages.length > 0 && (
          <Pressable
            onPress={dismissPdfBoxCoach}
            accessibilityLabel="Dismiss tip"
            style={styles.coachToast}>
            <View style={styles.coachToastInner}>
              <ThemedText style={styles.coachToastText}>
                ▶ Tap a box to practice that passage
              </ThemedText>
              <ThemedText style={styles.coachToastDismiss}>✕</ThemedText>
            </View>
          </Pressable>
        )}

      {/* Step 5 of the guided first-session flow. Fires on an empty PDF
          for a true first-timer (no practice log entries yet) — orients
          them to the marking + sections + hide-boxes + practice-log
          workflow before they touch anything. Complements the existing
          `pdfBoxCoachVisible` toast, which only fires on PDFs that
          ALREADY have passages. */}
      <TutorialStep
        id="pdf-viewer-overview"
        visible={passages.length === 0 && practiceLogCount === 0}
        title="Working with a PDF"
        body={
          'Each page can hold as many "passages" as you want to drill independently.\n\n' +
          'Turn pages — tap the ‹ › chevrons at the edges, swipe sideways, or use the arrow keys.\n\n' +
          'Single / Spread (landscape only) — toggle between one page and a two-page spread.\n\n' +
          '+ Mark passage — drag a box around the music you want to drill. After you name it, it shows up in your library.\n\n' +
          'Tap any box to practice that passage, or pick Edit to rename, resize, or delete it.\n\n' +
          'Sections — tap the page to mark movement divisions or sections in the music; this makes the practice log easier to read. Long-press the section label at the top to manage them.\n\n' +
          'Hide boxes — clean read of the score without the gray rectangles.\n\n' +
          'Practice Log — every session you\'ve done on this PDF, across all passages.\n\n' +
          PRACTICE_TOOLS_HELP
        }
      />

      <ActionSheet
        visible={selectedPassage !== null}
        title={selectedPassage?.title}
        items={selectedPassage ? buildSelectedActions(selectedPassage) : []}
        onCancel={() => setSelectedPassageId(null)}
      />

      <ActionSheet
        visible={editPassage !== null}
        title={editPassage ? `Edit "${editPassage.title}"` : undefined}
        items={editPassage ? buildEditActions(editPassage) : []}
        onCancel={() => setEditPassage(null)}
      />

      <ActionSheet
        visible={phoneMenuOpen}
        title={doc?.title}
        items={[
          {
            label: boxesOn ? 'Hide passage boxes' : 'Show passage boxes',
            onPress: () => {
              setBoxesOn(!boxesOn);
              setPhoneMenuOpen(false);
            },
          },
          {
            label:
              sections.length === 0
                ? 'Sections / Movements'
                : `Sections (${sections.length})`,
            onPress: () => {
              setPhoneMenuOpen(false);
              setSectionsModalOpen(true);
            },
          },
          {
            label: 'Practice Log',
            onPress: () => {
              setPhoneMenuOpen(false);
              if (!doc) return;
              guardedNav(() =>
                router.push({
                  pathname: '/document-log',
                  params: { documentId: doc.id, documentTitle: doc.title },
                } as never),
              );
            },
          },
          ...(spreadCapable
            ? [
                {
                  label:
                    viewMode === 'spread' ? 'Single page view' : 'Spread view',
                  onPress: () => {
                    toggleViewMode();
                    setPhoneMenuOpen(false);
                  },
                },
              ]
            : []),
        ]}
        onCancel={() => setPhoneMenuOpen(false)}
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

      {docAnn.overlay}
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
  isPhone: boolean;
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
    isPhone,
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
        ? `p. ${drawnPages.join(', ')} — drag handles, or drag a box on p. ${maxDrawn + 1}`
        : `p. ${drawnPages.join(', ')} — drag the corners or edges to adjust`;
    return (
      <View style={styles.subRow}>
        <Button label="Cancel" variant="ghost" size="sm" onPress={onCancelDraw} />
        <View style={{ flex: 1, paddingHorizontal: Spacing.sm }}>
          {!isPhone && (
            <ThemedText numberOfLines={1} style={styles.subHint}>
              {hint}
            </ThemedText>
          )}
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
          {!isPhone && (
            <ThemedText numberOfLines={1} style={styles.subHint}>
              {hint}
            </ThemedText>
          )}
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
  // Phone-density title — shorter font + reserved for one line of text.
  titlePhone: { fontSize: Type.size.sm },
  subtitle: { fontSize: Type.size.sm, opacity: 0.6 },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: { fontSize: 18, lineHeight: 20, fontWeight: '600' },
  sectionLabel: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    opacity: 0.85,
    marginTop: 2,
  },
  counter: { fontSize: Type.size.sm, opacity: 0.7, paddingRight: 6 },
  subRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  // Single-line so a narrow viewport can never wrap the hint into a tall
  // one-character-per-line column (which used to stretch the whole top bar
  // down the screen on phones). Hidden entirely on phone — see renderSubRow.
  subHint: {
    fontSize: Type.size.sm,
    textAlign: 'center',
    opacity: 0.6,
  },
  timerFloat: {
    // top is computed inline via insets.top + topBarHeight + Spacing.sm so the
    // pill sits just below the SessionTopBar on both web (no safe area) and
    // iOS (notch/status bar adds to the safe area top).
    position: 'absolute',
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
  spotNavBtn: {
    position: 'absolute',
    top: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: Borders.thin,
    backgroundColor: '#ffffffcc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotNavLeft: { left: 8 },
  spotNavRight: { right: 8 },
  spotNavGlyph: { fontSize: 28, lineHeight: 30, fontWeight: Type.weight.heavy },
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
  // First-visit coach toast — sits at the top so it's not confused with
  // the section-marking banner (which sits at the bottom). Slightly
  // smaller and lighter so it reads as informational, not blocking.
  coachToast: {
    position: 'absolute',
    top: Spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  coachToastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.lg,
    backgroundColor: '#000d',
    maxWidth: '92%',
  },
  coachToastText: {
    color: '#fff',
    fontWeight: Type.weight.semibold,
    fontSize: Type.size.sm,
  },
  coachToastDismiss: {
    color: '#ffffffaa',
    fontSize: 14,
    fontWeight: Type.weight.bold,
  },
});
