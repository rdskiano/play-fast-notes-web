import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { ActionSheet, type ActionSheetItem } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import type { Grouping } from '@/lib/strategies/rhythmPatterns';

import { PassageReminders } from '@/components/PassageReminders';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { SelfLedSheet } from '@/components/SelfLedSheet';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { ZoomableImage } from '@/components/ZoomableImage';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { getOrCreateExercise } from '@/lib/db/repos/exercises';
import { countPracticeLogEntries } from '@/lib/db/repos/practiceLog';
import {
  getPassage,
  listPassagesInDocument,
  parseRegions,
  type Passage,
} from '@/lib/db/repos/passages';
import { getTempoLadder, type TempoLadderProgress } from '@/lib/db/repos/tempoLadder';
import { rememberPassageInDoc } from '@/lib/sessions/lastPassageInDoc';

type StrategyKey = 'tempo_ladder' | 'click_up' | 'rhythmic';

type StrategyDef = {
  key: StrategyKey;
  label: string;
  enabled: boolean;
};

const STRATEGIES: StrategyDef[] = [
  { key: 'tempo_ladder', label: 'Tempo Ladder', enabled: true },
  { key: 'click_up', label: 'Interleaved Click-Up', enabled: true },
  { key: 'rhythmic', label: 'Rhythmic Variation', enabled: true },
];

// Reading order across a document: page first, then top-to-bottom, then
// left-to-right. The 30px y-tolerance treats two boxes on the same staff line
// as horizontally ordered rather than top/bottom.
function sortByReadingOrder(passages: Passage[]): Passage[] {
  return [...passages].sort((a, b) => {
    const ra = parseRegions(a.regions_json)[0];
    const rb = parseRegions(b.regions_json)[0];
    if (!ra && !rb) return a.title.localeCompare(b.title);
    if (!ra) return 1;
    if (!rb) return -1;
    if (ra.page !== rb.page) return ra.page - rb.page;
    if (Math.abs(ra.y - rb.y) > 30) return ra.y - rb.y;
    return ra.x - rb.x;
  });
}

const GROUPING_CHOICES: { n: Grouping; abc: string; w: number }[] = [
  { n: 3, abc: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB', w: 70 },
  { n: 4, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBB', w: 90 },
  { n: 5, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBB', w: 100 },
  { n: 6, abc: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB BBB', w: 120 },
  { n: 7, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBBBB', w: 130 },
  { n: 8, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBBBBB', w: 140 },
];

export default function PassageDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors: strategyColors } = useStrategyColors();
  // Safe-area top inset feeds the hand-rolled top bar below — this
  // screen doesn't use SessionTopBar so it has to pad manually, else
  // the back button + ⋯ on iPhone sit under the status bar.
  const insets = useSafeAreaInsets();

  const [passage, setPassage] = useState<Passage | null>(null);
  const [tempoLadder, setTempoLadder] = useState<TempoLadderProgress | null>(null);
  const [loading, setLoading] = useState(true);
  // null = still loading; 0 means the user has added pieces but never
  // practiced, which is the trigger for the "pick a strategy" tutorial.
  const [practiceLogCount, setPracticeLogCount] = useState<number | null>(null);
  const [rhythmicSheetOpen, setRhythmicSheetOpen] = useState(false);
  const [rhythmicStep, setRhythmicStep] = useState<'mode' | 'grouping'>('mode');
  const [selfLedOpen, setSelfLedOpen] = useState(false);
  const [siblings, setSiblings] = useState<Passage[]>([]);
  // Phone "more actions" menu — collapses the strategy + history + crop
  // pill row, which doesn't fit alongside the title on a phone, into a
  // single ⋯ button that opens a labeled ActionSheet.
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  const ann = useScoreAnnotation(passage);
  const annotating = ann.pencil.active;

  // Forward navigation (a push) doesn't fire 'beforeRemove', so an unsaved
  // pencil mark must be flushed here before leaving — otherwise the next
  // screen loads stale annotation data.
  const guardedNav = useCallback(
    async (navigate: () => void) => {
      await ann.flush();
      navigate();
    },
    [ann],
  );

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      (async () => {
        try {
          const p = await getPassage(id);
          if (cancelled) return;
          setPassage(p);
          if (p?.document_id) {
            rememberPassageInDoc(p.document_id, p.id);
            try {
              const sibs = await listPassagesInDocument(p.document_id);
              if (!cancelled) setSiblings(sortByReadingOrder(sibs));
            } catch {
              // ignore — siblings are an enhancement, not required
            }
          } else {
            setSiblings([]);
          }
          try {
            const ex = await getOrCreateExercise(id, 'tempo_ladder');
            const tl = await getTempoLadder(ex.id);
            if (!cancelled) setTempoLadder(tl);
          } catch {
            // exercise may not exist yet — that's fine
          }
          try {
            const n = await countPracticeLogEntries();
            if (!cancelled) setPracticeLogCount(n);
          } catch {
            // count failing just suppresses the tutorial — not fatal
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  const { prev, next } = useMemo(() => {
    if (!passage || siblings.length === 0) return { prev: null, next: null };
    const idx = siblings.findIndex((s) => s.id === passage.id);
    if (idx < 0) return { prev: null, next: null };
    return {
      prev: idx > 0 ? siblings[idx - 1] : null,
      next: idx < siblings.length - 1 ? siblings[idx + 1] : null,
    };
  }, [siblings, passage]);

  const goPrev = useCallback(() => {
    if (prev) router.replace(`/passage/${prev.id}`);
  }, [prev, router]);
  const goNext = useCallback(() => {
    if (next) router.replace(`/passage/${next.id}`);
  }, [next, router]);

  // Keyboard arrows on desktop. Skip while a sheet is open or focus is in
  // an input — otherwise we steal text-cursor movement.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (rhythmicSheetOpen || selfLedOpen) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, rhythmicSheetOpen, selfLedOpen]);

  // Horizontal swipe over the score area. Threshold 60px, horizontal-dominant,
  // and time-bounded so a slow drag does not count.
  const swipeStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onSwipeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    swipeStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, []);
  const onSwipeEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = Date.now() - start.t;
      if (dt > 600) return;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx < 0) goNext();
      else goPrev();
    },
    [goPrev, goNext],
  );

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={{ opacity: Opacity.muted }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (!passage) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Passage not found.</ThemedText>
        <Pressable onPress={() => router.replace('/library')} hitSlop={10}>
          <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
            ‹ Back to Library
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const tempoLadderProgress =
    tempoLadder && tempoLadder.goal_tempo > 0
      ? Math.max(0, Math.min(1, tempoLadder.current_tempo / tempoLadder.goal_tempo))
      : null;

  function openStrategy(key: StrategyKey) {
    if (!passage) return;
    if (key === 'tempo_ladder') {
      guardedNav(() => router.push(`/passage/${passage.id}/tempo-ladder`));
    } else if (key === 'click_up') {
      guardedNav(() => router.push(`/passage/${passage.id}/click-up`));
    } else if (key === 'rhythmic') {
      setRhythmicStep('mode');
      setRhythmicSheetOpen(true);
    }
  }

  function renderPill(s: StrategyDef) {
    const isTempoLadder = s.key === 'tempo_ladder';
    const pct =
      isTempoLadder && tempoLadderProgress !== null
        ? Math.round(tempoLadderProgress * 100)
        : null;
    const label = pct !== null ? `${s.label} ${pct}%` : s.label;
    const color = strategyColors[s.key] ?? C.icon;
    return (
      <Pressable
        key={s.key}
        disabled={!s.enabled}
        hitSlop={4}
        onPress={() => openStrategy(s.key)}
        style={[
          styles.stratPill,
          { backgroundColor: color, opacity: s.enabled ? 1 : 0.35 },
        ]}>
        <ThemedText style={styles.stratLabel}>{label}</ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={[
          styles.topBar,
          {
            borderBottomColor: C.icon + '44',
            paddingTop: insets.top + 14,
          },
        ]}>
        <View style={styles.titleRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={styles.backBtn}>
            <ThemedText style={[styles.backArrow, { color: C.tint }]}>‹</ThemedText>
          </Pressable>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {passage.title}
          </ThemedText>
          {/* Phone: the whole pillRow becomes a single ⋯ menu so the
              title isn't squeezed into the corner. Tablet / desktop still
              see the full pill row below. The "strategies →" hint pairs
              with the ⋯ button so first-time users know that's where
              Tempo Ladder / Click-Up / Rhythmic / Self-Led / History /
              Crop live now — without it the ⋯ alone is unguessable. */}
          {isPhone && (
            <Pressable
              onPress={() => setPhoneMenuOpen(true)}
              hitSlop={6}
              accessibilityLabel="Practice strategies and more"
              style={styles.phoneMenuRow}>
              <ThemedText style={[styles.phoneMenuHint, { color: C.tint }]}>
                strategies →
              </ThemedText>
              <View style={[styles.phoneMenuBtn, { borderColor: C.icon }]}>
                <ThemedText style={[styles.phoneMenuGlyph, { color: C.text }]}>
                  ⋯
                </ThemedText>
              </View>
            </Pressable>
          )}
        </View>
        {!isPhone && (
          <View style={styles.pillRow}>
            {STRATEGIES.map(renderPill)}
            <Pressable
              onPress={() => setSelfLedOpen(true)}
              style={[styles.outlinePill, { borderColor: C.tint }]}>
              <ThemedText style={[styles.outlinePillText, { color: C.tint }]}>
                Self-Led ▾
              </ThemedText>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() =>
                guardedNav(() => router.push(`/passage/${passage.id}/history`))
              }
              style={[styles.outlinePill, { borderColor: C.icon }]}>
              <ThemedText style={[styles.outlinePillText, { color: C.tint }]}>
                Practice History
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() =>
                guardedNav(() =>
                  passage.document_id
                    ? router.push(
                        `/document/${passage.document_id}?resize=${passage.id}`,
                      )
                    : router.push(`/passage/${passage.id}/crop`),
                )
              }
              style={[styles.outlinePill, { borderColor: C.icon }]}>
              <ThemedText style={[styles.outlinePillText, { color: C.tint }]}>
                Crop
              </ThemedText>
            </Pressable>
          </View>
        )}
        <PassageReminders passageId={passage.id} />
      </View>

      <View
        // Swipe handlers are web-only — onPointerDown/Up/Cancel are HTMLElement
        // events. RN-Web forwards them through View. On native, this is a
        // plain flex wrapper with no swipe support (the prev/next buttons
        // still navigate).
        {...(Platform.OS === 'web'
          ? ({
              onPointerDown: onSwipeStart,
              onPointerUp: onSwipeEnd,
              onPointerCancel: () => {
                swipeStartRef.current = null;
              },
            } as object)
          : {})}
        style={{
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          position: 'relative',
        }}>
        <View style={styles.body}>
          {passage.source_uri ? (
            <View style={styles.scoreFill}>
              {isPhone ? (
                <ZoomableImage
                  uri={passage.source_uri}
                  style={StyleSheet.absoluteFill}
                  persistKey={passage.id}
                />
              ) : (
                <Image
                  source={{ uri: passage.source_uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                />
              )}
              {ann.canvas}
            </View>
          ) : (
            <View style={styles.noScore}>
              <ThemedText style={{ color: C.icon, textAlign: 'center' }}>
                No sheet music image yet.
              </ThemedText>
            </View>
          )}
        </View>
        {!annotating && prev && (
          <Pressable
            onPress={goPrev}
            hitSlop={10}
            style={[styles.spotNavBtn, styles.spotNavLeft, { borderColor: C.icon }]}>
            <ThemedText style={[styles.spotNavGlyph, { color: C.tint }]}>‹</ThemedText>
          </Pressable>
        )}
        {!annotating && next && (
          <Pressable
            onPress={goNext}
            hitSlop={10}
            style={[styles.spotNavBtn, styles.spotNavRight, { borderColor: C.icon }]}>
            <ThemedText style={[styles.spotNavGlyph, { color: C.tint }]}>›</ThemedText>
          </Pressable>
        )}
        {!annotating && siblings.length > 1 && (
          <View style={styles.spotCounter} pointerEvents="none">
            <ThemedText style={[styles.spotCounterText, { color: C.icon }]}>
              {siblings.findIndex((s) => s.id === passage.id) + 1} / {siblings.length}
            </ThemedText>
          </View>
        )}

        <PracticeToolsLayer pencil={ann.pencil} recorderPassageId={passage?.id} />
      </View>

      <Modal
        visible={rhythmicSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRhythmicSheetOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetCard, { backgroundColor: C.background, borderColor: C.icon }]}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => setRhythmicSheetOpen(false)}
                hitSlop={10}
                style={[styles.sheetCloseBtn, { borderColor: C.icon }]}>
                <ThemedText style={{ color: C.text, fontWeight: Type.weight.heavy }}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {rhythmicStep === 'mode' ? (
                <>
                  <ThemedText type="subtitle" style={styles.sheetTitle}>
                    Rhythmic Variation
                  </ThemedText>
                  <ThemedText style={styles.sheetDesc}>
                    Practicing a passage with different rhythmic patterns strengthens
                    your internal pulse, improves evenness, and exposes weak spots
                    that playing as written can hide.
                  </ThemedText>
                  <Button
                    label="Rhythm patterns only"
                    onPress={() => setRhythmicStep('grouping')}
                    style={{ backgroundColor: '#4a235a' }}
                    fullWidth
                  />
                  <ThemedText style={styles.sheetHint}>
                    Browse rhythm patterns with a metronome while you read from your
                    own score. Best when you already know the notes and just want to
                    drill the rhythm.
                  </ThemedText>
                  <Button
                    label="Exercise Builder"
                    onPress={() => {
                      setRhythmicSheetOpen(false);
                      guardedNav(() =>
                        router.push({
                          pathname: '/passage/[id]/rhythm-list',
                          params: { id: passage.id },
                        }),
                      );
                    }}
                    style={{ backgroundColor: '#9b59b6' }}
                    fullWidth
                  />
                  <ThemedText style={styles.sheetHint}>
                    Enter the pitches of your passage using the piano keyboard, and the
                    app generates fully notated exercises for every rhythm pattern. Save
                    as many exercises per passage as you like.
                  </ThemedText>
                </>
              ) : (
                <>
                  <ThemedText type="subtitle" style={styles.sheetTitle}>
                    Note grouping of passage
                  </ThemedText>
                  <ThemedText style={styles.sheetDesc}>
                    How many notes are in each rhythmic unit of the passage you want
                    to practice? Count the notes in one beat or one measure —
                    whichever feels like a natural repeating chunk.
                  </ThemedText>
                  <View style={styles.groupingGrid}>
                    {GROUPING_CHOICES.map(({ n, abc, w }) => (
                      <Pressable
                        key={n}
                        onPress={() => {
                          setRhythmicSheetOpen(false);
                          guardedNav(() =>
                            router.push({
                              pathname: '/passage/[id]/rhythmic',
                              params: { id: passage.id, grouping: String(n) },
                            }),
                          );
                        }}
                        style={[styles.groupingChip, { borderColor: C.icon }]}>
                        <AbcStaffView abc={abc} width={w} height={60} hideStaffLines centered />
                        <ThemedText style={styles.groupingNum}>{n}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                  <Button
                    label="← Back"
                    variant="ghost"
                    onPress={() => setRhythmicStep('mode')}
                    fullWidth
                  />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <SelfLedSheet
        visible={selfLedOpen}
        onCancel={() => setSelfLedOpen(false)}
        onPick={(key) => {
          setSelfLedOpen(false);
          if (!passage) return;
          // Recording is no longer a self-led strategy — the Recorder
          // is its own practice tool, available on every screen — so
          // every key here routes to the generic /self-led/[key] page.
          guardedNav(() => {
            router.push(`/passage/${passage.id}/self-led/${key}` as never);
          });
        }}
      />

      {/* Phone ⋯ menu — every strategy and side-action that was in the
          pillRow lives here as a labeled row. Self-Led opens its existing
          sub-sheet rather than flattening because it has its own
          sub-options. */}
      <ActionSheet
        visible={phoneMenuOpen}
        title={passage.title}
        items={[
          ...(STRATEGIES.filter((s) => s.enabled).map((s) => {
            const isTempoLadder = s.key === 'tempo_ladder';
            const pct =
              isTempoLadder && tempoLadderProgress !== null
                ? Math.round(tempoLadderProgress * 100)
                : null;
            return {
              label: pct !== null ? `${s.label} — ${pct}%` : s.label,
              onPress: () => {
                setPhoneMenuOpen(false);
                openStrategy(s.key);
              },
            } satisfies ActionSheetItem;
          })),
          {
            label: 'Self-Led…',
            onPress: () => {
              setPhoneMenuOpen(false);
              setSelfLedOpen(true);
            },
          },
          {
            label: 'Practice History',
            onPress: () => {
              setPhoneMenuOpen(false);
              guardedNav(() => router.push(`/passage/${passage.id}/history`));
            },
          },
          {
            label: 'Crop',
            onPress: () => {
              setPhoneMenuOpen(false);
              guardedNav(() =>
                passage.document_id
                  ? router.push(
                      `/document/${passage.document_id}?resize=${passage.id}`,
                    )
                  : router.push(`/passage/${passage.id}/crop`),
              );
            },
          },
        ]}
        onCancel={() => setPhoneMenuOpen(false)}
      />

      {/* Step 2 of the guided first-session flow. Fires on any passage
          detail visit while the global practice log is empty — auto-
          resolves the first time the user finishes a practice session.
          Body adapts to phone (pills collapsed into "strategies →"
          menu) vs tablet/desktop (pills inline below the title). */}
      <TutorialStep
        id="first-strategy"
        visible={practiceLogCount === 0}
        title="Now pick a practice strategy"
        body={
          (isPhone
            ? 'Tap "strategies →" in the top right to open the strategy menu. Three are built in:\n\n'
            : 'Each strategy above is a different way to drill this passage:\n\n') +
          "Tempo Ladder — clicking up the metronome slowly over time.\n\n" +
          "Interleaved Click-Up — practice each measure or beat in isolation and in ever-changing contexts and tempos. A favorite!\n\n" +
          "Rhythmic Variation — play the passage with different rhythm patterns to expose weak spots and even out your technique."
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  sheetCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: Radii['2xl'],
    borderWidth: Borders.thin,
    padding: 18,
    gap: Spacing.sm,
    maxHeight: '90%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center' },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { textAlign: 'center', marginTop: 4 },
  sheetDesc: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    opacity: Opacity.muted,
    marginBottom: Spacing.sm,
  },
  sheetHint: {
    fontSize: 12,
    opacity: 0.55,
    textAlign: 'center',
    paddingHorizontal: Spacing.sm,
    marginTop: -4,
  },
  groupingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginVertical: Spacing.md,
  },
  groupingChip: {
    width: '47%',
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    paddingVertical: 8,
    alignItems: 'center',
  },
  groupingNum: { fontSize: Type.size.xl, fontWeight: Type.weight.heavy, marginTop: -2 },
  topBar: {
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  backArrow: { fontSize: 30, fontWeight: '400', lineHeight: 32 },
  topTitle: { fontSize: 15, fontWeight: Type.weight.bold, flex: 1 },
  phoneMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phoneMenuHint: {
    fontSize: 12,
    fontWeight: Type.weight.semibold,
  },
  phoneMenuBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneMenuGlyph: { fontSize: 20, lineHeight: 22, fontWeight: '700' },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  stratPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radii.xl },
  stratLabel: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  outlinePill: {
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  outlinePillText: { fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  body: { flex: 1, padding: Spacing.md },
  scoreFill: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0001',
    borderRadius: Radii.sm,
  },
  noScore: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Borders.thin,
    borderColor: '#0002',
    borderRadius: Radii.sm,
    borderStyle: 'dashed',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
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
  spotCounter: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  spotCounterText: { fontSize: 11, fontWeight: Type.weight.semibold },
});
