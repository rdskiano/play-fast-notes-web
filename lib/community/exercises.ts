// Community Rhythm Library CRUD. Talks to the web Supabase client on both
// platforms (native reaches it the same way recordings do — the native client
// persists its session). Browsing is free; publishing is Pro-gated in the UI
// before publishExercise is ever called, and again by RLS (owner-only write).

import { supabase } from '@/lib/supabase/client';

import type { ExerciseConfig } from './exerciseConfig';

export type RepertoireType =
  | 'etude'
  | 'orchestral'
  | 'solo'
  | 'chamber'
  | 'method'
  | 'other';

export const REPERTOIRE_TYPES: { id: RepertoireType; label: string }[] = [
  { id: 'etude', label: 'Étude' },
  { id: 'orchestral', label: 'Orchestral' },
  { id: 'solo', label: 'Solo' },
  { id: 'chamber', label: 'Chamber' },
  { id: 'method', label: 'Method' },
  { id: 'other', label: 'Other' },
];

export type CommunityExercise = {
  id: string;
  contributor_user_id: string;
  contributor_name: string;
  title: string;
  config_json: ExerciseConfig;
  instrument_id: string | null;
  repertoire_type: string | null;
  piece_title: string | null;
  composer: string | null;
  time_signature: string | null;
  notes: string | null;
  download_count: number;
  created_at: string;
};

export type CommunityFilters = {
  instrumentId?: string | null;
  repertoireType?: string | null;
};

const SELECT =
  'id, contributor_user_id, contributor_name, title, config_json, instrument_id, repertoire_type, piece_title, composer, time_signature, notes, download_count, created_at';

export async function searchCommunityExercises(
  q: string,
  filters?: CommunityFilters,
): Promise<CommunityExercise[]> {
  let query = supabase
    .from('community_exercises')
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (filters?.instrumentId) query = query.eq('instrument_id', filters.instrumentId);
  if (filters?.repertoireType) query = query.eq('repertoire_type', filters.repertoireType);
  const term = q.trim();
  if (term.length > 0) {
    const like = `%${term.replace(/[%_]/g, '')}%`;
    query = query.or(
      `title.ilike.${like},piece_title.ilike.${like},composer.ilike.${like},contributor_name.ilike.${like}`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as CommunityExercise[];
}

export async function listCommunityExercises(
  filters?: CommunityFilters,
): Promise<CommunityExercise[]> {
  return searchCommunityExercises('', filters);
}

export async function getCommunityExercise(id: string): Promise<CommunityExercise | null> {
  const { data, error } = await supabase
    .from('community_exercises')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as CommunityExercise) ?? null;
}

export type PublishInput = {
  title: string;
  config: ExerciseConfig;
  contributorName: string;
  instrumentId?: string | null;
  repertoireType?: string | null;
  pieceTitle?: string | null;
  composer?: string | null;
  timeSignature?: string | null;
  notes?: string | null;
};

export async function publishExercise(input: PublishInput): Promise<string> {
  const { data, error } = await supabase
    .from('community_exercises')
    .insert({
      title: input.title.trim(),
      config_json: input.config,
      contributor_name: input.contributorName.trim(),
      instrument_id: input.instrumentId ?? null,
      repertoire_type: input.repertoireType ?? null,
      piece_title: input.pieceTitle?.trim() || null,
      composer: input.composer?.trim() || null,
      time_signature: input.timeSignature ?? null,
      notes: input.notes?.trim() || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function unpublishExercise(id: string): Promise<void> {
  const { error } = await supabase.from('community_exercises').delete().eq('id', id);
  if (error) throw error;
}

// Rename a published exercise in place. The community title is a snapshot taken
// at publish time (it doesn't track later renames of the private exercise), so
// the owner can correct it here without removing + re-publishing. RLS restricts
// the write to the contributor.
export async function updateExerciseTitle(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('community_exercises')
    .update({ title: title.trim() })
    .eq('id', id);
  if (error) throw error;
}

export async function myContributions(): Promise<CommunityExercise[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('community_exercises')
    .select(SELECT)
    .eq('contributor_user_id', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CommunityExercise[];
}

export async function incrementDownload(id: string): Promise<void> {
  // Best-effort: a failed counter bump must not block the user's download.
  const { error } = await supabase.rpc('increment_community_download', { ex_id: id });
  if (error) console.warn('community download count bump failed', error);
}
