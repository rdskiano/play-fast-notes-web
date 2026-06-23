import Feather from '@expo/vector-icons/Feather';
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
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { AbcStaffView } from '@/components/AbcStaffView';
import { ActionSheet, type ActionSheetItem } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import type { Grouping } from '@/lib/strategies/rhythmPatterns';

import { PassageReminders } from '@/components/PassageReminders';
import { PaywallModal } from '@/components/PaywallModal';
import { PracticeToolsBar } from '@/components/PracticeToolsBar';
import { useEntitlement } from '@/lib/billing/entitlements';
import { SelfLedSheet } from '@/components/SelfLedSheet';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { ZoomableImage } from '@/components/ZoomableImage';
import { Lift, Palette } from '@/constants/palette';
import { Colors, Fonts } from '@/constants/theme';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
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
import {
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';

type StrategyKey =
  | 'tempo_ladder'
  | 'click_up'
  | 'rhythmic'
  | 'micro_chaining'
  | 'macro_chaining'
  | 'rep_rotator';

type StrategyDef = {
  key: StrategyKey;
  label: string;
  enabled: boolean;
  // Two-letter monogram + one-line "what it does", shown on the phone
  // strategy cards (hero layout).
  mono: string;
  blurb: string;
};

const STRATEGIES: StrategyDef[] = [
  { key: 'tempo_ladder', label: 'Tempo Ladder', enabled: true, mono: 'TL', blurb: 'Climb to performance tempo one rung at a time.' },
  { key: 'click_up', label: 'Interleaved Click-Up', enabled: true, mono: 'IC', blurb: 'Interleave units as the tempo climbs.' },
  { key: 'rhythmic', label: 'Rhythmic Variation', enabled: true, mono: 'RV', blurb: 'Shift rhythms to expose weak spots.' },
  { key: 'micro_chaining', label: 'Micro-Chaining', enabled: true, mono: 'Mi', blurb: 'Add one note at a time to tiny cells.' },
  { key: 'macro_chaining', label: 'Macro-Chaining', enabled: true, mono: 'Ma', blurb: 'Link mastered chunks into longer spans.' },
  { key: 'rep_rotator', label: 'Rep Rotator', enabled: true, mono: 'RR', blurb: 'Rotate passages in spaced sets.' },
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

// Deeper shade of a hex color (each RGB channel × factor). Lets the Exercise
// Builder button be a darker shade of the SAME rhythmic violet as its sibling
// "Rhythm patterns only" — stays coupled even if the strategy color is
// overridden — instead of an unrelated brown.
function darken(hex: string, factor = 0.72): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
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
  const entitlement = useEntitlement();
  // Exercise Builder is Pro (the paid creation hook); "Rhythm patterns only"
  // stays free. Non-null = the builder paywall is showing.
  const [builderPaywall, setBuilderPaywall] = useState(false);
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
  // Photo passages only: flip between the cropped excerpt and the full,
  // uncropped photo (the equivalent of a PDF's "hide boxes"). Lets the user
  // practice a wider section without re-cropping. Resets when the passage
  // changes; no DB write — purely which image we display here.
  const [viewFull, setViewFull] = useState(false);
  // Separate "more actions" (☰) menu — History / Crop — split off from the
  // Strategies menu so each button does one obvious thing.
  const [phoneMoreOpen, setPhoneMoreOpen] = useState(false);
  // Landscape phone (the reading/practice orientation): the six strategies
  // live behind a floating "Practice" launcher that slides in this panel,
  // keeping the default state pure full-bleed score.
  const [practiceOpen, setPracticeOpen] = useState(false);
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  // Landscape phone: the Rhythmic Variation chooser lays its two options
  // side-by-side instead of stacked, so the short viewport doesn't hide the
  // second one below a scroll with no cue.
  const isLandscapePhone = isPhone && vpW > vpH;
  const isTouch = useIsTouchDevice();
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

  // Native swipe-to-navigate between sibling passages — parity with the web
  // pointer-swipe (which stays the path on web). Horizontal flings only; the
  // ‹ › buttons still work too. Disabled on web so it doesn't double up with
  // the pointer handlers below.
  const swipeNav = useMemo(
    () =>
      Gesture.Race(
        Gesture.Fling()
          .direction(Directions.LEFT)
          .enabled(Platform.OS !== 'web')
          .onStart(() => {
            'worklet';
            runOnJS(goNext)();
          }),
        Gesture.Fling()
          .direction(Directions.RIGHT)
          .enabled(Platform.OS !== 'web')
          .onStart(() => {
            'worklet';
            runOnJS(goPrev)();
          }),
      ),
    [goNext, goPrev],
  );

  // Keyboard arrows on desktop. Skip while a sheet is open or focus is in
  // an input — otherwise we steal text-cursor movement.
  // Reset the full-photo view when switching to a different passage.
  useEffect(() => {
    setViewFull(false);
  }, [id]);

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

  // Photo passages that have a preserved full original can flip between the
  // crop and the whole photo (see the header / ☰ "View full photo" control).
  const hasFull = !!passage.original_uri && passage.original_uri !== passage.source_uri;
  const displayUri = viewFull && hasFull ? passage.original_uri! : passage.source_uri;

  function openStrategy(key: StrategyKey) {
    if (!passage) return;
    if (key === 'tempo_ladder') {
      guardedNav(() => router.push(`/passage/${passage.id}/tempo-ladder`));
    } else if (key === 'click_up') {
      guardedNav(() => router.push(`/passage/${passage.id}/click-up`));
    } else if (key === 'micro_chaining') {
      guardedNav(() => router.push(`/passage/${passage.id}/micro-chaining`));
    } else if (key === 'macro_chaining') {
      guardedNav(() => router.push(`/passage/${passage.id}/macro-chaining`));
    } else if (key === 'rhythmic') {
      setRhythmicStep('mode');
      setRhythmicSheetOpen(true);
    } else if (key === 'rep_rotator') {
      guardedNav(() =>
        router.push({
          pathname: '/interleaved',
          params: { seedPassageId: passage.id },
        }),
      );
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

  // Capped score "hero" height for the phone layout. The score is reference;
  // the strategies below are the verbs — so cap the score so the suggestion
  // card and the first strategy row peek above the fold rather than living a
  // full scroll down. Landscape (the music-stand orientation) is short, so it
  // gets a tighter cap keyed off the available height.
  const heroH = isPhone
    ? Math.round(vpH * 0.32)
    : Math.min(620, Math.round(vpH * 0.52));

  function renderStratCard(s: StrategyDef) {
    const color = strategyColors[s.key] ?? Palette.accent;
    const pct =
      s.key === 'tempo_ladder' && tempoLadderProgress !== null
        ? Math.round(tempoLadderProgress * 100)
        : null;
    return (
      <Pressable
        key={s.key}
        disabled={!s.enabled}
        onPress={() => openStrategy(s.key)}
        style={[styles.stratCard, !s.enabled && { opacity: 0.4 }]}>
        <View style={styles.stratCardTop}>
          <View style={[styles.stratMono, { backgroundColor: color + '22' }]}>
            <ThemedText style={[styles.stratMonoText, { color }]}>{s.mono}</ThemedText>
          </View>
          {pct !== null && (
            <View style={[styles.stratPct, { backgroundColor: color + '22' }]}>
              <ThemedText style={[styles.stratPctText, { color }]}>{pct}%</ThemedText>
            </View>
          )}
        </View>
        <ThemedText style={styles.stratCardName} numberOfLines={1}>
          {s.label}
        </ThemedText>
        <ThemedText style={styles.stratCardBlurb} numberOfLines={2}>
          {s.blurb}
        </ThemedText>
      </Pressable>
    );
  }

  // Full-width strategy row for the landscape "Practice" side panel.
  function renderStratRow(s: StrategyDef) {
    const color = strategyColors[s.key] ?? Palette.accent;
    const pct =
      s.key === 'tempo_ladder' && tempoLadderProgress !== null
        ? Math.round(tempoLadderProgress * 100)
        : null;
    return (
      <Pressable
        key={s.key}
        disabled={!s.enabled}
        onPress={() => {
          setPracticeOpen(false);
          openStrategy(s.key);
        }}
        style={[styles.stratRow, !s.enabled && { opacity: 0.4 }]}>
        <View style={[styles.stratMono, { backgroundColor: color + '22' }]}>
          <ThemedText style={[styles.stratMonoText, { color }]}>{s.mono}</ThemedText>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText style={styles.stratRowName} numberOfLines={1}>
            {s.label}
          </ThemedText>
          <ThemedText style={styles.stratCardBlurb} numberOfLines={1}>
            {s.blurb}
          </ThemedText>
        </View>
        {pct !== null && (
          <View style={[styles.stratPct, { backgroundColor: color + '22' }]}>
            <ThemedText style={[styles.stratPctText, { color }]}>{pct}%</ThemedText>
          </View>
        )}
        <Feather name="chevron-right" size={18} color={Palette.textMuted} />
      </Pressable>
    );
  }

  // Shared modals/sheets — rendered by both the phone hero layout and the
  // tablet/desktop layout below.
  const overlays = (
    <>
      <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
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

            <ScrollView showsVerticalScrollIndicator>
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
                  <View
                    style={[styles.modeOptions, isLandscapePhone && styles.modeOptionsRow]}>
                    <View style={isLandscapePhone ? styles.modeOption : undefined}>
                      <Button
                        label="Rhythm patterns only"
                        onPress={() => setRhythmicStep('grouping')}
                        style={{ backgroundColor: strategyColors.rhythmic ?? Palette.rhythmic }}
                        fullWidth
                      />
                      <ThemedText style={styles.sheetHint}>
                        Browse rhythm patterns with a metronome while you read from your
                        own score. Best when you already know the notes and just want to
                        drill the rhythm.
                      </ThemedText>
                    </View>
                    <View style={isLandscapePhone ? styles.modeOption : undefined}>
                      <Button
                        label="Exercise Builder"
                        onPress={() => {
                          setRhythmicSheetOpen(false);
                          if (!entitlement.isPro) {
                            setBuilderPaywall(true);
                            return;
                          }
                          guardedNav(() =>
                            router.push({
                              pathname: '/passage/[id]/rhythm-list',
                              params: { id: passage.id },
                            }),
                          );
                        }}
                        style={{ backgroundColor: darken(strategyColors.rhythmic ?? Palette.rhythmic) }}
                        fullWidth
                      />
                      <ThemedText style={styles.sheetHint}>
                        Enter the pitches of your passage using the piano keyboard, and the
                        app generates fully notated exercises for every rhythm pattern. Save
                        as many exercises per passage as you like.
                      </ThemedText>
                    </View>
                  </View>
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
          guardedNav(() => {
            router.push(`/passage/${passage.id}/self-led/${key}` as never);
          });
        }}
      />

      <TutorialStep
        id="first-strategy"
        visible={practiceLogCount === 0}
        title="Now pick a practice strategy"
        body={
          'Each strategy card below is a different way to drill this passage:\n\n' +
          "Tempo Ladder — clicking up the metronome slowly over time.\n\n" +
          "Interleaved Click-Up — practice each measure or beat in isolation and in ever-changing contexts and tempos. A favorite!\n\n" +
          "Rhythmic Variation — play the passage with different rhythm patterns to expose weak spots and even out your technique.\n\n" +
          "Micro-Chaining — build a tricky spot back one note at a time (forward, backward, or out from the problem note).\n\n" +
          "Macro-Chaining — play it in chunks at goal tempo with beats of rest between, then remove the rests as it locks in.\n\n" +
          "Rep Rotator — 🔀 drill this passage shuffled together with its siblings.\n\n" +
          "Practice History — every session you've logged on this passage.\n\n" +
          "Crop — re-trim the boxed region of the score.\n\n" +
          "Move between passages with the ‹ › arrows, by swiping, or with the ← / → keys.\n\n" +
          "Notes for next time — a reminders banner near the top; tap to expand, or dismiss when done.\n\n" +
          PRACTICE_TOOLS_HELP
        }
      />

      <PaywallModal
        visible={builderPaywall}
        contextLine="The Exercise Builder is a Practice Pro feature — “Rhythm patterns only” stays free."
        onClose={() => setBuilderPaywall(false)}
      />
    </>
  );

  // ── Landscape phone: reading / practice mode ───────────────────────────
  // Full-bleed score; all controls float on top so the music owns the
  // screen. The six strategies live behind a "Practice" launcher that slides
  // in a side panel, then dismisses — so the default state is pure score.
  if (isLandscapePhone) {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <GestureDetector gesture={swipeNav}>
          <View
            {...(Platform.OS === 'web'
              ? ({
                  onPointerDown: onSwipeStart,
                  onPointerUp: onSwipeEnd,
                  onPointerCancel: () => {
                    swipeStartRef.current = null;
                  },
                } as object)
              : {})}
            style={{ flex: 1, position: 'relative' }}>
            {/* Full-bleed score */}
            <View style={StyleSheet.absoluteFill}>
              {passage.source_uri ? (
                isTouch ? (
                  <ZoomableImage
                    uri={displayUri}
                    style={StyleSheet.absoluteFill}
                    persistKey={`${passage.id}:${viewFull && hasFull ? 'full' : 'crop'}`}
                    overlay={ann.canvas}
                    drawMode={ann.pencil.active}
                  />
                ) : (
                  <>
                    <Image
                      source={{ uri: displayUri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="contain"
                    />
                    {ann.canvas}
                  </>
                )
              ) : (
                <View style={[styles.heroEmpty, { flex: 1 }]}>
                  <Feather name="image" size={30} color={Palette.textMuted} />
                  <ThemedText style={styles.heroEmptyText}>No score image yet</ThemedText>
                </View>
              )}
            </View>

            {/* Floating top-left: back + title */}
            {!annotating && (
              <View style={[styles.lsTopLeft, { top: insets.top + 8 }]} pointerEvents="box-none">
                {passage.document_id ? (
                  <Pressable
                    onPress={() =>
                      guardedNav(() =>
                        router.canGoBack()
                          ? router.back()
                          : router.navigate(`/document/${passage.document_id}`),
                      )
                    }
                    hitSlop={10}
                    style={styles.lsChip}>
                    <ThemedText style={styles.lsChipText} numberOfLines={1}>
                      ‹ Full Part
                    </ThemedText>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => router.back()} hitSlop={10} style={styles.lsChip}>
                    <ThemedText style={styles.lsChipText}>‹ Back</ThemedText>
                  </Pressable>
                )}
                <View style={styles.lsTitleWrap}>
                  <ThemedText style={styles.lsTitle} numberOfLines={1}>
                    {passage.title}
                  </ThemedText>
                  {!!passage.composer && (
                    <ThemedText style={styles.lsSub} numberOfLines={1}>
                      {passage.composer}
                    </ThemedText>
                  )}
                </View>
              </View>
            )}

            {/* Floating top-right: history + crop */}
            {!annotating && (
              <View style={[styles.lsTopRight, { top: insets.top + 8 }]}>
                <Pressable
                  onPress={() => guardedNav(() => router.push(`/passage/${passage.id}/history`))}
                  hitSlop={8}
                  accessibilityLabel="Practice history"
                  style={styles.lsIconBtn}>
                  <Feather name="clock" size={18} color={Palette.text} />
                </Pressable>
              </View>
            )}

            {/* Sibling counter, bottom-left */}
            {!annotating && siblings.length > 1 && (
              <View style={styles.lsCounter} pointerEvents="none">
                <ThemedText style={styles.heroCounterText}>
                  {siblings.findIndex((s) => s.id === passage.id) + 1} / {siblings.length}
                </ThemedText>
              </View>
            )}

            {/* Floating Practice launcher, bottom-right */}
            {!annotating && !practiceOpen && (
              <Pressable style={styles.lsPracticeBtn} onPress={() => setPracticeOpen(true)}>
                <Feather name="zap" size={16} color="#fff" />
                <ThemedText style={styles.lsPracticeText}>Practice</ThemedText>
              </Pressable>
            )}
          </View>
        </GestureDetector>

        {/* Practice side panel */}
        {practiceOpen && (
          <>
            <Pressable
              style={[StyleSheet.absoluteFill, styles.lsScrim]}
              onPress={() => setPracticeOpen(false)}
            />
            <View style={styles.lsPanel}>
              <View style={styles.lsPanelHeader}>
                <ThemedText style={styles.lsPanelTitle}>Practice strategies</ThemedText>
                <Pressable
                  onPress={() => setPracticeOpen(false)}
                  hitSlop={8}
                  style={styles.lsPanelClose}>
                  <Feather name="x" size={18} color={Palette.text} />
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.lg }}
                showsVerticalScrollIndicator={false}>
                <Pressable
                  onPress={() => {
                    setPracticeOpen(false);
                    guardedNav(() => router.push(`/passage/${passage.id}/coach`));
                  }}
                  style={styles.heroCoach}>
                  <View style={styles.heroCoachIcon}>
                    <Feather name="zap" size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText style={styles.heroCoachTitle}>What should I practice?</ThemedText>
                  </View>
                  <View style={styles.heroBeta}>
                    <ThemedText style={styles.heroBetaText}>BETA</ThemedText>
                  </View>
                </Pressable>
                {STRATEGIES.map(renderStratRow)}
              </ScrollView>
            </View>
          </>
        )}

        {/* Tools as a horizontal pill in line with the practice-log / crop
            icons (anchorRight clears that 2-icon cluster). */}
        <PracticeToolsBar
          pencil={{ ...ann.pencil, onUndo: ann.undo }}
          recorderPassageId={passage?.id}
          anchorTop={insets.top + 8}
          anchorRight={58}
        />
        {overlays}
      </ThemedView>
    );
  }

  // ── Default layout: the hub (portrait phone, tablet, laptop) ────────────
  // Passage as hero (capped score), the coach suggestion, then the strategy
  // menu as cards — all in one scroll. Content centers into a column on wide
  // screens (iPad / laptop) so it doesn't stretch edge-to-edge. Landscape
  // phone already returned above with the full-bleed reading mode.
  return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.heroTopBar, styles.heroColumnCap, { paddingTop: insets.top + 10 }]}>
          {passage.document_id ? (
            <Pressable
              onPress={() =>
                guardedNav(() =>
                  router.canGoBack()
                    ? router.back()
                    : router.navigate(`/document/${passage.document_id}`),
                )
              }
              hitSlop={12}
              style={styles.backBtn}>
              <ThemedText style={[styles.backLabel, { color: Palette.accent }]} numberOfLines={1}>
                ‹ Full Part
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <ThemedText style={[styles.backArrow, { color: Palette.accent }]}>‹</ThemedText>
            </Pressable>
          )}
          <View style={styles.heroTopActions}>
            <Pressable
              onPress={() => guardedNav(() => router.push(`/passage/${passage.id}/history`))}
              hitSlop={8}
              accessibilityLabel="Practice history"
              style={styles.heroIconBtn}>
              <Feather name="clock" size={18} color={Palette.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.heroScroll}
          showsVerticalScrollIndicator={false}>
          <View style={styles.heroColumn}>
          <ThemedText style={styles.heroTitle} numberOfLines={2}>
            {passage.title}
          </ThemedText>
          {!!passage.composer && (
            <ThemedText style={styles.heroSub} numberOfLines={1}>
              {passage.composer}
            </ThemedText>
          )}

          <View style={[styles.heroScore, { height: heroH }]}>
            {passage.source_uri ? (
              isTouch ? (
                <ZoomableImage
                  uri={displayUri}
                  style={StyleSheet.absoluteFill}
                  persistKey={`${passage.id}:${viewFull && hasFull ? 'full' : 'crop'}`}
                  overlay={ann.canvas}
                  drawMode={isPhone && ann.pencil.active}
                />
              ) : (
                <>
                  <Image
                    source={{ uri: displayUri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                  />
                  {ann.canvas}
                </>
              )
            ) : (
              <View style={styles.heroEmpty}>
                <Feather name="image" size={30} color={Palette.textMuted} />
                <ThemedText style={styles.heroEmptyText}>No score image yet</ThemedText>
              </View>
            )}
            {!annotating && prev && (
              <Pressable onPress={goPrev} hitSlop={8} style={[styles.heroNav, styles.heroNavLeft]}>
                <ThemedText style={styles.heroNavGlyph}>‹</ThemedText>
              </Pressable>
            )}
            {!annotating && next && (
              <Pressable onPress={goNext} hitSlop={8} style={[styles.heroNav, styles.heroNavRight]}>
                <ThemedText style={styles.heroNavGlyph}>›</ThemedText>
              </Pressable>
            )}
            {!annotating && siblings.length > 1 && (
              <View style={styles.heroCounter} pointerEvents="none">
                <ThemedText style={styles.heroCounterText}>
                  {siblings.findIndex((s) => s.id === passage.id) + 1} / {siblings.length}
                </ThemedText>
              </View>
            )}
          </View>


          <Pressable
            onPress={() => guardedNav(() => router.push(`/passage/${passage.id}/coach`))}
            style={styles.heroCoach}>
            <View style={styles.heroCoachIcon}>
              <Feather name="zap" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText style={styles.heroCoachTitle}>What should I practice?</ThemedText>
              <ThemedText style={styles.heroCoachSub} numberOfLines={1}>
                Get a strategy suggestion for this passage
              </ThemedText>
            </View>
            <View style={styles.heroBeta}>
              <ThemedText style={styles.heroBetaText}>BETA</ThemedText>
            </View>
          </Pressable>

          <ThemedText style={styles.heroSectionHeading}>Practice strategies</ThemedText>
          <View style={styles.stratGrid}>
            {STRATEGIES.map(renderStratCard)}
          </View>

          <PassageReminders passageId={passage.id} />
          </View>
        </ScrollView>

        {/* Tools as a horizontal pill in line with the practice-log / crop
            icons in the hero top bar (anchorRight clears that cluster). */}
        <PracticeToolsBar
          pencil={{ ...ann.pencil, onUndo: ann.undo }}
          recorderPassageId={passage?.id}
          anchorRight={58}
        />
        {overlays}
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
  // Rhythmic chooser options: stacked by default, side-by-side on landscape
  // phone (each column takes half the width) so both fit a short viewport.
  modeOptions: { gap: Spacing.sm },
  modeOptionsRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  modeOption: { flex: 1, gap: Spacing.sm },
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
  // Side cells are content-sized (back button / phone menu); the title takes
  // the middle and ellipsizes. minWidth:0 lets it shrink past its longest word
  // so a long title truncates instead of overlapping the Strategies button.
  titleSide: { flexDirection: 'row', alignItems: 'center' },
  titleSideRight: { justifyContent: 'flex-end' },
  // On tablet/desktop both side cells flex equally (1:1) so the flex:1 title
  // between them lands on the true page center, not just centered in the gap
  // left over after a narrow back button + wide History/Crop actions.
  titleSideFlex: { flex: 1 },
  // Tablet/desktop History + Crop buttons, kept on the title line.
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  backArrow: { fontSize: 30, fontWeight: '400', lineHeight: 32 },
  backLabel: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  topTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: Type.weight.bold,
    textAlign: 'center',
  },
  phoneMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phoneStrategiesBtn: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneStrategiesText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
    justifyContent: 'center',
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

  // ── Phone hero layout ──────────────────────────────────────────────────
  heroTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  heroTopActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  heroColumnCap: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  // Inner column for the scrollable hub body. The ScrollView's content
  // container centers it (alignItems:center); this caps its width on wide
  // screens without the width:'100%' + alignSelf trick that overflowed on
  // iPad. maxWidth never exceeds the viewport, so no horizontal bleed.
  heroColumn: { width: '100%', maxWidth: 1100, gap: Spacing.md },
  heroIconBtn: {
    width: 38,
    height: 38,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroScroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    alignItems: 'center',
  },
  heroTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size['3xl'],
    // Explicit line height so descenders (g, y, p) aren't clipped — Bricolage
    // is a tall display face and the default leading crops them at this size.
    lineHeight: 36,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: Type.size.md,
    color: Palette.textSecondary,
    marginTop: -Spacing.xs,
  },
  heroScore: {
    width: '100%',
    backgroundColor: Palette.inset,
    borderRadius: Radii.xl,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    overflow: 'hidden',
    position: 'relative',
  },
  heroEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  heroEmptyText: { fontSize: Type.size.sm, color: Palette.textMuted },
  heroNav: {
    position: 'absolute',
    bottom: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffffe6',
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroNavLeft: { left: 8 },
  heroNavRight: { right: 8 },
  heroNavGlyph: { fontSize: 26, lineHeight: 28, fontWeight: Type.weight.heavy, color: Palette.text },
  heroCounter: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  heroCounterText: {
    fontSize: 11,
    fontWeight: Type.weight.semibold,
    color: Palette.textSecondary,
    backgroundColor: '#ffffffcc',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  heroFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
    borderRadius: Radii.lg,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
  },
  heroFullBtnText: { fontSize: Type.size.md, fontWeight: Type.weight.heavy, color: Palette.text },
  heroCoach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radii.lg,
    backgroundColor: Palette.accentSoft,
  },
  heroCoachIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCoachTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: Palette.accentDeep,
  },
  heroCoachSub: { fontSize: Type.size.sm, color: Palette.textSecondary },
  heroBeta: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
  },
  heroBetaText: {
    fontSize: 10,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.5,
    color: Palette.accent,
  },
  heroSectionHeading: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    marginTop: Spacing.xs,
  },
  stratGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  stratCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 150,
    padding: Spacing.md,
    borderRadius: Radii.lg,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    gap: 6,
  },
  stratCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stratMono: {
    width: 38,
    height: 38,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stratMonoText: { fontSize: Type.size.md, fontWeight: Type.weight.heavy },
  stratPct: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  stratPctText: { fontSize: Type.size.xs, fontWeight: Type.weight.heavy },
  stratCardName: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
  },
  stratCardBlurb: { fontSize: Type.size.sm, color: Palette.textSecondary, lineHeight: 18 },

  // ── Landscape reading mode ─────────────────────────────────────────────
  lsTopLeft: {
    position: 'absolute',
    left: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    maxWidth: '60%',
  },
  lsChip: {
    backgroundColor: '#ffffffe6',
    borderRadius: Radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
  },
  lsChipText: { fontSize: Type.size.md, fontWeight: Type.weight.bold, color: Palette.accent },
  lsTitleWrap: {
    backgroundColor: '#ffffffd9',
    borderRadius: Radii.lg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 0,
    flexShrink: 1,
  },
  lsTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.3,
  },
  lsSub: { fontSize: Type.size.xs, color: Palette.textSecondary },
  lsTopRight: {
    position: 'absolute',
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lsIconBtn: {
    width: 38,
    height: 38,
    borderRadius: Radii.md,
    backgroundColor: '#ffffffe6',
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lsCounter: { position: 'absolute', left: Spacing.md, bottom: Spacing.md },
  lsPracticeBtn: {
    position: 'absolute',
    // Shifted left to clear the global help "i" button in the bottom-right
    // corner (they overlapped in landscape).
    right: Spacing.lg + 64,
    bottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Radii.pill,
    ...Lift,
  },
  lsPracticeText: { color: '#fff', fontSize: Type.size.md, fontWeight: Type.weight.heavy },
  lsScrim: { backgroundColor: '#00000033' },
  lsPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 360,
    maxWidth: '85%',
    backgroundColor: Palette.paper,
    borderLeftWidth: Borders.thin,
    borderLeftColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
    ...Lift,
  },
  lsPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lsPanelTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
  },
  lsPanelClose: {
    width: 34,
    height: 34,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stratRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radii.lg,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
  },
  stratRowName: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
  },
});
