import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import type { Increment } from '@/components/TempoConfigFields';
import {
  getClickUpProgress,
  setClickUpIndex,
  upsertClickUpProgress,
} from '@/lib/db/repos/clickUp';
import { getOrCreateExercise, updateExerciseConfig } from '@/lib/db/repos/exercises';
import {
  getPiece,
  parseMarkers,
  updatePieceUnits,
  type Marker,
  type Piece,
} from '@/lib/db/repos/pieces';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { useMetronome } from '@/lib/audio/useMetronome';
import { generateSteps, type ClickUpStep } from '@/lib/strategies/clickUp';

export const MIN_MARKERS = 3;

export type ClickUpPhase = 'marking' | 'config' | 'playing';

export type StoredConfig = {
  N: number;
  startTempo: number;
  goalTempo: number;
  increment: number;
  steps: ClickUpStep[];
};

export function useClickUpSession(id: string | undefined) {
  const router = useRouter();
  const metronome = useMetronome(60);
  const microbreak = useMicrobreakTimer();
  const repCounterRef = useRef(0);

  const [phase, setPhase] = useState<ClickUpPhase>('marking');
  const [piece, setPiece] = useState<Piece | null>(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [storedConfig, setStoredConfig] = useState<StoredConfig | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [startTempo, setStartTempo] = useState('60');
  const [goalTempo, setGoalTempo] = useState('120');
  const [increment, setIncrement] = useState<Increment>(5);

  const [markers, setMarkers] = useState<Marker[]>([]);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPiece(id).then((p) => {
      if (cancelled) return;
      setPiece(p);
      if (p) setMarkers(parseMarkers(p.units_json));
    });
    getOrCreateExercise(id, 'click_up').then(async (ex) => {
      if (cancelled) return;
      setExerciseId(ex.id);
      try {
        const parsed = ex.config_json
          ? (JSON.parse(ex.config_json) as StoredConfig)
          : null;
        if (parsed && parsed.steps && parsed.steps.length > 0) {
          setStartTempo(String(parsed.startTempo));
          setGoalTempo(String(parsed.goalTempo));
          setIncrement(parsed.increment as Increment);
        }
      } catch {
        // ignore
      }
      const progress = await getClickUpProgress(ex.id);
      if (!cancelled && progress) {
        setCurrentIndex(progress.current_index);
      }
    });
    return () => {
      cancelled = true;
      metronome.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function placeMarker({ x, y }: { x: number; y: number }) {
    setMarkers((prev) => [...prev, { index: prev.length + 1, x, y }]);
  }

  function removeMarker(index: number) {
    setMarkers((prev) =>
      prev.filter((m) => m.index !== index).map((m, i) => ({ ...m, index: i + 1 })),
    );
  }

  function undoMarker() {
    setMarkers((prev) => prev.slice(0, -1));
  }

  function clearMarkers() {
    setMarkers([]);
  }

  async function commitMarkersAndConfigure() {
    if (!id) return;
    if (markers.length < MIN_MARKERS) return;
    await updatePieceUnits(id, markers);
    if (piece) setPiece({ ...piece, units_json: JSON.stringify(markers) });
    setPhase('config');
  }

  async function startPlaying() {
    if (!exerciseId || !id) return;
    const start = parseInt(startTempo, 10);
    const goal = parseInt(goalTempo, 10);
    if (!start || !goal || goal <= start) return;
    const N = markers.length - 1;
    if (N < 2) return;
    const steps = generateSteps(N, start, goal, increment);
    const config: StoredConfig = {
      N,
      startTempo: start,
      goalTempo: goal,
      increment,
      steps,
    };
    await updateExerciseConfig(exerciseId, JSON.stringify(config));
    await upsertClickUpProgress(exerciseId, 0);
    setStoredConfig(config);
    setCurrentIndex(0);
    const first = steps[0];
    if (first) metronome.setBpm(first.tempo);
    setPhase('playing');
  }

  async function onNext() {
    if (!storedConfig || !exerciseId) return;
    const nextIdx = currentIndex + 1;
    repCounterRef.current += 1;
    if (
      microbreak.config.enabled &&
      repCounterRef.current > 0 &&
      repCounterRef.current % 10 === 0
    ) {
      microbreak.trigger();
    }
    if (nextIdx >= storedConfig.steps.length) {
      metronome.stop();
      setCelebrating(true);
      return;
    }
    setCurrentIndex(nextIdx);
    metronome.setBpm(storedConfig.steps[nextIdx].tempo);
    await setClickUpIndex(exerciseId, nextIdx);
  }

  async function onPrev() {
    if (!storedConfig || !exerciseId) return;
    const prevIdx = Math.max(0, currentIndex - 1);
    if (prevIdx === currentIndex) return;
    setCurrentIndex(prevIdx);
    metronome.setBpm(storedConfig.steps[prevIdx].tempo);
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

  async function doneSession(annotation?: { mood: string | null; note: string | null }) {
    if (!id || !exerciseId) {
      router.back();
      return;
    }
    await setClickUpIndex(exerciseId, currentIndex);
    await stampLastUsed(id, 'click_up');
    const data: Record<string, unknown> = {
      step: currentIndex,
      totalSteps: storedConfig?.steps.length,
      tempo: metronome.bpm,
    };
    if (annotation?.mood) data.mood = annotation.mood;
    if (annotation?.note) data.note = annotation.note;
    await logPractice(id, 'click_up', data, exerciseId);
    metronome.stop();
    setCelebrating(false);
    router.back();
  }

  function goBackToMarking() {
    setPhase('marking');
  }

  return {
    phase,
    piece,
    markers,
    storedConfig,
    currentIndex,
    startTempo,
    goalTempo,
    increment,
    celebrating,
    metronome,
    setStartTempo,
    setGoalTempo,
    setIncrement,
    placeMarker,
    removeMarker,
    undoMarker,
    clearMarkers,
    commitMarkersAndConfigure,
    startPlaying,
    onNext,
    onPrev,
    exitSession,
    doneSession,
    dismissCelebration,
    goBackToMarking,
  };
}
