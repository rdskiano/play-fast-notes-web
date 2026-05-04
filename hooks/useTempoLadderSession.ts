import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import { useMetronome } from '@/lib/audio/useMetronome';
import { getOrCreateExercise } from '@/lib/db/repos/exercises';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice, updatePracticeLogMoodNote } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import {
  advanceClusterWindow,
  getTempoLadder,
  updateTempoLadderState,
  upsertTempoLadder,
  type TempoLadderProgress,
} from '@/lib/db/repos/tempoLadder';

export type Mode = 'step' | 'cluster';
export type Increment = 2 | 5 | 10;
export type RepTarget = 5 | 10 | 20;
export const REP_TARGETS: RepTarget[] = [5, 10, 20];

export type Celebration = { reached: boolean } | null;

function pickRandom(low: number, high: number): number {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

export function useTempoLadderSession(id: string | undefined) {
  const router = useRouter();
  const metronome = useMetronome(60);
  const microbreak = useMicrobreakTimer();

  const [passage, setPassage] = useState<Passage | null>(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [progress, setProgress] = useState<TempoLadderProgress | null>(null);
  const [phase, setPhase] = useState<'config' | 'playing'>('config');
  const [celebrating, setCelebrating] = useState<Celebration>(null);
  const [completedSets, setCompletedSets] = useState(0);
  const lastHitLogIdRef = useRef<number | null>(null);

  const [mode, setMode] = useState<Mode>('step');
  const [startTempo, setStartTempo] = useState('60');
  const [goalTempo, setGoalTempo] = useState('120');
  const [clusterHigh, setClusterHigh] = useState('72');
  const [finalTempo, setFinalTempo] = useState('120');
  const [increment, setIncrement] = useState<Increment>(5);
  const [targetReps, setTargetReps] = useState<RepTarget>(5);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPassage(id).then((p) => {
      if (!cancelled) setPassage(p);
    });
    getOrCreateExercise(id, 'tempo_ladder').then(async (ex) => {
      if (cancelled) return;
      setExerciseId(ex.id);
      const existing = await getTempoLadder(ex.id);
      if (cancelled || !existing) return;
      setProgress(existing);
      setMode(existing.mode);
      if (existing.mode === 'cluster') {
        setStartTempo(String(existing.cluster_low ?? existing.start_tempo));
        setClusterHigh(String(existing.cluster_high ?? existing.start_tempo + 12));
        setFinalTempo(String(existing.goal_tempo));
      } else {
        setStartTempo(String(existing.start_tempo));
        setGoalTempo(String(existing.goal_tempo));
      }
      setIncrement((existing.increment ?? 5) as Increment);
      setTargetReps(existing.target_reps as RepTarget);
    });
    return () => {
      cancelled = true;
      metronome.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function setModeAndSyncCluster(next: Mode) {
    setMode(next);
    if (next === 'cluster') {
      const n = parseInt(startTempo, 10);
      if (!isNaN(n)) setClusterHigh(String(n + 10));
    }
  }

  function setStartWithClusterSync(v: string) {
    setStartTempo(v);
    if (mode === 'cluster') {
      const n = parseInt(v, 10);
      if (!isNaN(n)) setClusterHigh(String(n + 10));
    }
  }

  async function startSession() {
    if (!exerciseId || !id) return;
    lastHitLogIdRef.current = null;
    setCompletedSets(0);

    if (mode === 'step') {
      const start = parseInt(startTempo, 10);
      const goal = parseInt(goalTempo, 10);
      if (!start || !goal || goal <= start) return;
      const saved = await upsertTempoLadder({
        exercise_id: exerciseId,
        mode: 'step',
        start_tempo: start,
        goal_tempo: goal,
        increment,
        cluster_low: null,
        cluster_high: null,
        target_reps: targetReps,
      });
      await updateTempoLadderState(exerciseId, start, 0);
      setProgress({ ...saved, current_tempo: start, current_streak: 0 });
      metronome.setBpm(start);
      setPhase('playing');
      return;
    }

    const low = parseInt(startTempo, 10);
    const high = parseInt(clusterHigh, 10);
    const final = parseInt(finalTempo, 10);
    if (!low || !high || !final || high <= low || final < high) return;
    const saved = await upsertTempoLadder({
      exercise_id: exerciseId,
      mode: 'cluster',
      start_tempo: low,
      goal_tempo: final,
      increment,
      cluster_low: low,
      cluster_high: high,
      target_reps: targetReps,
    });
    const firstBpm = pickRandom(low, high);
    await advanceClusterWindow(exerciseId, low, high, firstBpm, 0);
    setProgress({
      ...saved,
      cluster_low: low,
      cluster_high: high,
      current_tempo: firstBpm,
      current_streak: 0,
    });
    metronome.setBpm(firstBpm);
    setPhase('playing');
  }

  async function onClean() {
    if (!progress || !exerciseId || !id) return;
    const nextStreak = progress.current_streak + 1;
    const hitTarget = nextStreak >= progress.target_reps;

    const isCadenceMark = nextStreak % 3 === 0;
    const willBreak = microbreak.config.enabled && isCadenceMark && !hitTarget;
    if (willBreak) microbreak.trigger();

    if (hitTarget) {
      setCompletedSets((n) => n + 1);
      const reached =
        progress.mode === 'cluster'
          ? (progress.cluster_high ?? progress.goal_tempo) >= progress.goal_tempo
          : progress.current_tempo >= progress.goal_tempo;
      setProgress({ ...progress, current_streak: nextStreak });
      await updateTempoLadderState(exerciseId, progress.current_tempo, nextStreak);
      await stampLastUsed(id, 'tempo_ladder');
      const hitLogId = await logPractice(
        id,
        'tempo_ladder',
        {
          tempo: progress.current_tempo,
          goalTempo: progress.goal_tempo,
          mode: progress.mode,
        },
        exerciseId,
      );
      lastHitLogIdRef.current = hitLogId;
      metronome.stop();
      setCelebrating({ reached });
      return;
    }

    if (progress.mode === 'cluster') {
      const lo = progress.cluster_low ?? progress.start_tempo;
      const hi = progress.cluster_high ?? progress.goal_tempo;
      const nextTempo = pickRandom(lo, hi);
      setProgress({ ...progress, current_tempo: nextTempo, current_streak: nextStreak });
      metronome.setBpm(nextTempo);
      await updateTempoLadderState(exerciseId, nextTempo, nextStreak);
      await stampLastUsed(id, 'tempo_ladder');
      return;
    }

    setProgress({ ...progress, current_streak: nextStreak });
    await updateTempoLadderState(exerciseId, progress.current_tempo, nextStreak);
  }

  async function onMiss() {
    if (!progress || !exerciseId) return;
    setProgress({ ...progress, current_streak: 0 });
    await updateTempoLadderState(exerciseId, progress.current_tempo, 0);
  }

  async function advanceAfterCelebration() {
    if (!progress || !exerciseId) {
      setCelebrating(null);
      return;
    }
    if (progress.mode === 'cluster') {
      const lo = progress.cluster_low ?? progress.start_tempo;
      const hi = progress.cluster_high ?? progress.goal_tempo;
      const inc = progress.increment ?? 5;
      const spread = hi - lo;
      const newHi = Math.min(progress.goal_tempo, hi + inc);
      const newLo = Math.max(progress.start_tempo, newHi - spread);
      const nextTempo = pickRandom(newLo, newHi);
      setProgress({
        ...progress,
        cluster_low: newLo,
        cluster_high: newHi,
        current_tempo: nextTempo,
        current_streak: 0,
      });
      metronome.setBpm(nextTempo);
      await advanceClusterWindow(exerciseId, newLo, newHi, nextTempo, 0);
    } else {
      const nextTempo = Math.min(
        progress.goal_tempo,
        progress.current_tempo + (progress.increment ?? 5),
      );
      setProgress({ ...progress, current_tempo: nextTempo, current_streak: 0 });
      metronome.setBpm(nextTempo);
      await updateTempoLadderState(exerciseId, nextTempo, 0);
    }
    setCelebrating(null);
    metronome.start();
  }

  function dismissCelebration() {
    if (progress) setProgress({ ...progress, current_streak: 0 });
    setCelebrating(null);
  }

  async function endSession(annotation?: { mood: string | null; note: string | null }) {
    if (!exerciseId || !id) {
      router.back();
      return;
    }
    const bpm = metronome.bpm;
    await updateTempoLadderState(exerciseId, bpm, progress?.current_streak ?? 0);
    if (completedSets > 0) {
      await stampLastUsed(id, 'tempo_ladder');
      const hitLogId = lastHitLogIdRef.current;
      if (hitLogId !== null) {
        if (annotation && (annotation.mood || annotation.note)) {
          await updatePracticeLogMoodNote(hitLogId, {
            mood: annotation.mood ?? null,
            note: annotation.note ?? null,
          });
        }
      } else {
        const data: Record<string, unknown> = {
          tempo: bpm,
          goalTempo: progress?.goal_tempo,
          mode: progress?.mode,
          completedSets,
        };
        if (annotation?.mood) data.mood = annotation.mood;
        if (annotation?.note) data.note = annotation.note;
        await logPractice(id, 'tempo_ladder', data, exerciseId);
      }
    }
    metronome.stop();
    router.back();
  }

  return {
    phase,
    passage,
    progress,
    celebrating,
    mode,
    startTempo,
    goalTempo,
    clusterHigh,
    finalTempo,
    increment,
    targetReps,
    metronome,
    completedSets,
    setMode: setModeAndSyncCluster,
    setStartTempo: setStartWithClusterSync,
    setGoalTempo,
    setClusterHigh,
    setFinalTempo,
    setIncrement,
    setTargetReps,
    startSession,
    onClean,
    onMiss,
    advanceAfterCelebration,
    dismissCelebration,
    endSession,
  };
}
