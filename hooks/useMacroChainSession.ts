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
import { getPassage, type Marker, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import { useMetronome } from '@/lib/audio/useMetronome';
import { generateMacroSteps, type MacroStep } from '@/lib/strategies/macroChain';

// Marks are beat boundaries (start of each beat + one at the end), so N marks =
// N-1 beats. Need at least 2 beats to have something to chunk.
export const MIN_MACRO_MARKS = 3;

export type MacroPhase = 'marking' | 'config' | 'playing';

// Persisted in the exercise's config_json — beat marks live here, not the
// shared passage.units_json (which Click-Up uses for its own units).
export type MacroStoredConfig = {
  goalTempo: number;
  marks: Marker[];
  steps: MacroStep[];
};

export function useMacroChainSession(id: string | undefined) {
  const router = useRouter();
  const metronome = useMetronome(60);
  const microbreak = useMicrobreakTimer();

  const [phase, setPhase] = useState<MacroPhase>('marking');
  const [passage, setPassage] = useState<Passage | null>(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [storedConfig, setStoredConfig] = useState<MacroStoredConfig | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [marks, setMarks] = useState<Marker[]>([]);
  const [goalTempo, setGoalTempo] = useState('120');
  const [celebrating, setCelebrating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPassage(id).then((p) => {
      if (!cancelled) setPassage(p);
    });
    getOrCreateExercise(id, 'macro_chaining')
      .then(async (ex) => {
        if (cancelled) return;
        setExerciseId(ex.id);
        try {
          const parsed = ex.config_json
            ? (JSON.parse(ex.config_json) as Partial<MacroStoredConfig>)
            : null;
          if (parsed?.marks?.length) setMarks(parsed.marks);
          if (parsed?.goalTempo) setGoalTempo(String(parsed.goalTempo));
        } catch {
          // ignore malformed config
        }
        const progress = await getClickUpProgress(ex.id);
        if (!cancelled && progress) setCurrentIndex(progress.current_index);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('Macro-Chaining: failed to load exercise', e);
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

  function removeMark(index: number) {
    setMarks((prev) =>
      prev.filter((m) => m.index !== index).map((m, i) => ({ ...m, index: i + 1 })),
    );
  }

  function undoMark() {
    setMarks((prev) => prev.slice(0, -1));
  }

  function clearMarks() {
    setMarks([]);
  }

  async function commitMarksAndConfigure() {
    if (marks.length < MIN_MACRO_MARKS) return;
    if (exerciseId) {
      const partial: MacroStoredConfig = {
        goalTempo: parseInt(goalTempo, 10) || 120,
        marks,
        steps: [],
      };
      await updateExerciseConfig(exerciseId, JSON.stringify(partial));
    }
    setPhase('config');
  }

  async function startPlaying() {
    if (marks.length < MIN_MACRO_MARKS) return;
    if (!exerciseId) {
      setLoadError('Could not start — reload the page and try again.');
      return;
    }
    const tempo = parseInt(goalTempo, 10) || 120;
    const beatCount = marks.length - 1;
    const steps = generateMacroSteps(beatCount);
    if (steps.length === 0) return;
    const config: MacroStoredConfig = { goalTempo: tempo, marks, steps };
    try {
      await updateExerciseConfig(exerciseId, JSON.stringify(config));
      await upsertClickUpProgress(exerciseId, 0);
    } catch (e) {
      console.warn('Macro-Chaining: failed to save session', e);
      setLoadError('Could not save your session. Check your connection and try again.');
      return;
    }
    setLoadError(null);
    setStoredConfig(config);
    setCurrentIndex(0);
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
    // Microbreak every N steps (N from the Micro timer settings; default 1 =
    // each step). trigger() self-gates on the Micro timer being enabled.
    const everyN = microbreak.config.macroChainSteps || 1;
    if (nextIdx % everyN === 0) microbreak.trigger();
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
    await stampLastUsed(id, 'macro_chaining');
    const cur = storedConfig?.steps[currentIndex];
    const data: Record<string, unknown> = {
      step: currentIndex,
      totalSteps: storedConfig?.steps.length,
      kind: cur?.kind,
      chunkSize: cur?.chunkSize,
      restBeats: cur && cur.kind === 'chain' ? cur.restBeats : undefined,
      tempo: metronome.bpm,
    };
    if (annotation?.mood) data.mood = annotation.mood;
    if (annotation?.note) data.note = annotation.note;
    if (annotation?.remindNext) data.remindNext = true;
    await logPractice(id, 'macro_chaining', data, exerciseId);
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
    metronome.setBpm(storedConfig.goalTempo);
    setPhase('playing');
  }

  return {
    phase,
    passage,
    marks,
    goalTempo,
    storedConfig,
    currentIndex,
    celebrating,
    loadError,
    metronome,
    setGoalTempo,
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
