import { useRouter } from 'expo-router';
import { returnToScoreAfterSession } from '@/lib/sessions/lastPassageInDoc';
import { useEffect, useRef, useState } from 'react';

import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import { useMetronome } from '@/lib/audio/useMetronome';
import { getOrCreateExercise } from '@/lib/db/repos/exercises';
import {
  getPassage,
  updatePassagePerformanceTempo,
  type Passage,
} from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import {
  advanceClusterWindow,
  deleteTempoLadderProgress,
  getLatestSiblingLadderConfig,
  getTempoLadder,
  updateCustomPosition,
  updateTempoLadderConfigBounds,
  updateTempoLadderState,
  upsertTempoLadder,
  type TempoLadderConfig,
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

export function useTempoLadderSession(
  id: string | undefined,
  // Tools-mode: run with no piece attached. We still load the user's saved
  // Custom-pattern library (it lives on their account, not a piece), but skip
  // every passage-keyed DB read/write — no exercise row, no progress
  // persistence, no practice-log entry. The ladder mechanics are identical;
  // they just run off in-memory state for the session and vanish on exit.
  toolsOnly: boolean = false,
  // Guided onboarding: the quiz routes a brand-new user here with ?guided=1.
  // Instead of the full setup form, the flow is one performance-tempo question
  // → a short "here's the plan" screen → play (step mode, start auto-set to
  // half, default increment/reps). Completing one clean set ends the guided
  // session and lands them in their library. See the guided helpers below.
  guided: boolean = false,
  // One-shot setup nudges from a resurfaced reminder's action buttons —
  // applied AFTER the normal prefill so they override it, exactly as if the
  // user had adjusted the setup form by hand. Nothing persists until the
  // session actually starts.
  overrides?: {
    mode?: 'cluster';
    // e.g. 0.9 = "start slower next time": start tempo × 0.9, rounded to a
    // friendly number (nearest 5, floored at 30).
    startScale?: number;
    increment?: Increment;
    // An absolute start BPM — the first-practice evaluation hands off with
    // start = the player's proven clean tempo minus a comfort buffer. Wins
    // over startScale when both are present.
    startBpm?: number;
  },
) {
  const router = useRouter();
  const metronome = useMetronome(60);
  const microbreak = useMicrobreakTimer();

  const [passage, setPassage] = useState<Passage | null>(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [progress, setProgress] = useState<TempoLadderProgress | null>(null);
  const [phase, setPhase] = useState<'tempo' | 'ready' | 'config' | 'playing'>(
    guided ? 'tempo' : 'config',
  );
  const [celebrating, setCelebrating] = useState<Celebration>(null);
  const [completedSets, setCompletedSets] = useState(0);
  // Cumulative misses this session — coach-internal signal (clean-rate), never
  // rendered in the practice log. Logged into data_json on finish.
  const [misses, setMisses] = useState(0);
  const lastHitTempoRef = useRef<number | null>(null);
  // Guided onboarding auto-enables the micro-break timer to demonstrate the
  // habit (see confirmPerformanceTempo). Timers are global + persisted, so we
  // remember what the setting was BEFORE we flipped it and restore it when the
  // user leaves onboarding (finish OR bail, via the unmount cleanup below) —
  // a brand-new user shouldn't be left with a timer they never chose. null =
  // we never touched it; true/false = the captured prior state.
  const microbreakPriorEnabledRef = useRef<boolean | null>(null);
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
  // True once the user has logged a single rep (Clean or Miss) this session.
  // Lets endSession tell "actually practiced" from "opened and bailed".
  const touchedRef = useRef(false);
  // True when a durable progress row already existed on load (i.e. the user
  // practiced this ladder before). Guards endSession's cleanup so it only ever
  // deletes a row that startPlaying freshly created this session, never one
  // carrying real prior progress.
  const hadDurableRowRef = useRef(false);

  // Latest micro-break API, read by the unmount cleanup below (avoids a stale
  // closure on setConfig).
  const microbreakRef = useRef(microbreak);
  microbreakRef.current = microbreak;
  // On leaving the guided session (finish→replace OR any EXIT/back), put the
  // micro-break timer back the way we found it — but only if confirmPerformance-
  // Tempo actually flipped it on (captured prior state === false). Restores via
  // the GlobalTimer provider, which stays mounted, so this is safe at unmount.
  useEffect(() => {
    return () => {
      if (guided && microbreakPriorEnabledRef.current === false) {
        microbreakRef.current.setConfig({ enabled: false });
      }
    };
  }, [guided]);

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

  // Reminder-button overrides live in a ref so the load effect reads the
  // values from mount without re-running when the caller re-renders, and an
  // apply-once flag so a reload of the same screen doesn't re-shrink an
  // already-shrunk start tempo.
  const overridesRef = useRef(overrides);
  const overridesAppliedRef = useRef(false);
  function applyOverrides() {
    const o = overridesRef.current;
    if (!o || overridesAppliedRef.current) return;
    overridesAppliedRef.current = true;
    if (o.mode === 'cluster') setMode('cluster');
    if (o.increment === 2 || o.increment === 5 || o.increment === 10) {
      setIncrement(o.increment);
    }
    if (o.startBpm && Number.isFinite(o.startBpm) && o.startBpm >= 30 && o.startBpm <= 400) {
      setStartTempo(String(Math.round(o.startBpm)));
    } else if (o.startScale && o.startScale > 0 && o.startScale < 1) {
      setStartTempo((cur) => {
        const bpm = parseInt(cur, 10);
        if (!Number.isFinite(bpm)) return cur;
        return String(Math.max(30, Math.round((bpm * o.startScale!) / 5) * 5));
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    // Tools mode: no piece, so skip the passage + exercise + progress reads.
    // Still load the per-user Custom-pattern library so Step / Cluster /
    // Custom all work — Custom patterns belong to the account, not a piece.
    if (toolsOnly) {
      listCustomPatterns()
        .then((patterns) => {
          if (!cancelled) setCustomPatterns(patterns);
        })
        .catch((e) => {
          console.warn('[tempoLadder] listCustomPatterns failed:', e);
        });
      return () => {
        cancelled = true;
        metronome.stop();
      };
    }
    if (!id) return;
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
      if (cancelled) return;
      if (!existing) {
        // First ladder on this piece — prefill, in priority order:
        //   1. The piece's shared performance tempo (B-013), if another
        //      strategy set one. Start follows the half-the-goal convention.
        //   2. The most recent SIBLING ladder config (another passage in the
        //      same document). A player working measure-by-measure through a
        //      page uses the same goal + nearly the same config on every
        //      neighbor — falling back to 60/120 made them re-type it each
        //      time. Full config carries over from a step-mode sibling;
        //      cluster/custom siblings lend only their goal.
        // Fill-in only: a saved ladder row (below) always wins over both.
        const p = await getPassage(id);
        if (cancelled) return;
        if (p?.performance_tempo) {
          setGoalTempo(String(p.performance_tempo));
          setFinalTempo(String(p.performance_tempo));
          setStartTempo(String(Math.max(30, Math.round(p.performance_tempo / 2))));
          return;
        }
        if (p?.document_id) {
          try {
            const sib = await getLatestSiblingLadderConfig(p.document_id, id);
            if (cancelled || !sib) return;
            setGoalTempo(String(sib.goal_tempo));
            setFinalTempo(String(sib.goal_tempo));
            if (sib.mode === 'step') {
              setStartTempo(String(sib.start_tempo));
              if (sib.increment === 2 || sib.increment === 5 || sib.increment === 10) {
                setIncrement(sib.increment);
              }
              if (REP_TARGETS.includes(sib.target_reps as RepTarget)) {
                setTargetReps(sib.target_reps as RepTarget);
              }
            }
          } catch (e) {
            // Prefill is a convenience — never block the setup screen on it.
            console.warn('[tempoLadder] sibling prefill failed:', e);
          }
        }
        return;
      }
      // A row already exists → real prior progress. Never let endSession's
      // untouched-session cleanup delete it.
      hadDurableRowRef.current = true;
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
    }).then(() => {
      // After the prefill settles (whichever branch ran), let a reminder
      // button's overrides nudge the setup — same as a hand adjustment.
      if (!cancelled) applyOverrides();
    });
    return () => {
      cancelled = true;
      metronome.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, toolsOnly]);

  // ── THE CLICK IS THE TRUTH (step mode) ──────────────────────────────────
  // If the user turns the metronome dial (or taps tempo) mid-session, the
  // ladder's rung FOLLOWS the click: reps are credited at the tempo actually
  // sounding, the durable resume point moves with it, and the streak resets —
  // "N clean in a row" only means something at one tempo. Without this, a
  // dial-down recorded cleans at the old rung and end-of-session banking
  // pushed the resume point HIGHER (observed live: played at 60, ladder
  // banked 80). Internal setBpm calls (start, step-up) update
  // progress.current_tempo in the same render, so they pass the equality
  // check below and are not treated as user changes. Step mode only —
  // cluster picks a random tempo per rep and custom follows its pattern, so
  // a manual dial there has no single "rung" to adopt.
  useEffect(() => {
    if (phase !== 'playing' || !progress || progress.mode !== 'step') return;
    const bpm = metronome.bpm;
    if (!bpm || bpm === progress.current_tempo) return;
    setProgress({ ...progress, current_tempo: bpm, current_streak: 0 });
    if (!toolsOnly && exerciseId) {
      updateTempoLadderState(exerciseId, bpm, 0).catch((e) =>
        console.warn('[tempoLadder] follow-the-dial persist failed:', e),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronome.bpm, phase, progress, toolsOnly, exerciseId]);

  function setModeAndSyncCluster(next: Mode) {
    // Keep the tempos the user typed when they switch modes. Start/Low/Base is
    // the shared `startTempo`, so it always survives. The TARGET tempo differs by
    // name but is the same idea — `goalTempo` in Step/Custom ("Goal"/"Performance")
    // and `finalTempo` in Cluster ("Final") — so carry it across so it never
    // silently resets to the 120 default. (Cluster's "High BPM" = clusterHigh is a
    // separate thing: the top of the random window, defaulted just above the low.)
    if (next !== mode) {
      if (next === 'cluster' && mode !== 'cluster') {
        const g = parseInt(goalTempo, 10);
        if (!isNaN(g)) setFinalTempo(String(g));
        const lo = parseInt(startTempo, 10);
        if (!isNaN(lo)) setClusterHigh(String(lo + 10));
      } else if (mode === 'cluster' && next !== 'cluster') {
        const f = parseInt(finalTempo, 10);
        if (!isNaN(f)) setGoalTempo(String(f));
      }
    }
    setMode(next);
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

  // Build an in-memory progress row for Tools mode (no DB round-trip). Mirrors
  // the shape upsertTempoLadder would return so the rest of the session logic
  // is identical whether or not we're persisting.
  function synthProgress(
    cfg: TempoLadderConfig,
    currentTempo: number,
  ): TempoLadderProgress {
    return { ...cfg, current_tempo: currentTempo, current_streak: 0, updated_at: 0 };
  }

  // B-013: remember the target on the piece so other strategies prefill it.
  // Best-effort — a failed write never blocks starting the session.
  function sharePerformanceTempo(bpm: number) {
    if (toolsOnly || !id || !bpm) return;
    updatePassagePerformanceTempo(id, bpm).catch((e) =>
      console.warn('[tempoLadder] performance-tempo share failed:', e),
    );
  }

  async function startSession() {
    if (!toolsOnly && (!exerciseId || !id)) return;
    lastHitTempoRef.current = null;
    reachedGoalRef.current = false;
    earnedStepUpRef.current = false;
    touchedRef.current = false;
    setCompletedSets(0);
    setMisses(0);

    if (mode === 'custom') {
      if (!customPattern || !customPatternId) return;
      const base = parseInt(startTempo, 10);
      const goal = parseInt(goalTempo, 10);
      if (!base || !goal || goal <= base) return;
      sharePerformanceTempo(goal);
      const cfg: TempoLadderConfig = {
        exercise_id: exerciseId ?? '',
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
      };
      const saved =
        !toolsOnly && exerciseId
          ? await upsertTempoLadder(cfg)
          : synthProgress(cfg, base);
      if (!toolsOnly && exerciseId) await updateCustomPosition(exerciseId, base, 0, 0);
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
      metronome.start();
      setPhase('playing');
      return;
    }

    if (mode === 'step') {
      const start = parseInt(startTempo, 10);
      const goal = parseInt(goalTempo, 10);
      if (!start || !goal || goal <= start) return;
      sharePerformanceTempo(goal);
      const cfg: TempoLadderConfig = {
        exercise_id: exerciseId ?? '',
        mode: 'step',
        start_tempo: start,
        goal_tempo: goal,
        increment,
        cluster_low: null,
        cluster_high: null,
        target_reps: targetReps,
      };
      const saved =
        !toolsOnly && exerciseId
          ? await upsertTempoLadder(cfg)
          : synthProgress(cfg, start);
      if (!toolsOnly && exerciseId) await updateTempoLadderState(exerciseId, start, 0);
      setProgress({ ...saved, current_tempo: start, current_streak: 0 });
      metronome.setBpm(start);
      metronome.start();
      setPhase('playing');
      return;
    }

    const low = parseInt(startTempo, 10);
    const high = parseInt(clusterHigh, 10);
    const final = parseInt(finalTempo, 10);
    if (!low || !high || !final || high <= low || final < high) return;
    sharePerformanceTempo(final);
    const cfg: TempoLadderConfig = {
      exercise_id: exerciseId ?? '',
      mode: 'cluster',
      start_tempo: low,
      goal_tempo: final,
      increment,
      cluster_low: low,
      cluster_high: high,
      target_reps: targetReps,
    };
    const firstBpm = pickRandom(low, high);
    const saved =
      !toolsOnly && exerciseId
        ? await upsertTempoLadder(cfg)
        : synthProgress(cfg, firstBpm);
    if (!toolsOnly && exerciseId)
      await advanceClusterWindow(exerciseId, low, high, firstBpm, 0);
    setProgress({
      ...saved,
      cluster_low: low,
      cluster_high: high,
      current_tempo: firstBpm,
      current_streak: 0,
    });
    metronome.setBpm(firstBpm);
    metronome.start();
    setPhase('playing');
  }

  async function onClean() {
    if (!progress || (!toolsOnly && (!exerciseId || !id))) return;
    touchedRef.current = true; // a rep happened → this is a real session

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
        if (!toolsOnly && exerciseId)
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
        if (!toolsOnly && exerciseId)
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
      if (!toolsOnly && exerciseId)
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

    const cadence = microbreak.config.tempoLadderReps || 3;
    const isCadenceMark = nextStreak % cadence === 0;
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
      if (!toolsOnly && exerciseId)
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
      if (!toolsOnly && exerciseId) {
        await updateTempoLadderState(exerciseId, lo, nextStreak);
        if (id) await stampLastUsed(id, 'tempo_ladder');
      }
      return;
    }

    setProgress({ ...progress, current_streak: nextStreak });
    if (!toolsOnly && exerciseId)
      await updateTempoLadderState(exerciseId, progress.current_tempo, nextStreak);
  }

  async function onMiss() {
    if (!progress || (!toolsOnly && !exerciseId)) return;
    touchedRef.current = true; // a rep happened → this is a real session
    setMisses((n) => n + 1);
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
      if (!toolsOnly && exerciseId) await updateCustomPosition(exerciseId, customBase, 0, 0);
      return;
    }
    setProgress({ ...progress, current_streak: 0 });
    const base = durableBase(progress.mode, progress.current_tempo, progress, customBase);
    if (!toolsOnly && exerciseId) await updateTempoLadderState(exerciseId, base, 0);
  }

  async function advanceAfterCelebration() {
    if (!progress || (!toolsOnly && !exerciseId)) {
      setCelebrating(null);
      return;
    }
    // The step-up is being taken live, so it's no longer owed at endSession —
    // current_tempo (and the cluster window / custom base) advances right here.
    earnedStepUpRef.current = false;
    // Close the modal BEFORE advancing state: the async persistence below
    // yields to React, and a still-open modal would re-render showing the
    // NEXT-next tempo for a beat (user-visible flash of "85" when stepping
    // up to 80).
    setCelebrating(null);
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
      if (!toolsOnly && exerciseId) await updateCustomPosition(exerciseId, newBase, 0, 0);
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
      if (!toolsOnly && exerciseId)
        await advanceClusterWindow(exerciseId, newLo, newHi, newLo, 0);
    } else {
      const nextTempo = Math.min(
        progress.goal_tempo,
        progress.current_tempo + (progress.increment ?? 5),
      );
      setProgress({ ...progress, current_tempo: nextTempo, current_streak: 0 });
      metronome.setBpm(nextTempo);
      if (!toolsOnly && exerciseId) await updateTempoLadderState(exerciseId, nextTempo, 0);
    }
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
    // Tools mode keeps nothing — no progress bump, no practice-log row. Just
    // stop the click and leave.
    if (toolsOnly) {
      metronome.stop();
      router.back();
      return;
    }
    if (!exerciseId || !id) {
      router.back();
      return;
    }
    // Opened but never played: the user hit "Start practicing" (which makes
    // startPlaying create a fresh progress row) and then exited without a
    // single Clean/Miss. Delete that freshly-created row so the library doesn't
    // show a "Tempo X%" badge for a session where nothing was practiced. Guarded
    // by hadDurableRowRef so a row carrying real prior progress is never touched.
    if (!touchedRef.current && !hadDurableRowRef.current) {
      await deleteTempoLadderProgress(exerciseId);
      metronome.stop();
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
    }
    // No `else` write. If the user didn't finish a series this session, leave
    // the durable ladder position exactly where onClean/onMiss last persisted
    // it. The old else-branch wrote durableBase(...) — in step mode the live
    // metronome BPM — so merely opening the ladder, nudging the tempo, and
    // exiting would shove the library's completion % even though nothing was
    // accomplished. Real play already persists position via onClean/onMiss.
    if (completedSets > 0) {
      await stampLastUsed(id, 'tempo_ladder');
      const data: Record<string, unknown> = {
        tempo: lastHitTempoRef.current ?? bpm,
        goalTempo: progress?.goal_tempo,
        mode: progress?.mode,
        completedSets,
        misses,
        targetReps: progress?.target_reps,
        // The increment used this session — a resurfaced "use a larger /
        // smaller increment" note reads it to offer the next 2·5·10 step.
        increment: progress?.increment ?? inc,
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
    // Ending a real session lands back on the score page, not the passage hub.
    returnToScoreAfterSession(router, passage);
  }

  // ── guided (onboarding) helpers ─────────────────────────────────────────
  // The quiz drops a brand-new user at the 'tempo' phase. They answer one
  // question (performance tempo); we pre-set step mode at half that tempo with
  // default increment/reps, frame the plan ('ready'), then play. Completing one
  // clean set ends the session in their library.
  function confirmPerformanceTempo() {
    const goal = parseInt(goalTempo, 10) || 120;
    // Half the goal, floored at 30, but always kept below the goal so
    // startSession's goal>start guard can never strand the user on 'ready'.
    const start = Math.min(Math.max(30, Math.round(goal / 2)), goal - 5);
    setMode('step');
    setStartTempo(String(start));
    setIncrement(5);
    setTargetReps(5);
    // Switch on the micro-break timer so the guided session demonstrates the
    // rest-every-few-reps habit (the 'ready' screen tells the user we did).
    // Remember the prior state first so the unmount cleanup can restore it —
    // we only ever turn it back off if WE turned it on.
    if (microbreakPriorEnabledRef.current === null) {
      microbreakPriorEnabledRef.current = microbreak.config.enabled;
    }
    microbreak.setConfig({ enabled: true });
    setPhase('ready');
  }

  function goBackToTempo() {
    setPhase('tempo');
  }

  // Start the guided session and begin the click immediately — same rationale
  // as ICU: a first-timer on a small phone shouldn't have to hunt for the
  // metronome's play button. The "Start practicing" tap is the user gesture
  // that unlocks audio on iOS.
  async function startGuidedPlaying() {
    await startSession();
    metronome.start();
  }

  // Guided finish: log the session like endSession's success path, then land
  // the first-timer in their library (with the one-time orientation overlay)
  // rather than router.back() into the murky replace-stack.
  async function finishGuidedToLibrary() {
    if (!toolsOnly && exerciseId && id) {
      await stampLastUsed(id, 'tempo_ladder');
      await logPractice(
        id,
        'tempo_ladder',
        {
          tempo: lastHitTempoRef.current ?? metronome.bpm,
          goalTempo: progress?.goal_tempo,
          mode: progress?.mode,
          completedSets,
          misses,
          targetReps: progress?.target_reps,
        },
        exerciseId,
      );
    }
    metronome.stop();
    setCelebrating(null);
    router.replace('/(tabs)/library?welcome=1' as never);
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
    // guided onboarding
    confirmPerformanceTempo,
    goBackToTempo,
    startGuidedPlaying,
    finishGuidedToLibrary,
  };
}
