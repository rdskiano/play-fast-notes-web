import { supabase } from '@/lib/supabase/client';

export type TempoLadderMode = 'step' | 'cluster';

export type TempoLadderConfig = {
  exercise_id: string;
  mode: TempoLadderMode;
  start_tempo: number;
  goal_tempo: number;
  increment?: number | null;
  cluster_low?: number | null;
  cluster_high?: number | null;
  target_reps: number;
  goal_date?: number | null;
};

export type TempoLadderProgress = TempoLadderConfig & {
  current_tempo: number;
  current_streak: number;
  updated_at: number;
};

export async function upsertTempoLadder(
  cfg: TempoLadderConfig,
): Promise<TempoLadderProgress> {
  const { data: existing, error: selErr } = await supabase
    .from('tempo_ladder_progress')
    .select('*')
    .eq('exercise_id', cfg.exercise_id)
    .maybeSingle();
  if (selErr) throw selErr;

  const now = Date.now();
  const current_tempo = (existing as TempoLadderProgress | null)?.current_tempo ?? cfg.start_tempo;
  const current_streak = (existing as TempoLadderProgress | null)?.current_streak ?? 0;

  const row = {
    exercise_id: cfg.exercise_id,
    mode: cfg.mode,
    start_tempo: cfg.start_tempo,
    goal_tempo: cfg.goal_tempo,
    increment: cfg.increment ?? null,
    cluster_low: cfg.cluster_low ?? null,
    cluster_high: cfg.cluster_high ?? null,
    target_reps: cfg.target_reps,
    goal_date: cfg.goal_date ?? null,
    current_tempo,
    current_streak,
    updated_at: now,
  };
  const { error } = await supabase
    .from('tempo_ladder_progress')
    .upsert(row, { onConflict: 'exercise_id' });
  if (error) throw error;
  return { ...cfg, current_tempo, current_streak, updated_at: now };
}

export async function getTempoLadder(
  exerciseId: string,
): Promise<TempoLadderProgress | null> {
  const { data, error } = await supabase
    .from('tempo_ladder_progress')
    .select('*')
    .eq('exercise_id', exerciseId)
    .maybeSingle();
  if (error) throw error;
  return (data as TempoLadderProgress | null) ?? null;
}

export async function updateTempoLadderState(
  exerciseId: string,
  current_tempo: number,
  current_streak: number,
): Promise<void> {
  const { error } = await supabase
    .from('tempo_ladder_progress')
    .update({ current_tempo, current_streak, updated_at: Date.now() })
    .eq('exercise_id', exerciseId);
  if (error) throw error;
}

export type PassageTempoLadderProgress = {
  piece_id: string;
  current_tempo: number;
  goal_tempo: number;
};

export async function getTempoLadderProgressForPassages(
  piece_ids: string[],
): Promise<PassageTempoLadderProgress[]> {
  if (piece_ids.length === 0) return [];
  const { data, error } = await supabase
    .from('exercises')
    .select('piece_id, tempo_ladder_progress!inner(current_tempo, goal_tempo)')
    .eq('strategy', 'tempo_ladder')
    .is('deleted_at', null)
    .in('piece_id', piece_ids);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    piece_id: string;
    tempo_ladder_progress: { current_tempo: number; goal_tempo: number } | null;
  }>)
    .filter((r) => r.tempo_ladder_progress)
    .map((r) => ({
      piece_id: r.piece_id,
      current_tempo: r.tempo_ladder_progress!.current_tempo,
      goal_tempo: r.tempo_ladder_progress!.goal_tempo,
    }));
}

export async function advanceClusterWindow(
  exerciseId: string,
  cluster_low: number,
  cluster_high: number,
  current_tempo: number,
  current_streak: number,
): Promise<void> {
  const { error } = await supabase
    .from('tempo_ladder_progress')
    .update({
      cluster_low,
      cluster_high,
      current_tempo,
      current_streak,
      updated_at: Date.now(),
    })
    .eq('exercise_id', exerciseId);
  if (error) throw error;
}
