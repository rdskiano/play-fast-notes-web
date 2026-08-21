import { supabase } from '@/lib/supabase/client';

export type TempoLadderMode = 'step' | 'cluster' | 'custom';

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
  // Custom mode: which user pattern is selected, plus the live position
  // (which block + which rep within the block). Null in step/cluster mode.
  custom_pattern_id?: string | null;
  custom_block_index?: number | null;
  custom_rep_in_block?: number | null;
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
    custom_pattern_id: cfg.custom_pattern_id ?? null,
    custom_block_index: cfg.custom_block_index ?? null,
    custom_rep_in_block: cfg.custom_rep_in_block ?? null,
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

// Custom mode persists three position fields (current base + block index +
// rep in block) rather than just (current_tempo + current_streak). Kept
// separate from updateTempoLadderState so the step/cluster code path stays
// unchanged.
export async function updateCustomPosition(
  exerciseId: string,
  current_base: number,
  custom_block_index: number,
  custom_rep_in_block: number,
): Promise<void> {
  const { error } = await supabase
    .from('tempo_ladder_progress')
    .update({
      current_tempo: current_base,
      custom_block_index,
      custom_rep_in_block,
      updated_at: Date.now(),
    })
    .eq('exercise_id', exerciseId);
  if (error) throw error;
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

// Remove the progress row entirely. Used when a session ends without the user
// practicing a single rep, so the library doesn't show a "Tempo X%" badge for
// an exercise that was opened but never actually played.
export async function deleteTempoLadderProgress(exerciseId: string): Promise<void> {
  const { error } = await supabase
    .from('tempo_ladder_progress')
    .delete()
    .eq('exercise_id', exerciseId);
  if (error) throw error;
}

// Used after a successful session (goal reached) to raise the floor of the
// ladder so the next session starts a notch higher.
export async function updateTempoLadderConfigBounds(
  exerciseId: string,
  fields: { start_tempo?: number; cluster_low?: number },
): Promise<void> {
  if (fields.start_tempo === undefined && fields.cluster_low === undefined) return;
  const update: Record<string, unknown> = { ...fields, updated_at: Date.now() };
  const { error } = await supabase
    .from('tempo_ladder_progress')
    .update(update)
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

// Ladder configs of SIBLING passages (other passages in the same document),
// newest first. Powers the setup-screen prefill: a musician marking a page
// measure-by-measure practices the siblings with the same goal tempo and
// nearly the same config, so a fresh ladder should not fall back to 60/120
// when its neighbor was just configured. The caller narrows the list to the
// passage's own SECTION (that mapping lives in JS, not SQL) and takes the
// first match. Returns [] when the passage is standalone (no document) or no
// sibling has a ladder yet.
export type SiblingLadderConfig = {
  piece_id: string;
  mode: TempoLadderMode;
  start_tempo: number;
  goal_tempo: number;
  increment: number | null;
  target_reps: number;
};

export async function listSiblingLadderConfigs(
  documentId: string,
  excludePieceId: string,
): Promise<SiblingLadderConfig[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select(
      'piece_id, pieces!inner(document_id, deleted_at), tempo_ladder_progress!inner(mode, start_tempo, goal_tempo, increment, target_reps, updated_at)',
    )
    .eq('strategy', 'tempo_ladder')
    .is('deleted_at', null)
    .eq('pieces.document_id', documentId)
    .is('pieces.deleted_at', null)
    .neq('piece_id', excludePieceId);
  if (error) throw error;
  // A document holds at most a few dozen passages, so sort client-side by the
  // progress row's updated_at instead of fighting nested-order syntax.
  return ((data ?? []) as unknown as Array<{
    piece_id: string;
    tempo_ladder_progress: {
      mode: TempoLadderMode;
      start_tempo: number;
      goal_tempo: number;
      increment: number | null;
      target_reps: number;
      updated_at: number;
    } | null;
  }>)
    .filter((r) => r.tempo_ladder_progress)
    .sort((a, b) => b.tempo_ladder_progress!.updated_at - a.tempo_ladder_progress!.updated_at)
    .map((r) => ({
      piece_id: r.piece_id,
      mode: r.tempo_ladder_progress!.mode,
      start_tempo: r.tempo_ladder_progress!.start_tempo,
      goal_tempo: r.tempo_ladder_progress!.goal_tempo,
      increment: r.tempo_ladder_progress!.increment,
      target_reps: r.tempo_ladder_progress!.target_reps,
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
