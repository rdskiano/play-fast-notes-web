// Custom Tempo Ladder patterns are stored in Supabase only — they're per-user
// (so they follow the user across passages and devices), and the user
// practices on web where Supabase is already the source of truth. The native
// iPad app, once cut over, will read from the same Supabase table (same
// pattern as `recordings.ts` / `recordingLog.ts` for the practice log).
//
// RLS scopes every row to its owner via auth.uid().
//
// Returned `blocks` are JSON-decoded into the typed shape on the way out so
// callers never deal with raw JSON.

import { supabase } from '@/lib/supabase/client';
import type { CustomBlock, CustomPattern } from '@/lib/strategies/customPatterns';

type Row = {
  id: string;
  user_id: string;
  name: string;
  blocks: CustomBlock[] | string;   // jsonb returns parsed, but tolerate string just in case
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function rowToPattern(r: Row): CustomPattern {
  const blocks = typeof r.blocks === 'string' ? (JSON.parse(r.blocks) as CustomBlock[]) : r.blocks;
  return {
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    blocks: blocks ?? [],
    sort_order: r.sort_order,
    created_at: Date.parse(r.created_at),
    updated_at: Date.parse(r.updated_at),
  };
}

export async function listCustomPatterns(): Promise<CustomPattern[]> {
  const { data, error } = await supabase
    .from('custom_patterns')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(rowToPattern);
}

export async function getCustomPattern(id: string): Promise<CustomPattern | null> {
  const { data, error } = await supabase
    .from('custom_patterns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToPattern(data as Row) : null;
}

export async function createCustomPattern(
  name: string,
  blocks: CustomBlock[],
): Promise<CustomPattern> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('custom_patterns')
    .insert({
      user_id: userId,
      name: name.trim(),
      blocks,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToPattern(data as Row);
}

export async function updateCustomPattern(
  id: string,
  fields: { name?: string; blocks?: CustomBlock[]; sort_order?: number },
): Promise<CustomPattern> {
  const update: Record<string, unknown> = {};
  if (fields.name !== undefined) update.name = fields.name.trim();
  if (fields.blocks !== undefined) update.blocks = fields.blocks;
  if (fields.sort_order !== undefined) update.sort_order = fields.sort_order;
  // Supabase auto-stamps updated_at via trigger or default; we update it
  // explicitly too so the value reflects this client's clock.
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('custom_patterns')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToPattern(data as Row);
}

export async function deleteCustomPattern(id: string): Promise<void> {
  const { error } = await supabase.from('custom_patterns').delete().eq('id', id);
  if (error) throw error;
}
