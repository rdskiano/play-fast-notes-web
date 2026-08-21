// A momentary "look at the music" overlay for strategy setup screens.
//
// While setting tempos in a setup/config phase the user sees at most the
// cropped excerpt, so they can't read the printed tempo marking or confirm
// they're thinking of the right spot in the part. This full-screen modal
// shows the passage's source page with the passage's box outlined, lets the
// user swipe / chevron / arrow-key between the document's pages (e.g. to find
// the tempo marking at the top of the movement), and pinch-zoom to read fine
// print. Closing it returns to the setup screen with nothing changed.
//
// Passage shapes handled:
//  - document passages (PDF or photo-document): pager over every page, this
//    passage's regions outlined on their pages.
//  - legacy photo passages with a preserved original: the full photo. No box —
//    legacy crops never stored source-page geometry.
//  - legacy crops without an original: the crop itself, with a note.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DocumentPageImage } from '@/components/DocumentPageImage';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ZoomableImage } from '@/components/ZoomableImage';
import { Colors } from '@/constants/theme';
import { Radii, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getDocument,
  parsePages,
  type DocumentPage,
  type DocumentRow,
} from '@/lib/db/repos/documents';
import { parseRegions, type Passage, type PassageRegion } from '@/lib/db/repos/passages';
import { computeDrawnRect } from '@/lib/layout/containFit';

type Props = {
  visible: boolean;
  passage: Passage | null;
  onClose: () => void;
};

export function ScorePeekModal({ visible, passage, onClose }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [pagerH, setPagerH] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [zoomResetSignal, setZoomResetSignal] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  // One-shot flag so the initial jump-to-the-passage's-page only happens on
  // the first content layout after each open, not on every re-layout.
  const didInitialScrollRef = useRef(false);

  const regions = useMemo<PassageRegion[]>(
    () => (passage ? parseRegions(passage.regions_json) : []),
    [passage],
  );
  const documentId = passage?.document_id ?? null;

  // Load the document + pages each time the modal opens on a doc-backed
  // passage. Strategy screens only hold the Passage; the page images and
  // dimensions live on the document row.
  useEffect(() => {
    if (!visible || !documentId) {
      setDoc(null);
      setPages([]);
      setLoading(false);
      didInitialScrollRef.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    didInitialScrollRef.current = false;
    getDocument(documentId)
      .then((row) => {
        if (cancelled) return;
        setLoading(false);
        if (!row) return;
        const pgs = parsePages(row.pages_json);
        setDoc(row);
        setPages(pgs);
        // Open on the passage's own page (regions are 1-indexed pages).
        const hits = parseRegions(passage?.regions_json ?? null);
        const target = hits.length ? Math.min(...hits.map((r) => r.page)) - 1 : 0;
        const idx = Math.max(0, Math.min(pgs.length - 1, target));
        setIndex(idx);
        indexRef.current = idx;
        setZoomed(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // passage identity is covered by documentId for our purposes: the modal is
    // always opened fresh per passage from a setup screen.
  }, [visible, documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, i));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    if (clamped !== indexRef.current) {
      indexRef.current = clamped;
      setIndex(clamped);
      // Snap any pinch-zoom back so the next page arrives at full size and
      // the pager unlocks.
      setZoomResetSignal((n) => n + 1);
      setZoomed(false);
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== indexRef.current && i >= 0 && i < pages.length) {
      indexRef.current = i;
      setIndex(i);
      setZoomResetSignal((n) => n + 1);
      setZoomed(false);
    }
  };

  // Keep the pager parked on the current page across orientation / window
  // resizes (offsets are width-multiples, so a width change strands the
  // scroll position mid-page).
  useEffect(() => {
    if (!visible || pages.length === 0) return;
    scrollRef.current?.scrollTo({ x: indexRef.current * width, animated: false });
  }, [visible, width, pages.length]);

  // Web: arrow keys turn pages, Escape closes. The setup screens have no
  // keyboard catcher running during config, so this can't collide.
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(indexRef.current - 1);
      else if (e.key === 'ArrowRight') goTo(indexRef.current + 1);
      else if (e.key === 'Escape') onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // goTo/onClose are stable enough for a modal-lifetime listener.
  }, [visible, pages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!passage) return null;

  const hasDoc = !!documentId;
  const legacyUri = passage.original_uri ?? passage.source_uri;
  const legacyIsCropOnly = !hasDoc && !passage.original_uri;

  return (
    <Modal
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}>
      <ThemedView style={{ flex: 1 }}>
        <View
          style={[
            styles.topBar,
            // Full-screen Modal: push the bar below the status bar / notch or
            // the back button lands under the clock and can't be tapped.
            { paddingTop: insets.top + 10, borderBottomColor: C.icon + '44' },
          ]}>
          <Button label="‹ Back to setup" variant="ghost" size="sm" onPress={onClose} />
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            {passage.title}
          </ThemedText>
          <ThemedText style={[styles.pageIndicator, { color: C.icon }]}>
            {hasDoc && pages.length > 0 ? `p. ${index + 1} / ${pages.length}` : ''}
          </ThemedText>
        </View>

        <View
          style={styles.pagerWrap}
          onLayout={(e) => setPagerH(e.nativeEvent.layout.height)}>
          {hasDoc ? (
            loading ? (
              <View style={styles.centerFill}>
                <ActivityIndicator />
              </View>
            ) : pages.length === 0 ? (
              <View style={styles.centerFill}>
                <ThemedText style={{ opacity: 0.6 }}>No pages to show.</ThemedText>
              </View>
            ) : (
              <>
                <ScrollView
                  ref={scrollRef}
                  horizontal
                  pagingEnabled
                  // Locked while pinch-zoomed so a one-finger pan moves the
                  // page instead of flipping to the next; the chevrons stay
                  // live (goTo snaps zoom back as it turns).
                  scrollEnabled={!zoomed}
                  showsHorizontalScrollIndicator={false}
                  onScroll={onScroll}
                  scrollEventThrottle={32}
                  onContentSizeChange={() => {
                    if (didInitialScrollRef.current) return;
                    didInitialScrollRef.current = true;
                    scrollRef.current?.scrollTo({
                      x: indexRef.current * width,
                      animated: false,
                    });
                  }}>
                  {pages.map((p) => (
                    <View key={p.index} style={{ width, height: pagerH }}>
                      <ZoomableImage
                        style={StyleSheet.absoluteFill}
                        resetSignal={zoomResetSignal}
                        onZoomedChange={setZoomed}>
                        <DocumentPageImage
                          doc={doc!}
                          page={p}
                          style={StyleSheet.absoluteFill}
                          contentFit="contain"
                          // Every page mounts in this ScrollView at once; only
                          // the visible page + neighbors render on demand.
                          active={Math.abs(p.index - 1 - index) <= 1}
                        />
                        <RegionOutlines
                          page={p}
                          regions={regions}
                          slotW={width}
                          slotH={pagerH}
                          color={C.tint}
                        />
                      </ZoomableImage>
                    </View>
                  ))}
                </ScrollView>
                {index > 0 && (
                  <Pressable
                    onPress={() => goTo(index - 1)}
                    hitSlop={10}
                    style={[styles.navBtn, styles.navLeft, { borderColor: C.icon, backgroundColor: C.background + 'E6' }]}
                    accessibilityLabel="Previous page">
                    <ThemedText style={[styles.navGlyph, { color: C.tint }]}>‹</ThemedText>
                  </Pressable>
                )}
                {index < pages.length - 1 && (
                  <Pressable
                    onPress={() => goTo(index + 1)}
                    hitSlop={10}
                    style={[styles.navBtn, styles.navRight, { borderColor: C.icon, backgroundColor: C.background + 'E6' }]}
                    accessibilityLabel="Next page">
                    <ThemedText style={[styles.navGlyph, { color: C.tint }]}>›</ThemedText>
                  </Pressable>
                )}
              </>
            )
          ) : (
            // Legacy photo passage — no document, no page geometry. Show the
            // fullest image we have.
            <ZoomableImage uri={legacyUri} style={StyleSheet.absoluteFill} />
          )}
        </View>

        {legacyIsCropOnly && (
          <ThemedText
            style={[styles.footNote, { color: C.icon, paddingBottom: insets.bottom + 10 }]}>
            Only the cropped excerpt was saved for this passage, so there is no
            full page to show.
          </ThemedText>
        )}
      </ThemedView>
    </Modal>
  );
}

// This passage's box(es) on one page, drawn over the contain-fit page image.
// Regions are stored in source-page pixels (1-indexed pages); the same
// letterbox math as PageBoxOverlay maps them into the rendered slot. The
// outlines live INSIDE the ZoomableImage transform so they track pinch-zoom.
function RegionOutlines({
  page,
  regions,
  slotW,
  slotH,
  color,
}: {
  page: DocumentPage;
  regions: PassageRegion[];
  slotW: number;
  slotH: number;
  color: string;
}) {
  const hits = regions.filter((r) => r.page === page.index);
  if (hits.length === 0 || slotW <= 0 || slotH <= 0 || page.w <= 0 || page.h <= 0) {
    return null;
  }
  const rect = computeDrawnRect(slotW, slotH, page.w / page.h);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: rect.ox,
        top: rect.oy,
        width: rect.w,
        height: rect.h,
      }}>
      {hits.map((r, i) => (
        <View
          key={i}
          style={[
            styles.box,
            {
              left: (r.x / page.w) * rect.w,
              top: (r.y / page.h) * rect.h,
              width: (r.w / page.w) * rect.w,
              height: (r.h / page.h) * rect.h,
              borderColor: color,
              backgroundColor: color + '14',
              shadowColor: color,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topCenter: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
  },
  pageIndicator: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    minWidth: 70,
    textAlign: 'right',
  },
  pagerWrap: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLeft: { left: 8 },
  navRight: { right: 8 },
  navGlyph: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: Type.weight.bold,
  },
  box: {
    position: 'absolute',
    borderRadius: Radii.sm,
    borderWidth: 2,
    // Same soft glow as the document viewer's lit box.
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  footNote: {
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    fontSize: Type.size.sm,
  },
});
