import { supabase } from '@/lib/supabase/client';

export type Strategy =
  | 'tempo_ladder'
  | 'click_up'
  | 'rhythmic'
  | 'chunking'
  | 'interleaved';

export type Exercise = {
  id: string;
  piece_id: string;
  strategy: Strategy;
  config_json: string;
  name: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

function newId(): string {
  return `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getOrCreateExercise(
  piece_id: string,
  strategy: Strategy,
): Promise<Exercise> {
  const { data: existing, error: selErr } = await supabase
    .from('exercises')
    .select('*')
    .eq('piece_id', piece_id)
    .eq('strategy', strategy)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing as Exercise;

  const id = `${piece_id}:${strategy}`;
  const now = Date.now();
  const row = {
    id,
    piece_id,
    strategy,
    config_json: '{}',
    created_at: now,
    updated_at: now,
  };
  const { error: insErr } = await supabase.from('exercises').insert(row);
  if (insErr) throw insErr;
  return {
    ...row,
    name: null,
    sort_order: 0,
    deleted_at: null,
  };
}

export async function insertExercise(
  piece_id: string,
  strategy: Strategy,
  name: string | null,
  config_json: string,
): Promise<Exercise> {
  const { data: maxRow, error: maxErr } = await supabase
    .from('exercises')
    .select('sort_order')
    .eq('piece_id', piece_id)
    .eq('strategy', strategy)
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const sort_order = (maxRow?.sort_order ?? -1) + 1;

  const id = newId();
  const now = Date.now();
  const row = {
    id,
    piece_id,
    strategy,
    config_json,
    name,
    sort_order,
    created_at: now,
    updated_at: now,
  };
  const { error } = await supabase.from('exercises').insert(row);
  if (error) throw error;
  return { ...row, deleted_at: null };
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return (data as Exercise | null) ?? null;
}

export async function listExercisesForPiece(
  piece_id: string,
  strategy?: Strategy,
): Promise<Exercise[]> {
  let query = supabase
    .from('exercises')
    .select('*')
    .eq('piece_id', piece_id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (strategy) query = query.eq('strategy', strategy);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Exercise[];
}

export async function updateExerciseConfig(id: string, config_json: string): Promise<void> {
  const { error } = await supabase
    .from('exercises')
    .update({ config_json, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function renameExercise(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('exercises')
    .update({ name, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function updateExerciseSortOrder(id: string, sort_order: number): Promise<void> {
  const { error } = await supabase.from('exercises').update({ sort_order }).eq('id', id);
  if (error) throw error;
}

export async function softDeleteExercise(id: string): Promise<void> {
  const now = Date.now();
  const { error } = await supabase
    .from('exercises')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw error;
}
