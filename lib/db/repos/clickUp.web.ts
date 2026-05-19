import { supabase } from '@/lib/supabase/client';

export type ClickUpProgress = {
  exercise_id: string;
  current_index: number;
  updated_at: number;
};

export async function upsertClickUpProgress(
  exercise_id: string,
  current_index: number,
): Promise<ClickUpProgress> {
  const now = Date.now();
  const { error } = await supabase
    .from('click_up_progress')
    .upsert(
      { exercise_id, current_index, updated_at: now },
      { onConflict: 'exercise_id' },
    );
  if (error) throw error;
  return { exercise_id, current_index, updated_at: now };
}

export async function getClickUpProgress(
  exercise_id: string,
): Promise<ClickUpProgress | null> {
  const { data, error } = await supabase
    .from('click_up_progress')
    .select('exercise_id, current_index, updated_at')
    .eq('exercise_id', exercise_id)
    .maybeSingle();
  if (error) throw error;
  return (data as ClickUpProgress | null) ?? null;
}

export async function setClickUpIndex(
  exercise_id: string,
  current_index: number,
): Promise<void> {
  const { error } = await supabase
    .from('click_up_progress')
    .update({ current_index, updated_at: Date.now() })
    .eq('exercise_id', exercise_id);
  if (error) throw error;
}
