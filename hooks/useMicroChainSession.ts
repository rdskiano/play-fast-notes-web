import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  getOrCreateExercise,
  updateExerciseConfig,
} from '@/lib/db/repos/exercises';
import {
  getClickUpProgress,
  setClickUpIndex,
  upsertClickUpProgress,
} from '@/lib/db/repos/clickUp';
import {
  getPassage,
  type Marker,
  type Passage,
} from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { useMetronome } from '@/lib/audio/useMetronome';
import {
  generateMicroSteps,
  type MicroMode,
  type MicroStep,
} from '@/lib/strategies/microChain';

// A "link" of the chain is whatever the user taps — usually a single note.
// Micro-Chaining targets short fragments, so even two links is a valid drill.
export const MIN_MICRO_MARKS = 2;

// 'problem' is the full-screen pick-two-notes step, only used in Problem mode
// (between config and playing).
export type MicroPhase = 'marking' | 'config' | 'problem' | 'playing';

// Persisted in the exercise's config_json. Marks live here (NOT in the shared
// passage.units_json) because micro marks are note-level and would clobber the
// beat/measure units that Interleaved Click-Up keeps on the passage.
export type MicroStoredConfig = {
  mode: MicroMode;
  // The two note indices that bound the problem span (adjacent or not).
  problemA: number | null;
  problemB: number | null;
  performanceTempo: number;
  marks: Marker[];
  steps: MicroStep[];
};

export function useMicroChainSession(id: string | undefined) {
  const router = useRouter();
  const metronome = useMetronome(60);

  const [phase, setPhase] = useState<MicroPhase>('marking');
  const [passage, setPassage] = useState<Passage | null>(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [storedConfig, setStoredConfig] = useState<MicroStoredConfig | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [marks, setMarks] = useState<Marker[]>([]);
  const [mode, setMode] = useState<MicroMode>('forward');
  const [problemA, setProblemA] = useState<number | null>(null);
  const [problemB, setProblemB] = useState<number | null>(null);
  const [performanceTempo, setPerformanceTempo] = useState('120');
  const [celebrating, setCelebrating] = useState(false);
  // Surfaced on the config screen so a failed exercise load / start isn't a
  // dead button — e.g. if the network drops or the DB rejects the write.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPassage(id).then((p) => {
      if (!cancelled) setPassage(p);
    });
    getOrCreateExercise(id, 'micro_chaining').then(async (ex) => {
      if (cancelled) return;
      setExerciseId(ex.id);
      try {
        const parsed = ex.config_json
          ? (JSON.parse(ex.config_json) as Partial<MicroStoredConfig>)
          : null;
        if (parsed?.marks?.length) setMarks(parsed.marks);
        if (parsed?.mode) setMode(parsed.mode);
        if (parsed?.problemA != null) setProblemA(parsed.problemA);
        if (parsed?.problemB != null) setProblemB(parsed.problemB);
        if (parsed?.performanceTempo) setPerformanceTempo(String(parsed.performanceTempo));
      } catch {
        // ignore malformed config
      }
      const progress = await getClickUpProgress(ex.id);
      if (!cancelled && progress) setCurrentIndex(progress.current_index);
    }).catch((e) => {
      if (cancelled) return;
      console.warn('Micro-Chaining: failed to load exercise', e);
      setLoadError('Could not load this exercise. Check your connection and reload.');
    });
    return () => {
      cancelled = true;
      metronome.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function placeMark({ x, y }: { x: number; y: number }) {
    setMarks((prev) => [...prev, { index: prev.length + 1, x, y }]);
  }

  function clearProblem() {
    setProblemA(null);
    setProblemB(null);
  }

  function removeMark(index: number) {
    setMarks((prev) =>
      prev.filter((m) => m.index !== index).map((m, i) => ({ ...m, index: i + 1 })),
    );
    // Dropping a mark renumbers the rest, so a chosen problem span no longer
    // points at the right notes — clear it so the user re-picks.
    clearProblem();
  }

  function undoMark() {
    setMarks((prev) => prev.slice(0, -1));
    clearProblem();
  }

  function clearMarks() {
    setMarks([]);
    clearProblem();
  }

  // Persist marks + current mode/tempo without generating steps yet — so a
  // user who marks up a passage and leaves keeps their marks next time.
  async function commitMarksAndConfigure() {
    if (marks.length < MIN_MICRO_MARKS) return;
    if (exerciseId) {
      const partial: MicroStoredConfig = {
        mode,
        problemA,
        problemB,
        performanceTempo: parseInt(performanceTempo, 10) || 120,
        marks,
        steps: [],
      };
      await updateExerciseConfig(exerciseId, JSON.stringify(partial));
    }
    setPhase('config');
  }

  // Tap a note to build the two-note problem span. First tap = A, second
  // distinct tap = B, a third tap starts over from the tapped note. Notes can
  // be adjacent or far apart.
  function selectProblemNote(index: number) {
    if (index < 1 || index > marks.length) return;
    if (problemA == null) {
      setProblemA(index);
    } else if (problemB == null) {
      if (index !== problemA) setProblemB(index);
      else setProblemA(index); // tapped the same note — keep it as A
    } else {
      setProblemA(index);
      setProblemB(null);
    }
  }

  // Step back one problem-note pick: drop the second, then the first.
  function undoProblemNote() {
    if (problemB != null) setProblemB(null);
    else if (problemA != null) setProblemA(null);
  }

  // From config: Problem mode routes through the full-screen pick-two-notes
  // step before playing; Forward/Backward start directly.
  function goToProblemSelect() {
    if (marks.length < 3) return;
    setPhase('problem');
  }

  async function startPlaying() {
    if (marks.length < MIN_MICRO_MARKS) return;
    if (mode === 'problem' && (problemA == null || problemB == null || marks.length < 3))
      return;
    if (!exerciseId) {
      setLoadError('Could not start — reload the page and try again.');
      return;
    }
    const tempo = parseInt(performanceTempo, 10) || 120;
    const steps = generateMicroSteps(
      mode,
      marks.length,
      problemA ?? undefined,
      problemB ?? undefined,
    );
    if (steps.length === 0) return;
    const config: MicroStoredConfig = {
      mode,
      problemA,
      problemB,
      performanceTempo: tempo,
      marks,
      steps,
    };
    try {
      await updateExerciseConfig(exerciseId, JSON.stringify(config));
      await upsertClickUpProgress(exerciseId, 0);
    } catch (e) {
      console.warn('Micro-Chaining: failed to save session', e);
      setLoadError('Could not save your session. Check your connection and try again.');
      return;
    }
    setLoadError(null);
    setStoredConfig(config);
    setCurrentIndex(0);
    // Seed the metronome to the performance tempo once; the user stays in
    // control of it during play (Micro-Chaining doesn't drive the metronome).
    metronome.setBpm(tempo);
    setPhase('playing');
  }

  async function onNext() {
    if (!storedConfig || !exerciseId) return;
    const nextIdx = currentIndex + 1;
    if (nextIdx >= storedConfig.steps.length) {
      setCelebrating(true);
      return;
    }
    setCurrentIndex(nextIdx);
    await setClickUpIndex(exerciseId, nextIdx);
  }

  async function onPrev() {
    if (!storedConfig || !exerciseId) return;
    const prevIdx = Math.max(0, currentIndex - 1);
    if (prevIdx === currentIndex) return;
    setCurrentIndex(prevIdx);
    await setClickUpIndex(exerciseId, prevIdx);
  }

  async function exitSession() {
    if (exerciseId) await setClickUpIndex(exerciseId, currentIndex);
    metronome.stop();
    router.back();
  }

  function dismissCelebration() {
    setCelebrating(false);
  }

  async function doneSession(annotation?: {
    mood: string | null;
    note: string | null;
    remindNext?: boolean;
  }) {
    if (!id || !exerciseId) {
      router.back();
      return;
    }
    await setClickUpIndex(exerciseId, currentIndex);
    await stampLastUsed(id, 'micro_chaining');
    const data: Record<string, unknown> = {
      mode,
      step: currentIndex,
      totalSteps: storedConfig?.steps.length,
      tempo: metronome.bpm,
    };
    if (annotation?.mood) data.mood = annotation.mood;
    if (annotation?.note) data.note = annotation.note;
    if (annotation?.remindNext) data.remindNext = true;
    await logPractice(id, 'micro_chaining', data, exerciseId);
    metronome.stop();
    setCelebrating(false);
    router.back();
  }

  function goBackToMarking() {
    setPhase('marking');
  }

  function goBackToConfig() {
    metronome.stop();
    setPhase('config');
  }

  function resumePlaying() {
    if (!storedConfig) return;
    metronome.setBpm(storedConfig.performanceTempo);
    setPhase('playing');
  }

  return {
    phase,
    passage,
    marks,
    mode,
    problemA,
    problemB,
    performanceTempo,
    storedConfig,
    currentIndex,
    celebrating,
    loadError,
    metronome,
    setMode,
    setPerformanceTempo,
    selectProblemNote,
    undoProblemNote,
    goToProblemSelect,
    placeMark,
    removeMark,
    undoMark,
    clearMarks,
    commitMarksAndConfigure,
    startPlaying,
    onNext,
    onPrev,
    exitSession,
    doneSession,
    dismissCelebration,
    goBackToMarking,
    goBackToConfig,
    resumePlaying,
  };
}
