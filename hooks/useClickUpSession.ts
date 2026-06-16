import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import type { Increment } from '@/components/TempoConfigFields';
import {
  getClickUpProgress,
  setClickUpIndex,
  upsertClickUpProgress,
} from '@/lib/db/repos/clickUp';
import { getOrCreateExercise, updateExerciseConfig } from '@/lib/db/repos/exercises';
import {
  getPassage,
  parseMarkers,
  updatePassageUnits,
  type Marker,
  type Passage,
} from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { useMetronome } from '@/lib/audio/useMetronome';
import { generateSteps, type ClickUpStep } from '@/lib/strategies/clickUp';

export const MIN_MARKERS = 3;

export type ClickUpPhase = 'tempo' | 'example' | 'marking' | 'config' | 'playing';

export type StoredConfig = {
  N: number;
  startTempo: number;
  goalTempo: number;
  increment: number;
  steps: ClickUpStep[];
};

export function useClickUpSession(id: string | undefined, guided = false) {
  const router = useRouter();
  const metronome = useMetronome(60);
  const microbreak = useMicrobreakTimer();

  const [phase, setPhase] = useState<ClickUpPhase>(guided ? 'tempo' : 'marking');
  const [passage, setPassage] = useState<Passage | null>(null);
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
    getPassage(id).then((p) => {
      if (cancelled) return;
      setPassage(p);
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
    await updatePassageUnits(id, markers);
    if (passage) setPassage({ ...passage, units_json: JSON.stringify(markers) });
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
    if (nextIdx >= storedConfig.steps.length) {
      metronome.stop();
      setCelebrating(true);
      return;
    }
    // Phase boundary = the next step belongs to a different phase than the
    // current one. Use that as the microbreak cue — gives a real rest right
    // before the tempo resets and the active-units parameters change.
    // useMetronome's auto-pause snapshots the running state when the break
    // fires and resumes after; an explicit stop() here would shadow that
    // snapshot to false and the click would never come back.
    const crossingPhase =
      storedConfig.steps[currentIndex].phase !== storedConfig.steps[nextIdx].phase;
    if (crossingPhase && microbreak.config.enabled) {
      microbreak.trigger();
    }
    setCurrentIndex(nextIdx);
    // Interleaved Click-Up is the one place we surface the "↑ N" tempo-bump
    // animation on the metronome — advancing a step is the moment the user
    // is meant to notice the climb.
    metronome.setBpm(storedConfig.steps[nextIdx].tempo, { animateBump: true });
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
    await stampLastUsed(id, 'click_up');
    const data: Record<string, unknown> = {
      step: currentIndex,
      totalSteps: storedConfig?.steps.length,
      tempo: metronome.bpm,
    };
    if (annotation?.mood) data.mood = annotation.mood;
    if (annotation?.note) data.note = annotation.note;
    if (annotation?.remindNext) data.remindNext = true;
    await logPractice(id, 'click_up', data, exerciseId);
    metronome.stop();
    setCelebrating(false);
    router.back();
  }

  // Guided onboarding finish: log the session like doneSession, but land the
  // first-timer in their library (their new passage + freshly-logged session)
  // rather than router.back() into the murky replace-stack.
  async function finishGuidedToLibrary() {
    if (id && exerciseId) {
      await setClickUpIndex(exerciseId, currentIndex);
      await stampLastUsed(id, 'click_up');
      await logPractice(
        id,
        'click_up',
        {
          step: currentIndex,
          totalSteps: storedConfig?.steps.length,
          tempo: metronome.bpm,
        },
        exerciseId,
      );
    }
    metronome.stop();
    setCelebrating(false);
    router.replace('/(tabs)/library?welcome=1' as never);
  }

  function goBackToMarking() {
    setPhase('marking');
  }

  function goBackToTempo() {
    setPhase('tempo');
  }

  function goBackToExample() {
    setPhase('example');
  }

  // Return to the tempo-setup screen from inside a practice session. Stops
  // the metronome so the user isn't ticking against silence while they
  // adjust BPMs. `storedConfig` and `currentIndex` are preserved, so the
  // config screen can offer a Resume button that drops the user back into
  // the same step they left from.
  function goBackToConfig() {
    metronome.stop();
    setPhase('config');
  }

  // Resume practice from the step the user was last on, without
  // regenerating the step sequence. Used by the Resume button that appears
  // on the config screen when there's mid-session progress.
  function resumePlaying() {
    if (!storedConfig) return;
    const step = storedConfig.steps[currentIndex];
    if (step) metronome.setBpm(step.tempo);
    setPhase('playing');
  }

  // ── guided (onboarding) helpers ─────────────────────────────────────────
  // The quiz routes a brand-new user here with ?guided=1. Instead of the
  // normal marking → config(fields) → play, the guided flow is:
  //   tempo (one friendly slider) → marking (with the example image) → play.
  // Performance tempo is the only number we ask; start auto-sets to half and
  // the increment keeps its default, so there's no setup screen to face.
  function confirmPerformanceTempo() {
    const goal = parseInt(goalTempo, 10) || 120;
    setStartTempo(String(Math.max(30, Math.round(goal / 2))));
    setPhase('example');
  }

  function proceedToMarking() {
    setPhase('marking');
  }

  async function commitMarkersAndStart() {
    if (!id) return;
    if (markers.length < MIN_MARKERS) return;
    await updatePassageUnits(id, markers);
    if (passage) setPassage({ ...passage, units_json: JSON.stringify(markers) });
    await startPlaying();
    // Guided onboarding: start the click immediately so a first-timer on a
    // small phone just hears the tempo and plays along — no hunting for the
    // metronome's play button (which barely fits the screen). The tap on
    // "Start practicing" is the user gesture that unlocks audio on iOS.
    metronome.start();
  }

  return {
    phase,
    passage,
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
    goBackToConfig,
    resumePlaying,
    confirmPerformanceTempo,
    commitMarkersAndStart,
    goBackToTempo,
    proceedToMarking,
    goBackToExample,
    finishGuidedToLibrary,
  };
}
