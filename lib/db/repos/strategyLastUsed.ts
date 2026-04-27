import { supabase } from '@/lib/supabase/client';

import type { Strategy } from './exercises';

export type StalenessRow = { strategy: Strategy; last_used_at: number };

export async function stampLastUsed(piece_id: string, strategy: Strategy): Promise<void> {
  const now = Date.now();
  const { error } = await supabase
    .from('strategy_last_used')
    .upsert(
      { piece_id, strategy, last_used_at: now },
      { onConflict: 'user_id,piece_id,strategy' },
    );
  if (error) throw error;
}

export async function getStalenessForPiece(piece_id: string): Promise<StalenessRow[]> {
  const { data, error } = await supabase
    .from('strategy_last_used')
    .select('strategy, last_used_at')
    .eq('piece_id', piece_id);
  if (error) throw error;
  return (data ?? []) as StalenessRow[];
}
