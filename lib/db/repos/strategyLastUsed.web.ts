import { supabase } from '@/lib/supabase/client';
import type { SelfLedKey } from '@/lib/strategies/selfLed';

import type { Strategy } from './exercises';

// The last-used stamp covers more than the app-driven exercise strategies:
// self-led methods and recordings stamp it too, so the practice-log views
// can show "last touched" for every kind of session.
export type StampableStrategy = Strategy | SelfLedKey | 'recording';

export type StalenessRow = { strategy: StampableStrategy; last_used_at: number };

export async function stampLastUsed(
  piece_id: string,
  strategy: StampableStrategy,
): Promise<void> {
  const now = Date.now();
  const { error } = await supabase
    .from('strategy_last_used')
    .upsert(
      { piece_id, strategy, last_used_at: now },
      { onConflict: 'user_id,piece_id,strategy' },
    );
  // Best-effort: the stamp is a nicety, and callers await it right before
  // logging the session itself — a network blip here must not abort the
  // session save that follows.
  if (error) console.warn('stampLastUsed failed', error);
}

export async function getStalenessForPassage(piece_id: string): Promise<StalenessRow[]> {
  const { data, error } = await supabase
    .from('strategy_last_used')
    .select('strategy, last_used_at')
    .eq('piece_id', piece_id);
  if (error) throw error;
  return (data ?? []) as StalenessRow[];
}
