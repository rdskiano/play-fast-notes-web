// Per-passage practice status for the document viewer overlay badge.
// One batched read per document focus: last practice date and Tempo Ladder %
// for every passage on the page at once, joined client-side because
// PostgREST cannot see the practice_log → exercises → tempo_ladder FK chain
// in this Supabase project (see project_web_supabase_fk_joins memory).

import { supabase } from '@/lib/supabase/client';

export type PassageStatus = {
  lastPracticedAt: number | null;
  tempoLadderPercent: number | null;
};

export async function getDocumentPassageStatus(
  passageIds: string[],
): Promise<Map<string, PassageStatus>> {
  const result = new Map<string, PassageStatus>();
  if (passageIds.length === 0) return result;

  const [logsRes, exercisesRes] = await Promise.all([
    supabase
      .from('practice_log')
      .select('piece_id, practiced_at')
      .in('piece_id', passageIds)
      .order('practiced_at', { ascending: false }),
    supabase
      .from('exercises')
      .select('id, piece_id')
      .in('piece_id', passageIds)
      .eq('strategy', 'tempo_ladder'),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (exercisesRes.error) throw exercisesRes.error;

  const lastPracticed = new Map<string, number>();
  for (const row of (logsRes.data ?? []) as Array<{
    piece_id: string;
    practiced_at: number;
  }>) {
    if (!lastPracticed.has(row.piece_id)) {
      lastPracticed.set(row.piece_id, row.practiced_at);
    }
  }

  const exerciseToPassage = new Map<string, string>();
  const exerciseIds: string[] = [];
  for (const row of (exercisesRes.data ?? []) as Array<{
    id: string;
    piece_id: string;
  }>) {
    exerciseToPassage.set(row.id, row.piece_id);
    exerciseIds.push(row.id);
  }

  const tlByPassage = new Map<string, number>();
  if (exerciseIds.length > 0) {
    const tlRes = await supabase
      .from('tempo_ladder_progress')
      .select('exercise_id, current_tempo, goal_tempo')
      .in('exercise_id', exerciseIds);
    if (tlRes.error) throw tlRes.error;
    for (const row of (tlRes.data ?? []) as Array<{
      exercise_id: string;
      current_tempo: number;
      goal_tempo: number;
    }>) {
      const passageId = exerciseToPassage.get(row.exercise_id);
      if (!passageId || row.goal_tempo <= 0) continue;
      const pct = Math.max(
        0,
        Math.min(100, Math.round((row.current_tempo / row.goal_tempo) * 100)),
      );
      tlByPassage.set(passageId, pct);
    }
  }

  for (const id of passageIds) {
    result.set(id, {
      lastPracticedAt: lastPracticed.get(id) ?? null,
      tempoLadderPercent: tlByPassage.get(id) ?? null,
    });
  }
  return result;
}
