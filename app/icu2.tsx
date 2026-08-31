import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { BpmStepper } from '@/components/BpmStepper';
import { Button } from '@/components/Button';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PassagePicker } from '@/components/PassagePicker';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import { PracticeToolsBar } from '@/components/PracticeToolsBar';
import { RotateForPractice } from '@/components/RotateForPractice';
import { ScorePeekModal } from '@/components/ScorePeekModal';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { ZoomableImage } from '@/components/ZoomableImage';
import { PRACTICE_TOOLS_HELP, SHORTCUT_HINT_LINE } from '@/constants/helpCopy';
import { inheritedGoalForPassage } from '@/lib/coach/evaluation';
import { Colors, Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { Palette, Lift } from '@/constants/palette';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { usePracticeClock } from '@/hooks/usePracticeClock';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import {
  actionButtonStyle,
  HELP_CLEARANCE,
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
  tempoStacks,
} from '@/lib/layout/configForm';
import { useMetronome } from '@/lib/audio/useMetronome';
import { listExercisesForPassage } from '@/lib/db/repos/exercises';
import { listPassages, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { getTempoLadderProgressForPassages } from '@/lib/db/repos/tempoLadder';
import {
  ICU2_ROUNDS,
  icu2ClimbTempos,
  icu2DefaultStart,
  icu2EstimatedMinutes,
  icu2TotalReps,
  stepTogetherTempos,
  stepTogetherTotalReps,
  type Icu2Mode,
} from '@/lib/strategies/clickUp2';

// The strategy-identity color: a deeper shade of Interleaved Click-Up's
// petrol — same family (both are Gebrian clicking-up methods), clearly darker.
const ICU2_COLOR = '#085D79';

const ICU2_BODY =
  'Interleaved Click-Up 2 trains something regular Click-Up does not: playing a passage clean at tempo on the FIRST try, like you have to in rehearsal.\n\n' +
  'Pick 3 to 5 fast passages (7 to 10 if they are short, like single lines of a hard page). The app rotates you through them in seven rounds: climbing by 5s, then 10s, then 20s, then 30s, then just a few landmark tempos, and finally each passage once, cold, at tempo.\n\n' +
  'While you play the other passages you forget each one a little, so every return is a harder test. By the last round, first-try-at-tempo is exactly what you have been rehearsing.';

const ICU2_SELECT_BODY =
  ICU2_BODY +
  '\n\nTap passages to add or remove them (pick at least two). When your set looks right, tap Set tempos to review each passage’s start and goal tempo before you play.';

type Phase = 'select' | 'tempos' | 'playing' | 'done';

type Icu2Item = {
  passage: Passage;
  start: number;
  // null = no goal known yet; the user must set one before starting.
  goal: number | null;
  source: 'Tempo Ladder' | 'Click-Up' | 'saved goal' | 'this section' | null;
  // A mid-session "Save this tempo" caps the passage for the day: later
  // rounds climb to the ceiling instead of the goal.
  ceiling: number | null;
  // Top tempo actually reached (set when a climb tops out or a ceiling is
  // saved). Stays null for passages the session never finished.
  reached: number | null;
  // ── step-together mode only ──
  // Index into this passage's own ladder (stepTogetherTempos).
  rung: number;
  // Highest tempo played clean so far — the miss card's "Save & move on".
  lastClean: number | null;
  // Misses per rung index; the second miss at the same rung opens the card.
  missCount: Record<number, number>;
  // "Set aside for today" (miss card, no clean tempo yet): out of rotation,
  // nothing logged.
  setAside: boolean;
};

const FRESH_TOGETHER = {
  rung: 0,
  lastClean: null as number | null,
  missCount: {} as Record<number, number>,
  setAside: false,
};

export default function Icu2Screen() {
  usePracticeClock();
  return (
    <ErrorBoundary label="Interleaved Click-Up 2">
      <Icu2ScreenInner />
    </ErrorBoundary>
  );
}

function Icu2ScreenInner() {
  const router = useRouter();
  const { seedPassageId } = useLocalSearchParams<{ seedPassageId?: string }>();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  const isTouch = useIsTouchDevice();
  const isLandscape = vpW > vpH;
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('select');
  const [passages, setPassages] = useState<Passage[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [items, setItems] = useState<Icu2Item[]>([]);
  // Climb style: Gebrian's seven rounds (the original) or step together.
  const [mode, setMode] = useState<Icu2Mode>('rounds');
  const [climbBy, setClimbBy] = useState<5 | 10>(5);
  // Transient line after a silent step-together drop ("Down to 72…").
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showFlash(msg: string) {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2200);
  }
  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);
  // Momentary look at one passage's source page while setting its tempos.
  const [peekPassage, setPeekPassage] = useState<Passage | null>(null);

  // Session position.
  const [roundIdx, setRoundIdx] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);
  const [tempoIdx, setTempoIdx] = useState(0);
  const [interstitial, setInterstitial] = useState(false);
  const [missOpen, setMissOpen] = useState(false);
  const [slowerOpen, setSlowerOpen] = useState(false);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const repsRef = useRef(0);

  const metronome = useMetronome(80);
  const microbreak = useMicrobreakTimer();

  const cur = phase === 'playing' ? (items[itemIdx] ?? null) : null;
  const ann = useScoreAnnotation(cur?.passage);

  const round = ICU2_ROUNDS[roundIdx];
  const tempos = useMemo(() => {
    if (!cur || cur.goal == null) return [];
    if (mode === 'together') return stepTogetherTempos(cur.start, cur.goal, climbBy);
    return icu2ClimbTempos(cur.start, cur.ceiling ?? cur.goal, round);
  }, [cur, round, mode, climbBy]);
  // Position in the current climb: step-together tracks it per passage
  // (the rung), rounds mode tracks it per climb (tempoIdx).
  const posIdx = mode === 'together' ? (cur?.rung ?? 0) : tempoIdx;

  useEffect(() => {
    let cancelled = false;
    listPassages()
      .then((pcs) => {
        if (!cancelled) setPassages(pcs);
      })
      .catch((err) => {
        console.error('[icu2] listPassages failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-select the seed passage (the passage-detail pill) once loaded.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !seedPassageId || passages.length === 0) return;
    if (!passages.some((p) => p.id === seedPassageId)) return;
    seededRef.current = true;
    setSelectedIds((prev) =>
      prev.includes(seedPassageId) ? prev : [...prev, seedPassageId],
    );
  }, [passages, seedPassageId]);

  // Keep the metronome dialed to the current rep's tempo. Starting/stopping
  // the click stays under the user's control in the tools pill.
  useEffect(() => {
    if (phase !== 'playing') return;
    const t = tempos[posIdx];
    if (t && t !== metronome.bpm) metronome.setBpm(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tempos, posIdx]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // ── select → tempos: build rows, keep edits, prefill goals ───────────────
  async function goToTempos() {
    const chosen = selectedIds
      .map((id) => passages.find((p) => p.id === id))
      .filter((p): p is Passage => !!p);
    if (chosen.length < 2) return;

    // Keep rows the user already edited; append rows for newly-added ids.
    const prevById = new Map(items.map((it) => [it.passage.id, it]));
    const nextItems: Icu2Item[] = chosen.map(
      (passage) =>
        prevById.get(passage.id) ?? {
          passage,
          start: 60,
          goal: null,
          source: null,
          ceiling: null,
          reached: null,
          ...FRESH_TOGETHER,
        },
    );
    setItems(nextItems);
    setPhase('tempos');

    // Prefill goals for fresh rows, in priority order: Tempo Ladder's goal,
    // a saved Click-Up config's goal, the piece's own shared performance
    // tempo, then the most recent decided tempo in the passage's section.
    // Never overwrites a goal already set.
    const needIds = nextItems.filter((it) => it.goal == null).map((it) => it.passage.id);
    if (needIds.length === 0) return;
    const found = new Map<string, { goal: number; source: Icu2Item['source'] }>();
    try {
      const ladder = await getTempoLadderProgressForPassages(needIds);
      for (const row of ladder) {
        if (row.goal_tempo > 0) {
          found.set(row.piece_id, { goal: row.goal_tempo, source: 'Tempo Ladder' });
        }
      }
    } catch {
      // prefill is best-effort
    }
    for (const id of needIds) {
      if (found.has(id)) continue;
      try {
        const exercises = await listExercisesForPassage(id);
        const cu = exercises.find((e) => e.strategy === 'click_up' && e.config_json);
        if (cu?.config_json) {
          const cfg = JSON.parse(cu.config_json) as { goalTempo?: number };
          if (typeof cfg.goalTempo === 'number' && cfg.goalTempo > 0) {
            found.set(id, { goal: cfg.goalTempo, source: 'Click-Up' });
          }
        }
      } catch {
        // prefill is best-effort
      }
    }
    // 3. The piece's own shared performance tempo — set by evaluate's
    //    "Lock in" or any strategy start — for passages that never ran a
    //    ladder or click-up.
    for (const it of nextItems) {
      if (it.goal != null || found.has(it.passage.id)) continue;
      const pt = it.passage.performance_tempo;
      if (typeof pt === 'number' && pt > 0) {
        found.set(it.passage.id, { goal: pt, source: 'saved goal' });
      }
    }
    // 4. The most recent decided tempo among same-section neighbors.
    for (const it of nextItems) {
      if (it.goal != null || found.has(it.passage.id)) continue;
      try {
        const inherited = await inheritedGoalForPassage(it.passage);
        if (inherited) {
          found.set(it.passage.id, { goal: inherited.bpm, source: 'this section' });
        }
      } catch {
        // prefill is best-effort
      }
    }
    if (found.size === 0) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.goal != null) return it;
        const hit = found.get(it.passage.id);
        if (!hit) return it;
        return { ...it, goal: hit.goal, start: icu2DefaultStart(hit.goal), source: hit.source };
      }),
    );
  }

  // ── tempo edits (tempos phase; values flow through the shared BpmStepper) ─
  function setStartTempo(id: string, v: string) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.passage.id !== id || it.goal == null) return it;
        return { ...it, start: Math.min(Math.max(30, n), it.goal - 5) };
      }),
    );
  }

  function setGoalTempo(id: string, v: string) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.passage.id !== id) return it;
        const goal = Math.max(35, n);
        return { ...it, goal, start: Math.min(it.start, goal - 5) };
      }),
    );
  }

  // "Set a goal tempo" on a passage nothing could prefill: seed a sane pair
  // for the steppers to adjust from.
  function seedGoal(id: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.passage.id === id && it.goal == null
          ? { ...it, goal: 120, start: icu2DefaultStart(120) }
          : it,
      ),
    );
  }

  function startPlaying() {
    if (items.length < 2 || items.some((it) => it.goal == null)) return;
    // Silence a still-running Hear-tempo preview from the setup screen.
    metronome.stop();
    setItems((prev) =>
      prev.map((it) => ({ ...it, ceiling: null, reached: null, ...FRESH_TOGETHER })),
    );
    repsRef.current = 0;
    setRoundIdx(0);
    setItemIdx(0);
    setTempoIdx(0);
    setInterstitial(true);
    setPhase('playing');
  }

  // ── step-together advance ────────────────────────────────────────────────
  // A passage leaves the rotation when it tops out (reached) or is set aside.
  function togetherDone(it: Icu2Item) {
    return it.reached != null || it.setAside;
  }

  // Rotate to the next still-climbing passage after `nextItems` is applied.
  // Ends the session when every passage is done.
  function advanceTogether(nextItems: Icu2Item[], fromIdx: number) {
    for (let k = 1; k <= nextItems.length; k++) {
      const i = (fromIdx + k) % nextItems.length;
      if (!togetherDone(nextItems[i])) {
        setItemIdx(i);
        return;
      }
    }
    metronome.stop();
    setPhase('done');
  }

  async function togetherClean() {
    if (!cur) return;
    repsRef.current += 1;
    // In step-together every rep is a passage switch, so the Micro cadence
    // counts total clean reps across the session instead of per-passage.
    const everyN = microbreak.config.icu2Reps || 3;
    if (repsRef.current % everyN === 0) microbreak.trigger();
    await ann.flush();
    const t = tempos[cur.rung];
    const atTop = cur.rung >= tempos.length - 1;
    const next = items.map((it, i) => {
      if (i !== itemIdx) return it;
      const missCount = { ...it.missCount };
      delete missCount[it.rung];
      if (atTop) return { ...it, lastClean: t, missCount, reached: t };
      return { ...it, lastClean: t, missCount, rung: it.rung + 1 };
    });
    setItems(next);
    if (atTop) showFlash(`${cur.passage.title} hit ♩ = ${t}. Done for today.`);
    advanceTogether(next, itemIdx);
  }

  function togetherMiss() {
    if (!cur) return;
    const r = cur.rung;
    const n = (cur.missCount[r] ?? 0) + 1;
    const counted = items.map((it, i) =>
      i === itemIdx ? { ...it, missCount: { ...it.missCount, [r]: n } } : it,
    );
    setItems(counted);
    if (n >= 2) {
      // Second miss at the same tempo: the usual miss card decides.
      setMissOpen(true);
      return;
    }
    const t = tempos[r];
    if (r > 0) {
      const dropped = counted.map((it, i) => (i === itemIdx ? { ...it, rung: r - 1 } : it));
      setItems(dropped);
      showFlash(`Down to ♩ = ${tempos[r - 1]}. You'll come back around.`);
      advanceTogether(dropped, itemIdx);
    } else {
      showFlash(`Staying at ♩ = ${t}. You'll come back around.`);
      advanceTogether(counted, itemIdx);
    }
  }

  // ── session advance ──────────────────────────────────────────────────────
  function topOutCurrent() {
    const top = tempos[tempos.length - 1];
    setItems((prev) =>
      prev.map((it, i) => (i === itemIdx ? { ...it, reached: Math.max(it.reached ?? 0, top) } : it)),
    );
  }

  function nextSlot() {
    // The Micro cadence counts reps ON THIS PASSAGE — switching to the next
    // passage (or round) starts the count over (Ralph's call 2026-08-30).
    repsRef.current = 0;
    if (itemIdx < items.length - 1) {
      setItemIdx(itemIdx + 1);
      setTempoIdx(0);
      return;
    }
    if (roundIdx < ICU2_ROUNDS.length - 1) {
      setRoundIdx(roundIdx + 1);
      setItemIdx(0);
      setTempoIdx(0);
      setInterstitial(true);
      return;
    }
    metronome.stop();
    setPhase('done');
  }

  async function onNext() {
    if (!cur) return;
    if (mode === 'together') return togetherClean();
    repsRef.current += 1;
    // Micro break every N clean reps (✓ Next presses) on the current
    // passage — cadence from the Timer tool's Micro settings; nextSlot()
    // zeroes the count on every passage/round switch. trigger() self-gates
    // on the Micro timer being enabled, and the break's auto-pause
    // snapshots a running click and resumes it after — no explicit
    // metronome.stop() here.
    const everyN = microbreak.config.icu2Reps || 3;
    if (repsRef.current % everyN === 0) microbreak.trigger();
    await ann.flush();
    if (tempoIdx < tempos.length - 1) {
      setTempoIdx(tempoIdx + 1);
      return;
    }
    topOutCurrent();
    nextSlot();
  }

  function onMissPressed() {
    if (mode === 'together') return togetherMiss();
    setMissOpen(true);
  }

  function missStartOver() {
    setMissOpen(false);
    if (mode === 'together') {
      const next = items.map((it, i) =>
        i === itemIdx ? { ...it, rung: 0, missCount: {} } : it,
      );
      setItems(next);
      if (cur) showFlash(`Back to ♩ = ${cur.start}. Still in the rotation.`);
      advanceTogether(next, itemIdx);
      return;
    }
    setTempoIdx(0);
  }

  function missStartSlower(delta: number) {
    setSlowerOpen(false);
    if (mode === 'together') {
      const next = items.map((it, i) =>
        i === itemIdx
          ? { ...it, start: Math.max(30, it.start - delta), rung: 0, missCount: {} }
          : it,
      );
      setItems(next);
      const slowed = next[itemIdx];
      showFlash(`New start ♩ = ${slowed.start}. Still in the rotation.`);
      advanceTogether(next, itemIdx);
      return;
    }
    setItems((prev) =>
      prev.map((it, i) =>
        i === itemIdx ? { ...it, start: Math.max(30, it.start - delta) } : it,
      ),
    );
    setTempoIdx(0);
  }

  function missSaveTempo() {
    setMissOpen(false);
    if (mode === 'together') {
      // Save the highest clean tempo as today's ceiling; with no clean
      // tempo yet, set the passage aside (nothing logged for it).
      const next = items.map((it, i) => {
        if (i !== itemIdx) return it;
        if (it.lastClean != null) return { ...it, ceiling: it.lastClean, reached: it.lastClean };
        return { ...it, setAside: true };
      });
      setItems(next);
      advanceTogether(next, itemIdx);
      return;
    }
    const lastClean = tempoIdx > 0 ? tempos[tempoIdx - 1] : (cur?.start ?? 30);
    setItems((prev) =>
      prev.map((it, i) =>
        i === itemIdx ? { ...it, ceiling: lastClean, reached: lastClean } : it,
      ),
    );
    nextSlot();
  }

  function exitSession() {
    metronome.stop();
    setPhase('done');
  }

  async function finishLog(mood: string | null, note: string | null) {
    setNotePromptVisible(false);
    const played = items.filter((it) => it.reached != null && it.goal != null);
    for (const it of played) {
      try {
        const data: Record<string, unknown> = {
          goal: it.goal,
          start: it.start,
          reached: it.reached,
          atTempo: (it.reached ?? 0) >= (it.goal ?? Infinity),
        };
        if (mode === 'together') {
          data.mode = 'together';
          data.climbBy = climbBy;
        }
        if (mood) data.mood = mood;
        if (note) data.note = note;
        const others = items
          .filter((s) => s.passage.id !== it.passage.id)
          .map((s) => s.passage.title);
        if (others.length > 0) data.sessionPassages = others;
        await logPractice(it.passage.id, 'icu2', data);
      } catch {
        // ignore — keep navigation flowing
      }
    }
    metronome.stop();
    router.back();
  }

  // ── Select phase ─────────────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <PassagePicker
          selectedIds={selectedIds}
          passages={passages}
          onToggle={toggleSelect}
          onSetSelected={setSelectedIds}
          onStart={goToTempos}
          onExit={() => router.back()}
          minToStart={2}
          startLabel="Set tempos →"
          pinnedPassageId={seedPassageId}
        />
        <TutorialStep
          id="icu2-first-run"
          visible={true}
          title="Interleaved Click-Up 2 · beta"
          body={ICU2_SELECT_BODY}
        />
      </ThemedView>
    );
  }

  // ── Tempos phase ─────────────────────────────────────────────────────────
  if (phase === 'tempos') {
    const ready = items.length >= 2 && items.every((it) => it.goal != null);
    const pairs = items
      .filter((it): it is Icu2Item & { goal: number } => it.goal != null)
      .map((it) => ({ start: it.start, goal: it.goal }));
    const total =
      mode === 'together' ? stepTogetherTotalReps(pairs, climbBy) : icu2TotalReps(pairs);
    const mins = icu2EstimatedMinutes(total);
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={() => {
            metronome.stop();
            setPhase('select');
          }}
          exitLabel="‹ Back"
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Interleaved Click-Up 2
            </ThemedText>
          }
        />
        <ScrollView contentContainerStyle={styles.temposContent}>
          <ThemedText style={styles.sectionHeader}>Climb style</ThemedText>
          <View style={styles.modeGrid}>
            <Icu2ModeCard
              title="Gebrian's rounds"
              subtitle="Whole ladder per passage. Seven rounds, bigger jumps each time."
              selected={mode === 'rounds'}
              onPress={() => setMode('rounds')}
            />
            <Icu2ModeCard
              title="Step together"
              subtitle="One step on each passage, then around again."
              isNew
              selected={mode === 'together'}
              onPress={() => setMode('together')}
            />
          </View>
          {mode === 'together' && (
            <>
              <ThemedText style={styles.fieldLabel}>Climb by</ThemedText>
              <View style={styles.chipRow}>
                {([5, 10] as const).map((inc) => (
                  <Pressable
                    key={inc}
                    onPress={() => setClimbBy(inc)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: climbBy === inc }}
                    style={[
                      styles.chip,
                      {
                        borderColor: climbBy === inc ? ICU2_COLOR : Palette.border,
                        backgroundColor: climbBy === inc ? ICU2_COLOR : 'transparent',
                      },
                    ]}>
                    <ThemedText
                      style={{ color: climbBy === inc ? '#fff' : Palette.text }}>
                      +{inc}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <ThemedText style={[styles.sectionHeader, { marginTop: Spacing.sm }]}>
            Tempos
          </ThemedText>
          <ThemedText style={[styles.helper, { color: C.icon }]}>
            Each passage climbs from its start tempo to its goal. Goals are
            pre-filled from your saved goal tempos and past practice when we
            have them. Press ▶ to hear a tempo before you commit to it.
          </ThemedText>
          {items.map((it) => (
            <View key={it.passage.id} style={styles.tempoRow}>
              <View style={styles.tempoRowHead}>
                <ThemedText style={styles.tempoRowTitle} numberOfLines={1}>
                  {it.passage.title}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.tempoRowTag,
                    { color: it.source ? Palette.textMuted : Palette.danger },
                  ]}>
                  {it.source ? `goal from ${it.source}` : it.goal == null ? 'needs a goal' : ''}
                </ThemedText>
                <Button
                  label="View score"
                  icon="eye"
                  variant="outline"
                  size="xs"
                  onPress={() => setPeekPassage(it.passage)}
                />
              </View>
              {it.goal == null ? (
                <Button
                  label="Set a goal tempo"
                  variant="outline"
                  onPress={() => seedGoal(it.passage.id)}
                />
              ) : (
                <View style={tempoStacks(vpW) ? styles.fieldsStacked : styles.fieldsRow}>
                  <View style={styles.field}>
                    <ThemedText style={styles.fieldLabel}>Start BPM</ThemedText>
                    <BpmStepper
                      value={String(it.start)}
                      onChange={(v) => setStartTempo(it.passage.id, v)}
                      metronome={metronome}
                      accent={ICU2_COLOR}
                    />
                  </View>
                  <View style={styles.field}>
                    <ThemedText style={styles.fieldLabel}>Goal BPM</ThemedText>
                    <BpmStepper
                      value={String(it.goal)}
                      onChange={(v) => setGoalTempo(it.passage.id, v)}
                      metronome={metronome}
                      accent={ICU2_COLOR}
                    />
                  </View>
                </View>
              )}
            </View>
          ))}
          {mode === 'rounds' ? (
            <View style={styles.roundsCard}>
              <ThemedText style={styles.roundsCardTitle}>The seven rounds</ThemedText>
              {ICU2_ROUNDS.map((r) => (
                <ThemedText key={r.label} style={styles.roundsCardLine}>
                  {r.label}
                </ThemedText>
              ))}
            </View>
          ) : (
            <View style={styles.roundsCard}>
              <ThemedText style={styles.roundsCardTitle}>How step together works</ThemedText>
              <ThemedText style={styles.roundsCardLine}>
                Passages take turns: one rep on each at its own tempo, then around
                again with everyone a step higher. Miss one and that passage drops a
                step while the others keep climbing. Miss twice at the same tempo and
                you choose: restart its climb, lower its start, or save the tempo as
                today&rsquo;s ceiling. The session ends when every passage has reached its
                goal or saved a ceiling.
              </ThemedText>
            </View>
          )}
        </ScrollView>
        <View style={styles.bottomBar}>
          <ThemedText style={styles.summaryLine}>
            {ready
              ? mode === 'together'
                ? `${items.length} passages · about ${total} reps if every step is clean · roughly ${mins} min`
                : `${items.length} passages · 7 rounds · about ${total} reps · roughly ${mins} min`
              : items.length < 2
                ? 'Pick at least two passages.'
                : 'A passage still needs a goal tempo.'}
          </ThemedText>
          <Button
            label="Start session"
            onPress={startPlaying}
            disabled={!ready}
            style={actionButtonStyle}
          />
        </View>

        <ScorePeekModal
          visible={peekPassage != null}
          passage={peekPassage}
          onClose={() => setPeekPassage(null)}
        />
      </ThemedView>
    );
  }

  // ── Done phase ───────────────────────────────────────────────────────────
  if (phase === 'done') {
    const played = items.filter((it) => it.reached != null);
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={() => (played.length === 0 ? router.back() : setNotePromptVisible(true))}
          exitLabel={played.length === 0 ? '‹ Back' : 'EXIT'}
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Session complete
            </ThemedText>
          }
        />
        <ScrollView contentContainerStyle={styles.temposContent}>
          <ThemedText style={[styles.helper, { color: C.icon }]}>
            {played.length === 0
              ? 'Nothing played yet, so nothing will be logged.'
              : 'Goal vs. what you actually reached. A saved tempo is where that passage topped out today; watch it climb across sessions.'}
          </ThemedText>
          {items.map((it) => {
            const atTempo = it.reached != null && it.goal != null && it.reached >= it.goal;
            return (
              <View key={it.passage.id} style={styles.resultRow}>
                <ThemedText style={styles.tempoRowTitle} numberOfLines={1}>
                  {it.passage.title}
                </ThemedText>
                <ThemedText style={styles.resultGoal}>
                  {it.goal != null ? `♩ ${it.goal}` : '—'}
                </ThemedText>
                <View
                  style={[
                    styles.resultChip,
                    atTempo
                      ? styles.resultChipGood
                      : it.reached != null
                        ? styles.resultChipCeil
                        : styles.resultChipSkip,
                  ]}>
                  <ThemedText
                    style={[
                      styles.resultChipText,
                      atTempo
                        ? { color: Palette.success }
                        : it.reached != null
                          ? { color: Palette.danger }
                          : { color: Palette.textMuted },
                    ]}>
                    {atTempo
                      ? '✓ at tempo'
                      : it.reached != null
                        ? `saved at ${it.reached}`
                        : 'not played'}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </ScrollView>
        {played.length > 0 && (
          <View style={styles.bottomBar}>
            <Button
              label="Save & finish"
              onPress={() => setNotePromptVisible(true)}
              style={actionButtonStyle}
            />
          </View>
        )}
        <PracticeLogNotePrompt
          metronome={metronome}
          strategy="icu2"
          visible={notePromptVisible}
          title="How did that go?"
          subtitle="Interleaved Click-Up 2"
          submitLabel="Save & finish"
          cancelLabel="Skip"
          onSubmit={({ mood, note }) => finishLog(mood, note)}
          onSkip={() => finishLog(null, null)}
        />
      </ThemedView>
    );
  }

  // ── Playing phase ────────────────────────────────────────────────────────
  const missBlocked = interstitial || missOpen || slowerOpen;
  const lastClean =
    mode === 'together' ? cur?.lastClean ?? null : tempoIdx > 0 ? tempos[tempoIdx - 1] : null;
  const climbingCount = items.filter((it) => !togetherDone(it)).length;
  return (
    <View style={styles.playRoot}>
      <Stack.Screen options={{ headerShown: false }} />
      <PedalCatcher active={!missBlocked} onAdvance={onNext} secondaryKey="x" onSecondary={onMissPressed} />

      <View style={[styles.runTopBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.runSide}>
          <Pressable onPress={exitSession} hitSlop={8} style={styles.runExit}>
            <Feather name="log-out" size={15} color={Palette.danger} />
            <ThemedText style={styles.runExitText}>Exit</ThemedText>
          </Pressable>
        </View>
        <View style={styles.runCenter}>
          {!isPhone && (
            <View style={styles.runTitleRow}>
              <View style={styles.runStratDot} />
              <ThemedText style={styles.runTitleText} numberOfLines={1}>
                Click-Up 2
              </ThemedText>
              {!!cur?.passage.title && (
                <ThemedText style={styles.runTitleMeta} numberOfLines={1}>
                  {'  ·  '}
                  {cur.passage.title}
                </ThemedText>
              )}
            </View>
          )}
          <View style={styles.runStatPill}>
            <ThemedText style={styles.runStatBpm}>{tempos[posIdx] ?? metronome.bpm}</ThemedText>
            <ThemedText style={styles.runStatUnit}>BPM</ThemedText>
            <View style={styles.runStatDivider} />
            <View style={styles.runStatDots}>
              {tempos.map((t, i) => (
                <View
                  key={`${t}-${i}`}
                  style={[
                    styles.climbDot,
                    i < posIdx
                      ? styles.climbDotDone
                      : i === posIdx
                        ? styles.climbDotNow
                        : styles.climbDotTodo,
                  ]}
                />
              ))}
            </View>
            <View style={styles.runStatDivider} />
            <ThemedText style={styles.runStatCount}>
              {itemIdx + 1}/{items.length}
            </ThemedText>
          </View>
          <ThemedText style={[styles.roundLine, flash != null && styles.roundLineFlash]} numberOfLines={1}>
            {mode === 'together'
              ? flash ??
                `Step together · climbing by ${climbBy}s · ${climbingCount} of ${items.length} still climbing`
              : `${round.label}${cur?.ceiling != null ? `  ·  ceiling ${cur.ceiling}` : ''}`}
          </ThemedText>
        </View>
        <View style={styles.runSide} />
      </View>

      <View
        style={[
          styles.contentArea,
          isPhone
            ? { paddingBottom: insets.bottom + (isLandscape ? 8 : 0) }
            : {
                paddingHorizontal: SCORE_SIDE_BUFFER,
                paddingTop: SCORE_VERT_BUFFER,
                paddingBottom: Spacing.sm,
                backgroundColor: SCORE_FRAME_BG,
              },
        ]}>
        <View style={{ flex: 1, width: '100%', position: 'relative' }}>
          {cur?.passage.source_uri &&
            (isTouch ? (
              <ZoomableImage
                uri={cur.passage.source_uri}
                style={styles.scoreContain}
                persistKey={cur.passage.id}
              />
            ) : (
              <Image
                source={{ uri: cur.passage.source_uri }}
                style={styles.scoreContain}
                contentFit="contain"
              />
            ))}
          {ann.canvas}
        </View>
      </View>

      {isPhone && isLandscape ? (
        <>
          <Pressable
            onPress={onMissPressed}
            hitSlop={6}
            accessibilityLabel="Mark as miss"
            style={[
              styles.cornerBtn,
              styles.missOutlineBtn,
              { bottom: insets.bottom + 4, left: insets.left + 16 + 64 },
            ]}>
            <ThemedText style={styles.missBtnText}>✕  Miss</ThemedText>
          </Pressable>
          <Pressable
            onPress={onNext}
            hitSlop={6}
            accessibilityLabel="Next tempo"
            style={[
              styles.cornerBtn,
              styles.cleanFilledBtn,
              { bottom: insets.bottom + 4, right: insets.right + 16 + 64 },
            ]}>
            <ThemedText style={styles.cleanBtnText}>✓  Next</ThemedText>
          </Pressable>
          <ThemedText
            pointerEvents="none"
            style={[styles.runHintLine, { bottom: insets.bottom + 6 }]}>
            {SHORTCUT_HINT_LINE}
          </ThemedText>
        </>
      ) : (
        <View style={[styles.runBottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.runBtnRow}>
            <Pressable
              onPress={onMissPressed}
              accessibilityLabel="Mark as miss"
              style={[styles.bottomBtn, styles.missOutlineBtn]}>
              <ThemedText style={styles.missBtnText}>✕  Miss</ThemedText>
            </Pressable>
            <Pressable
              onPress={onNext}
              accessibilityLabel="Next tempo"
              style={[styles.bottomBtn, styles.cleanBtnWide, styles.cleanFilledBtn]}>
              <ThemedText style={styles.cleanBtnText}>✓  Next</ThemedText>
            </Pressable>
          </View>
          <ThemedText style={styles.runHintAuto}>
            {mode === 'together'
              ? 'Play it clean, then tap ✓ Next. One step on this passage, then the next one gets a turn.'
              : 'Play it clean, then tap ✓ Next. The metronome climbs for you and rotates you between passages.'}
          </ThemedText>
          {!isPhone && (
            <ThemedText style={styles.runHintShortcut}>{SHORTCUT_HINT_LINE}</ThemedText>
          )}
        </View>
      )}

      <PracticeToolsBar
        metronome={metronome}
        pencil={{ ...ann.pencil, onUndo: ann.undo }}
        recorderPassageId={cur?.passage.id}
      />

      {/* Between-rounds card. Plain absolute overlay (not Modal) so web taps
          behave — see the RN-Web Modal pointer-events gotcha. */}
      {interstitial && (
        <View style={styles.interstitialWrap}>
          <View style={styles.interstitialCard}>
            <ThemedText style={styles.interstitialTitle}>
              {mode === 'together' ? 'Step together' : round.label.split('·')[0].trim()}
            </ThemedText>
            <ThemedText style={styles.interstitialBody}>
              {mode === 'together'
                ? `One rep on each passage, then around again a step higher. A miss drops that passage ${climbBy} and you pick it up next time around.`
                : round.intro}
            </ThemedText>
            <Button label="Continue" onPress={() => setInterstitial(false)} />
          </View>
        </View>
      )}

      <ActionSheet
        visible={missOpen}
        title={
          mode === 'together'
            ? `Missed at ♩ = ${tempos[posIdx] ?? ''} again · ceiling for today?`
            : `Missed at ♩ = ${tempos[tempoIdx] ?? ''} · start too fast?`
        }
        items={[
          // In step-together a passage already at its start tempo has no
          // climb to restart, so that option drops out.
          ...(mode === 'together' && (cur?.rung ?? 0) === 0
            ? []
            : [{ label: 'Start this climb over', primary: true, onPress: missStartOver }]),
          {
            label: 'Start slower…',
            onPress: () => {
              setMissOpen(false);
              setSlowerOpen(true);
            },
          },
          mode === 'together'
            ? {
                label:
                  lastClean != null
                    ? `Save ${lastClean} & move on`
                    : 'Set this one aside for today',
                onPress: missSaveTempo,
              }
            : {
                label:
                  lastClean != null ? `Save ${lastClean} & move on` : 'Save start tempo & move on',
                onPress: missSaveTempo,
              },
        ]}
        cancelLabel="Keep going"
        onCancel={() => setMissOpen(false)}
      />
      <ActionSheet
        visible={slowerOpen}
        title="Lower this passage's start tempo"
        items={[
          { label: '−5', onPress: () => missStartSlower(5) },
          { label: '−10', onPress: () => missStartSlower(10) },
          { label: '−20', onPress: () => missStartSlower(20) },
        ]}
        cancelLabel="Cancel"
        onCancel={() => setSlowerOpen(false)}
      />

      <TutorialStep
        id="icu2-play"
        visible={false}
        title="Running Interleaved Click-Up 2"
        body={
          'The metronome is set to the tempo you should play at, and the dots in the pill show where you are in this climb.\n\n' +
          '✓ Next: you played it clean. The tempo climbs, and at the top of a climb you rotate to the next passage.\n\n' +
          '✗ Miss: choose to start the climb over, lower this passage’s start tempo, or save the last clean tempo as today’s ceiling and move on.\n\n' +
          'Step together mode is different: passages take one tempo step each, in turns. A miss quietly drops that passage one step and moves on; a second miss at the same tempo brings up those choices.\n\n' +
          'Keyboard / pedal: Space = Next ✓, X = Miss ✗.\n\n' +
          PRACTICE_TOOLS_HELP
        }
      />
      <RotateForPractice />
    </View>
  );
}

// The Tempo Ladder mode-picker card pattern, with an optional NEW chip.
function Icu2ModeCard({
  title,
  subtitle,
  selected,
  isNew = false,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  isNew?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.modeCard,
        {
          borderWidth: selected ? Borders.thick : Borders.thin,
          borderColor: selected ? ICU2_COLOR : Palette.border,
          backgroundColor: selected
            ? ICU2_COLOR + '14'
            : pressed
              ? Palette.surfaceSunk
              : Palette.card,
        },
      ]}>
      {selected && (
        <View style={styles.modeCardCheck}>
          <Feather name="check" size={16} color={ICU2_COLOR} />
        </View>
      )}
      <View style={styles.modeCardTitleRow}>
        <ThemedText
          style={[styles.modeCardTitle, { color: selected ? ICU2_COLOR : Palette.text }]}
          numberOfLines={2}>
          {title}
        </ThemedText>
        {isNew && (
          <View style={styles.newChip}>
            <ThemedText style={styles.newChipText}>NEW</ThemedText>
          </View>
        )}
      </View>
      <ThemedText style={styles.modeCardSubtitle} numberOfLines={3}>
        {subtitle}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  contentArea: { flex: 1 },
  scoreContain: { flex: 1, width: '100%' },

  // ── run screen (mirrors Rep Rotator / Tempo Ladder) ──────────────────────
  playRoot: { flex: 1, backgroundColor: Palette.paper },
  runTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  runSide: { flex: 1, justifyContent: 'center' },
  runExit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
  },
  runExitText: {
    color: Palette.danger,
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.md,
  },
  runCenter: { alignItems: 'center', gap: 6 },
  runTitleRow: { flexDirection: 'row', alignItems: 'center' },
  runStratDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ICU2_COLOR,
    marginRight: 7,
  },
  runTitleText: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.2,
  },
  runTitleMeta: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    color: Palette.textMuted,
  },
  runStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    backgroundColor: Palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    ...Lift,
  },
  runStatBpm: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    fontVariant: ['tabular-nums'],
  },
  runStatUnit: {
    fontSize: 10,
    fontWeight: Type.weight.bold,
    letterSpacing: 0.5,
    color: Palette.textMuted,
    marginLeft: -4,
  },
  runStatDivider: { width: 1, height: 14, backgroundColor: Palette.border },
  runStatDots: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    flexShrink: 1,
    flexWrap: 'wrap',
    maxWidth: 170,
  },
  climbDot: { width: 7, height: 7, borderRadius: 4 },
  climbDotDone: { backgroundColor: ICU2_COLOR },
  climbDotNow: {
    backgroundColor: Palette.text,
    transform: [{ scale: 1.35 }],
  },
  climbDotTodo: { backgroundColor: Palette.border },
  runStatCount: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
    color: Palette.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  roundLine: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    color: Palette.textMuted,
  },
  runBottomBar: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: 6,
    zIndex: 56,
  },
  runBtnRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    ...Lift,
  },
  cleanBtnWide: { minWidth: 200 },
  missOutlineBtn: {
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.danger,
  },
  cleanFilledBtn: { backgroundColor: Palette.success },
  missBtnText: { color: Palette.danger, fontWeight: Type.weight.heavy, fontSize: 17 },
  cleanBtnText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 17 },
  cornerBtn: {
    position: 'absolute',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    ...Lift,
    zIndex: 56,
  },
  runHintLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: Type.weight.semibold,
    color: Palette.textMuted,
    zIndex: 4,
  },
  runHintAuto: {
    textAlign: 'center',
    fontSize: 12,
    color: Palette.textMuted,
    marginTop: 2,
  },
  runHintShortcut: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: Type.weight.semibold,
    color: Palette.textSecondary,
  },

  roundLineFlash: {
    color: Palette.text,
    fontWeight: Type.weight.bold,
  },

  // ── climb-style picker + tempo fields (tempos phase) — the Tempo Ladder
  //    setup-screen patterns, in ICU2's accent ─────────────────────────────
  sectionHeader: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.2,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  modeCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 140,
    minHeight: 78,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 4,
    position: 'relative',
    ...Lift,
  },
  modeCardCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  modeCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingRight: 20,
  },
  modeCardTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
    letterSpacing: -0.1,
  },
  modeCardSubtitle: {
    fontSize: Type.size.xs,
    lineHeight: 16,
    color: Palette.textSecondary,
  },
  newChip: {
    borderRadius: Radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: 'rgba(8, 93, 121, 0.12)',
  },
  newChipText: {
    fontSize: 10,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.6,
    color: ICU2_COLOR,
  },
  fieldLabel: { opacity: 0.7 },
  chipRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  chip: {
    borderWidth: Borders.thin,
    borderRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minWidth: 56,
    alignItems: 'center',
  },
  fieldsRow: { flexDirection: 'row', gap: Spacing.md },
  fieldsStacked: { flexDirection: 'column', gap: Spacing.md },
  field: { flex: 1, gap: 6 },

  // ── tempos + done phases ─────────────────────────────────────────────────
  temposContent: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: Spacing['2xl'],
  },
  helper: {
    fontSize: Type.size.sm,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  tempoRow: {
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  tempoRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tempoRowTitle: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
    flexShrink: 1,
  },
  tempoRowTag: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
  },
  roundsCard: {
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: 4,
    marginTop: Spacing.xs,
  },
  roundsCardTitle: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.bold,
    marginBottom: 2,
  },
  roundsCardLine: {
    fontSize: Type.size.sm,
    color: Palette.textSecondary,
  },
  bottomBar: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: HELP_CLEARANCE,
    gap: Spacing.sm,
  },
  summaryLine: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    color: Palette.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  resultGoal: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    color: Palette.textSecondary,
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto',
  },
  resultChip: {
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: Borders.thin,
  },
  resultChipGood: {
    backgroundColor: 'transparent',
    borderColor: Palette.success,
  },
  resultChipCeil: {
    backgroundColor: 'transparent',
    borderColor: Palette.danger,
  },
  resultChipSkip: {
    backgroundColor: 'transparent',
    borderColor: Palette.border,
  },
  resultChipText: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
    fontVariant: ['tabular-nums'],
  },

  // ── interstitial ─────────────────────────────────────────────────────────
  interstitialWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(30, 28, 24, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    zIndex: 60,
  },
  interstitialCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
    ...Lift,
  },
  interstitialTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
  },
  interstitialBody: {
    fontSize: Type.size.md,
    lineHeight: 21,
    textAlign: 'center',
    color: Palette.textSecondary,
  },
});
