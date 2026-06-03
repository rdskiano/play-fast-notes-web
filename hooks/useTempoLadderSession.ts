import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import { useMetronome } from '@/lib/audio/useMetronome';
import { getOrCreateExercise } from '@/lib/db/repos/exercises';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import {
  advanceClusterWindow,
  getTempoLadder,
  updateCustomPosition,
  updateTempoLadderConfigBounds,
  updateTempoLadderState,
  upsertTempoLadder,
  type TempoLadderProgress,
} from '@/lib/db/repos/tempoLadder';
import {
  expandPatternToReps,
  resolveBlockBpm,
  totalRepsInPattern,
  type CustomPattern,
} from '@/lib/strategies/customPatterns';
import {
  getCustomPattern,
  listCustomPatterns,
} from '@/lib/supabase/customPatterns';

// Bump the ladder floor by this many BPM after a session that reached goal.
// Deprecated: kept for one revision for any external import. The bump now
// uses the user's chosen increment (progress.increment) — see durableBase /
// endSession.
const SUCCESS_BUMP_BPM = 5;

export type Mode = 'step' | 'cluster' | 'custom';
export type Increment = 2 | 5 | 10;
export type RepTarget = 5 | 10 | 20;
export const REP_TARGETS: RepTarget[] = [5, 10, 20];

export type Celebration = { reached: boolean } | null;

function pickRandom(low: number, high: number): number {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

// The user's real "ladder position" — what the library's tempo-ladder %
// should reflect. In cluster mode this is the window floor (cluster_low),
// NOT the live random pick; in custom mode it's the climbing base; in step
// mode the live metronome BPM IS the rung. This is the single place that
// encodes that distinction; use it for every persisted write.
function durableBase(
  mode: Mode,
  metronomeBpm: number,
  progress: TempoLadderProgress | null,
  customBase: number,
): number {
  if (!progress) return metronomeBpm;
  if (mode === 'cluster') return progress.cluster_low ?? progress.start_tempo;
  if (mode === 'custom') return customBase;
  return metronomeBpm; // step
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
  const lastHitTempoRef = useRef<number | null>(null);
  // True once the user has reached goal at any point this session. Drives
  // the start-tempo bump on endSession.
  const reachedGoalRef = useRef(false);
  // True when the user has completed a clean set whose step-up they haven't
  // consumed yet (they saw the celebration but haven't tapped "Step up").
  // Ending the session in this state banks the advance — completing the set
  // IS the success criterion, so the next session resumes one rung higher.
  // Cleared the moment a step-up is taken live (advanceAfterCelebration) or a
  // new set begins (startSession / onMiss).
  const earnedStepUpRef = useRef(false);

  const [mode, setMode] = useState<Mode>('step');
  const [startTempo, setStartTempo] = useState('60');
  const [goalTempo, setGoalTempo] = useState('120');
  const [clusterHigh, setClusterHigh] = useState('72');
  const [finalTempo, setFinalTempo] = useState('120');
  const [increment, setIncrement] = useState<Increment>(5);
  const [targetReps, setTargetReps] = useState<RepTarget>(5);

  // Custom-mode state. customPatterns is the per-user library fetched on
  // mount; customPatternId is which pattern is selected for THIS exercise;
  // customPattern is the resolved object. Block/rep position lives both
  // here (live) and in the progress row (persisted) so the user can resume
  // mid-set across page reloads.
  const [customPatterns, setCustomPatterns] = useState<CustomPattern[]>([]);
  const [customPatternId, setCustomPatternId] = useState<string | null>(null);
  const [customPattern, setCustomPattern] = useState<CustomPattern | null>(null);
  const [customBlockIndex, setCustomBlockIndex] = useState(0);
  const [customRepInBlock, setCustomRepInBlock] = useState(0);
  const [customBase, setCustomBase] = useState(60);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPassage(id).then((p) => {
      if (!cancelled) setPassage(p);
    });
    // Per-user Custom pattern library — fetched eagerly so the mode picker
    // can render saved patterns alongside Step / Cluster. Catch errors
    // quietly: a network blip just means the user sees no saved patterns
    // until they reload (still strictly better than blocking the screen).
    listCustomPatterns()
      .then((patterns) => {
        if (!cancelled) setCustomPatterns(patterns);
      })
      .catch((e) => {
        console.warn('[tempoLadder] listCustomPatterns failed:', e);
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
      } else if (existing.mode === 'custom') {
        // For Custom mode, current_tempo represents the live BASE tempo (the
        // value that climbs by increment per clean set), and the block/rep
        // indices hold the within-set position. The pattern itself is
        // fetched separately by id.
        const effectiveBase =
          existing.current_tempo >= existing.goal_tempo
            ? existing.start_tempo
            : Math.max(existing.start_tempo, existing.current_tempo);
        setStartTempo(String(effectiveBase));
        setGoalTempo(String(existing.goal_tempo));
        setCustomBase(effectiveBase);
        setCustomBlockIndex(existing.custom_block_index ?? 0);
        setCustomRepInBlock(existing.custom_rep_in_block ?? 0);
        if (existing.custom_pattern_id) {
          setCustomPatternId(existing.custom_pattern_id);
          getCustomPattern(existing.custom_pattern_id)
            .then((p) => {
              if (cancelled) return;
              if (p) setCustomPattern(p);
              else {
                // Pattern was deleted from the library since last session.
                // Fall back to step mode so the user isn't stranded.
                setCustomPatternId(null);
                setMode('step');
              }
            })
            .catch((e) => console.warn('[tempoLadder] getCustomPattern failed:', e));
        }
      } else {
        // Resume from the highest tempo the user climbed to last session.
        // start_tempo only bumps when goal is reached (SUCCESS_BUMP_BPM); if
        // they advanced mid-ladder and ended, current_tempo holds the real
        // progress. Goal-reach case keeps the bumped start_tempo (current is
        // already at goal so we'd lose climbing room).
        const effectiveStart =
          existing.current_tempo >= existing.goal_tempo
            ? existing.start_tempo
            : Math.max(existing.start_tempo, existing.current_tempo);
        setStartTempo(String(effectiveStart));
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

  // Re-fetch the pattern library — called after the editor saves / deletes
  // so the mode picker stays in sync without a screen reload.
  async function reloadCustomPatterns(): Promise<CustomPattern[]> {
    try {
      const ps = await listCustomPatterns();
      setCustomPatterns(ps);
      return ps;
    } catch (e) {
      console.warn('[tempoLadder] reloadCustomPatterns failed:', e);
      return customPatterns;
    }
  }

  // Pick (or unpick) a Custom pattern as the active mode. The pattern is
  // fetched-by-id so we always have the freshest blocks even if the list
  // is stale.
  async function selectCustomPattern(patternId: string | null) {
    if (patternId === null) {
      setCustomPatternId(null);
      setCustomPattern(null);
      return;
    }
    setCustomPatternId(patternId);
    const local = customPatterns.find((p) => p.id === patternId);
    if (local) setCustomPattern(local);
    try {
      const fresh = await getCustomPattern(patternId);
      if (fresh) setCustomPattern(fresh);
    } catch (e) {
      console.warn('[tempoLadder] getCustomPattern failed:', e);
    }
  }

  async function startSession() {
    if (!exerciseId || !id) return;
    lastHitTempoRef.current = null;
    reachedGoalRef.current = false;
    earnedStepUpRef.current = false;
    setCompletedSets(0);

    if (mode === 'custom') {
      if (!customPattern || !customPatternId) return;
      const base = parseInt(startTempo, 10);
      const goal = parseInt(goalTempo, 10);
      if (!base || !goal || goal <= base) return;
      const saved = await upsertTempoLadder({
        exercise_id: exerciseId,
        mode: 'custom',
        start_tempo: base,
        goal_tempo: goal,
        increment,
        cluster_low: null,
        cluster_high: null,
        target_reps: targetReps,
        custom_pattern_id: customPatternId,
        custom_block_index: 0,
        custom_rep_in_block: 0,
      });
      await updateCustomPosition(exerciseId, base, 0, 0);
      setCustomBase(base);
      setCustomBlockIndex(0);
      setCustomRepInBlock(0);
      setProgress({
        ...saved,
        current_tempo: base,
        current_streak: 0,
        custom_block_index: 0,
        custom_rep_in_block: 0,
      });
      const firstBlock = customPattern.blocks[0];
      const firstBpm = resolveBlockBpm(firstBlock.tempo, base, goal);
      metronome.setBpm(firstBpm);
      setPhase('playing');
      return;
    }

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

    // ── Custom mode ──────────────────────────────────────────────────
    // One full execution of the pattern with no misses = one clean set,
    // which bumps the base by Increment. Position is (blockIndex,
    // repInBlock); we advance through the blocks sequentially.
    if (progress.mode === 'custom' && customPattern) {
      const currentBlock = customPattern.blocks[customBlockIndex];
      const nextRepInBlock = customRepInBlock + 1;
      if (nextRepInBlock < currentBlock.count) {
        // Still inside the current block — same tempo, next rep.
        setCustomRepInBlock(nextRepInBlock);
        await updateCustomPosition(exerciseId, customBase, customBlockIndex, nextRepInBlock);
        return;
      }
      // Block done. Move to the next block.
      const nextBlockIndex = customBlockIndex + 1;
      if (nextBlockIndex < customPattern.blocks.length) {
        const nextBlock = customPattern.blocks[nextBlockIndex];
        const nextBpm = resolveBlockBpm(nextBlock.tempo, customBase, progress.goal_tempo);
        setCustomBlockIndex(nextBlockIndex);
        setCustomRepInBlock(0);
        metronome.setBpm(nextBpm);
        await updateCustomPosition(exerciseId, customBase, nextBlockIndex, 0);
        return;
      }
      // All blocks done → completed pattern cleanly. Trigger celebration
      // and let advanceAfterCelebration bump the base.
      setCompletedSets((n) => n + 1);
      earnedStepUpRef.current = true;
      lastHitTempoRef.current = customBase;
      const newBase = Math.min(progress.goal_tempo, customBase + (progress.increment ?? 5));
      const reached = newBase >= progress.goal_tempo;
      if (reached) reachedGoalRef.current = true;
      // Persist the position pre-bump so a reload mid-celebration restores
      // the user at the END of the just-completed pattern. The actual
      // bump-and-reset happens in advanceAfterCelebration.
      await updateCustomPosition(
        exerciseId,
        customBase,
        customPattern.blocks.length - 1,
        currentBlock.count - 1,
      );
      metronome.stop();
      // Fill the final dot. CustomPatternDots paints dots where
      // i < customPosition, and customPosition = (reps in earlier blocks) +
      // customRepInBlock. Advancing rep-in-block one past the last rep makes
      // customPosition equal the total rep count, so every dot reads filled —
      // the same "all green" moment the standard streak row gives. (The
      // persisted position above stays at the last real rep so a
      // mid-celebration reload resumes correctly; this only moves the live
      // on-screen strip, which is torn down when the user steps up or ends.)
      setCustomRepInBlock(currentBlock.count);
      // Give the user a beat (~350 ms) to see the final dot fill before the
      // celebration modal mounts. setCelebrating on the next tick lets React
      // commit the position update first.
      setTimeout(() => setCelebrating({ reached }), 350);
      return;
    }

    const nextStreak = progress.current_streak + 1;
    const hitTarget = nextStreak >= progress.target_reps;

    const isCadenceMark = nextStreak % 3 === 0;
    const willBreak = microbreak.config.enabled && isCadenceMark && !hitTarget;
    if (willBreak) microbreak.trigger();

    if (hitTarget) {
      setCompletedSets((n) => n + 1);
      earnedStepUpRef.current = true;
      lastHitTempoRef.current = progress.current_tempo;
      const reached =
        progress.mode === 'cluster'
          ? (progress.cluster_high ?? progress.goal_tempo) >= progress.goal_tempo
          : progress.current_tempo >= progress.goal_tempo;
      if (reached) reachedGoalRef.current = true;
      setProgress({ ...progress, current_streak: nextStreak });
      const base = durableBase(progress.mode, progress.current_tempo, progress, customBase);
      await updateTempoLadderState(exerciseId, base, nextStreak);
      metronome.stop();
      // Give the user a beat (~350 ms) to see the final dot fill before the
      // celebration modal mounts. setCelebrating on the next tick lets React
      // commit the streak update first.
      setTimeout(() => setCelebrating({ reached }), 350);
      return;
    }

    if (progress.mode === 'cluster') {
      const lo = progress.cluster_low ?? progress.start_tempo;
      const hi = progress.cluster_high ?? progress.goal_tempo;
      const nextTempo = pickRandom(lo, hi);
      setProgress({ ...progress, current_tempo: nextTempo, current_streak: nextStreak });
      metronome.setBpm(nextTempo);
      // Persist the durable base (window floor), not the live random pick, so
      // the library % doesn't bounce with each rep. The React state + audio
      // above still track the live pick.
      await updateTempoLadderState(exerciseId, lo, nextStreak);
      await stampLastUsed(id, 'tempo_ladder');
      return;
    }

    setProgress({ ...progress, current_streak: nextStreak });
    await updateTempoLadderState(exerciseId, progress.current_tempo, nextStreak);
  }

  async function onMiss() {
    if (!progress || !exerciseId) return;
    // A miss starts a fresh attempt, so any unbanked completed-set advance is
    // no longer owed.
    earnedStepUpRef.current = false;
    // Custom mode: strict miss — reset position to (block 0, rep 0)
    // immediately. The base tempo stays unchanged; the metronome jumps
    // back to block 0's tempo so the user can start the pattern over.
    if (progress.mode === 'custom' && customPattern) {
      const firstBlock = customPattern.blocks[0];
      const firstBpm = resolveBlockBpm(firstBlock.tempo, customBase, progress.goal_tempo);
      setCustomBlockIndex(0);
      setCustomRepInBlock(0);
      metronome.setBpm(firstBpm);
      await updateCustomPosition(exerciseId, customBase, 0, 0);
      return;
    }
    setProgress({ ...progress, current_streak: 0 });
    const base = durableBase(progress.mode, progress.current_tempo, progress, customBase);
    await updateTempoLadderState(exerciseId, base, 0);
  }

  async function advanceAfterCelebration() {
    if (!progress || !exerciseId) {
      setCelebrating(null);
      return;
    }
    // The step-up is being taken live, so it's no longer owed at endSession —
    // current_tempo (and the cluster window / custom base) advances right here.
    earnedStepUpRef.current = false;
    if (progress.mode === 'custom' && customPattern) {
      const newBase = Math.min(
        progress.goal_tempo,
        customBase + (progress.increment ?? 5),
      );
      const firstBlock = customPattern.blocks[0];
      const firstBpm = resolveBlockBpm(firstBlock.tempo, newBase, progress.goal_tempo);
      setCustomBase(newBase);
      setCustomBlockIndex(0);
      setCustomRepInBlock(0);
      setProgress({
        ...progress,
        current_tempo: newBase,
        custom_block_index: 0,
        custom_rep_in_block: 0,
      });
      metronome.setBpm(firstBpm);
      await updateCustomPosition(exerciseId, newBase, 0, 0);
      setCelebrating(null);
      metronome.start();
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
      // Persist the new window floor (newLo) as current_tempo, not the random
      // pick, so the library % reflects the durable ladder position.
      await advanceClusterWindow(exerciseId, newLo, newHi, newLo, 0);
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

  async function endSession(annotation?: {
    mood: string | null;
    note: string | null;
    remindNext?: boolean;
  }) {
    if (!exerciseId || !id) {
      router.back();
      return;
    }
    const bpm = metronome.bpm;
    const inc = progress?.increment ?? 5;
    // Persist where the NEXT session should resume. Completing a clean set
    // earns a step-up; if the user ends without taking it live ("Step up
    // tempo"), bank it here so the ladder still advances by one increment —
    // completing the set IS the success criterion (see earnedStepUpRef).
    // Otherwise persist the durable current position unchanged.
    if (progress && earnedStepUpRef.current && progress.mode === 'custom') {
      const newBase = Math.min(progress.goal_tempo, customBase + inc);
      await updateCustomPosition(exerciseId, newBase, 0, 0);
    } else if (progress && earnedStepUpRef.current && progress.mode === 'cluster') {
      const lo = progress.cluster_low ?? progress.start_tempo;
      const hi = progress.cluster_high ?? progress.goal_tempo;
      const spread = hi - lo;
      const newHi = Math.min(progress.goal_tempo, hi + inc);
      const newLo = Math.max(progress.start_tempo, newHi - spread);
      await advanceClusterWindow(exerciseId, newLo, newHi, newLo, 0);
    } else if (progress && earnedStepUpRef.current) {
      const next = Math.min(progress.goal_tempo, progress.current_tempo + inc);
      await updateTempoLadderState(exerciseId, next, 0);
    } else {
      const base = durableBase(progress?.mode ?? 'step', bpm, progress, customBase);
      await updateTempoLadderState(exerciseId, base, progress?.current_streak ?? 0);
    }
    if (completedSets > 0) {
      await stampLastUsed(id, 'tempo_ladder');
      const data: Record<string, unknown> = {
        tempo: lastHitTempoRef.current ?? bpm,
        goalTempo: progress?.goal_tempo,
        mode: progress?.mode,
        completedSets,
      };
      // Capture which Custom pattern was practiced so the practice log can
      // render "Tempo Ladder · My 9+1" rather than just "Tempo Ladder".
      if (progress?.mode === 'custom' && customPattern) {
        data.patternId = customPattern.id;
        data.patternName = customPattern.name;
        data.patternReps = totalRepsInPattern(customPattern);
      }
      if (annotation?.mood) data.mood = annotation.mood;
      if (annotation?.note) data.note = annotation.note;
      if (annotation?.remindNext) data.remindNext = true;
      await logPractice(id, 'tempo_ladder', data, exerciseId);
    }

    // If the user reached the goal this session, raise the ladder floor so
    // the next session loads pre-set one increment higher. Clamp so there is
    // always room between start and goal.
    if (reachedGoalRef.current && progress) {
      const bump = progress.increment ?? 5;
      const maxStart = progress.goal_tempo - bump;
      const newStart = Math.min(progress.start_tempo + bump, maxStart);
      const fields: { start_tempo?: number; cluster_low?: number } = {};
      if (newStart > progress.start_tempo) fields.start_tempo = newStart;
      // Skip the cluster_low floor-raise when an earned step-up already slid
      // the window above (it set cluster_low to the new floor) — otherwise the
      // two writes fight over the same column.
      if (progress.mode === 'cluster' && !earnedStepUpRef.current) {
        const oldLow = progress.cluster_low ?? progress.start_tempo;
        const maxLow = (progress.cluster_high ?? progress.goal_tempo) - bump;
        const newLow = Math.min(oldLow + bump, maxLow);
        if (newLow > oldLow) fields.cluster_low = newLow;
      }
      if (fields.start_tempo !== undefined || fields.cluster_low !== undefined) {
        await updateTempoLadderConfigBounds(exerciseId, fields);
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
    // Custom mode
    customPatterns,
    customPatternId,
    customPattern,
    customBlockIndex,
    customRepInBlock,
    customBase,
    setMode: setModeAndSyncCluster,
    setStartTempo: setStartWithClusterSync,
    setGoalTempo,
    setClusterHigh,
    setFinalTempo,
    setIncrement,
    setTargetReps,
    selectCustomPattern,
    reloadCustomPatterns,
    startSession,
    onClean,
    onMiss,
    advanceAfterCelebration,
    dismissCelebration,
    endSession,
  };
}
