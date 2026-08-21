import { useRouter } from 'expo-router';
import { returnToScoreAfterSession } from '@/lib/sessions/lastPassageInDoc';
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
  getPassage,
  parseMarkers,
  updatePassagePerformanceTempo,
  updatePassageUnits,
  type Marker,
  type Passage,
} from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { useMetronome } from '@/lib/audio/useMetronome';
import {
  generateSteps,
  type ClickUpDirection,
  type ClickUpStep,
} from '@/lib/strategies/clickUp';

export const MIN_MARKERS = 3;

export type ClickUpPhase = 'tempo' | 'example' | 'marking' | 'config' | 'playing';

export type StoredConfig = {
  N: number;
  startTempo: number;
  goalTempo: number;
  increment: number;
  steps: ClickUpStep[];
  // Build direction (beta). Absent on configs saved before 2026-08-21 —
  // treat missing as 'forward'.
  direction?: ClickUpDirection;
};

export function useClickUpSession(
  id: string | undefined,
  guided = false,
  // One-shot setup nudge from a resurfaced reminder's "slower start" button:
  // start tempo × startScale, rounded to a friendly number (nearest 5,
  // floored at 30). Applied AFTER the saved-config prefill, like a hand edit.
  overrides?: { startScale?: number },
) {
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
  const [direction, setDirection] = useState<ClickUpDirection>('forward');

  const [markers, setMarkers] = useState<Marker[]>([]);
  const [celebrating, setCelebrating] = useState(false);
  // Completion choice: "try it in the other direction, or finish & log?"
  // Shown when the last step is reached (non-guided sessions only).
  const [reverseOffer, setReverseOffer] = useState(false);
  // Full climbs completed this sitting, with the direction of each — a
  // forward pass followed by a reverse pass logs as one session, passes: 2.
  const completedPassesRef = useRef(0);
  const passDirectionsRef = useRef<ClickUpDirection[]>([]);

  // Applied once after the config prefill; the ref keeps the load effect
  // from re-running (and re-shrinking) when the caller re-renders.
  const overridesRef = useRef(overrides);
  const overridesAppliedRef = useRef(false);
  function applyOverrides() {
    const o = overridesRef.current;
    if (!o || overridesAppliedRef.current) return;
    overridesAppliedRef.current = true;
    if (o.startScale && o.startScale > 0 && o.startScale < 1) {
      setStartTempo((cur) => {
        const bpm = parseInt(cur, 10);
        if (!Number.isFinite(bpm)) return cur;
        return String(Math.max(30, Math.round((bpm * o.startScale!) / 5) * 5));
      });
    }
  }

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
          setDirection(parsed.direction ?? 'forward');
        } else {
          // First Click-Up on this piece — prefill the goal from the piece's
          // shared performance tempo (B-013) if another strategy set one.
          // Fill-in only: a saved Click-Up config (above) always wins.
          const p = await getPassage(id);
          if (!cancelled && p?.performance_tempo) {
            setGoalTempo(String(p.performance_tempo));
            setStartTempo(String(Math.max(30, Math.round(p.performance_tempo / 2))));
          }
        }
      } catch {
        // ignore
      }
      const progress = await getClickUpProgress(ex.id);
      if (!cancelled && progress) {
        setCurrentIndex(progress.current_index);
      }
      // After the prefill settles, let a reminder button's overrides nudge
      // the setup — same as a hand adjustment.
      if (!cancelled) applyOverrides();
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

  // Canonical fingerprint of a mark set — position-order comparison that
  // ignores JSON key ordering, so equality means "the same marks".
  function markerSignature(ms: Marker[]): string {
    return ms.map((m) => `${m.index}:${m.x}:${m.y}`).join('|');
  }

  async function commitMarkersAndConfigure() {
    if (!id) return;
    if (markers.length < MIN_MARKERS) return;
    // Changed marks invalidate any mid-session progress. The step sequence
    // is generated FROM the marks, so resuming an old session against a new
    // mark set played a ghost sequence with wrong totals (hit live
    // 2026-08-18: re-marked mid-session, resumed at "2 of 56", units lit up
    // in an order that matched neither mark set). Reset to Step 1 and drop
    // the stored sequence; the config screen then offers a clean
    // "Start practicing" instead of Resume. Returning from the marking
    // screen with the marks untouched keeps Resume available — that path
    // is really "I just went back to look".
    const changed =
      markerSignature(markers) !==
      markerSignature(parseMarkers(passage?.units_json ?? null));
    if (changed) {
      setStoredConfig(null);
      setCurrentIndex(0);
      if (exerciseId) await upsertClickUpProgress(exerciseId, 0);
    }
    await updatePassageUnits(id, markers);
    if (passage) setPassage({ ...passage, units_json: JSON.stringify(markers) });
    setPhase('config');
  }

  async function startPlaying() {
    if (!exerciseId || !id) return;
    const start = parseInt(startTempo, 10);
    const goal = parseInt(goalTempo, 10);
    if (!start || !goal || goal <= start) return;
    // B-013: remember the goal on the piece so other strategies prefill it.
    // Best-effort — a failed write never blocks starting the session.
    updatePassagePerformanceTempo(id, goal).catch((e) =>
      console.warn('[clickUp] performance-tempo share failed:', e),
    );
    const N = markers.length - 1;
    if (N < 2) return;
    const steps = generateSteps(N, start, goal, increment);
    const config: StoredConfig = {
      N,
      startTempo: start,
      goalTempo: goal,
      increment,
      steps,
      direction,
    };
    await updateExerciseConfig(exerciseId, JSON.stringify(config));
    await upsertClickUpProgress(exerciseId, 0);
    setStoredConfig(config);
    setCurrentIndex(0);
    completedPassesRef.current = 0;
    passDirectionsRef.current = [];
    const first = steps[0];
    if (first) metronome.setBpm(first.tempo);
    setPhase('playing');
    // Start the click immediately — the session is now running, so the user
    // hears the first step's tempo without hunting for the metronome's play
    // button. The "Start practicing" tap is the user gesture that unlocks
    // audio on iOS.
    metronome.start();
  }

  async function onNext() {
    if (!storedConfig || !exerciseId) return;
    const nextIdx = currentIndex + 1;
    if (nextIdx >= storedConfig.steps.length) {
      metronome.stop();
      // Guided onboarding keeps its simple celebration; everyone else gets
      // the choice: run the same climb in the other direction, or log.
      // (The pass itself is counted when the user resolves the choice —
      // counting here would double-count if they dismiss and re-reach the
      // last step.)
      if (guided) setCelebrating(true);
      else setReverseOffer(true);
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

  // Completion offer: run the SAME climb again built from the other end.
  // The step sequence is direction-agnostic (units are build-order numbers);
  // only the unit→score mapping flips, so the stored steps are reused as-is.
  async function acceptReversePass() {
    if (!storedConfig || !exerciseId) return;
    completedPassesRef.current += 1;
    passDirectionsRef.current.push(storedConfig.direction ?? 'forward');
    const flipped: ClickUpDirection =
      (storedConfig.direction ?? 'forward') === 'forward' ? 'backward' : 'forward';
    const config: StoredConfig = { ...storedConfig, direction: flipped };
    setReverseOffer(false);
    setStoredConfig(config);
    setDirection(flipped);
    setCurrentIndex(0);
    await updateExerciseConfig(exerciseId, JSON.stringify(config));
    await upsertClickUpProgress(exerciseId, 0);
    const first = config.steps[0];
    if (first) metronome.setBpm(first.tempo);
    metronome.start();
  }

  function declineReverseAndLog() {
    if (storedConfig) {
      completedPassesRef.current += 1;
      passDirectionsRef.current.push(storedConfig.direction ?? 'forward');
    }
    setReverseOffer(false);
    setCelebrating(true);
  }

  // "Not yet": close the offer and stay on the final step — the user can
  // ← BACK to retake tempos, or tap NEXT to see the offer again. Counts
  // nothing, so re-reaching the last step can't double-count the pass.
  function dismissReverseOffer() {
    setReverseOffer(false);
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
    if ((storedConfig?.direction ?? 'forward') === 'backward') data.direction = 'backward';
    if (completedPassesRef.current > 0) data.passes = completedPassesRef.current;
    if (passDirectionsRef.current.length > 1) {
      data.directions = [...passDirectionsRef.current];
    }
    if (annotation?.mood) data.mood = annotation.mood;
    if (annotation?.note) data.note = annotation.note;
    if (annotation?.remindNext) data.remindNext = true;
    await logPractice(id, 'click_up', data, exerciseId);
    metronome.stop();
    setCelebrating(false);
    // A logged session lands back on the score page, not the passage hub.
    returnToScoreAfterSession(router, passage);
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
    // Resuming a session = the click should be running again right away.
    metronome.start();
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
    // startPlaying() now starts the click itself (the session begins running
    // immediately), so a first-timer on a small phone just hears the tempo
    // and plays along — no hunting for the metronome's play button.
    await startPlaying();
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
    direction,
    celebrating,
    reverseOffer,
    metronome,
    setStartTempo,
    setGoalTempo,
    setIncrement,
    setDirection,
    acceptReversePass,
    declineReverseAndLog,
    dismissReverseOffer,
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
