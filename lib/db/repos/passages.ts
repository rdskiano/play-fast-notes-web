// SQL table name remains "pieces" — see ROADMAP Phase 0 (TS rename only).
import { supabase } from '@/lib/supabase/client';

export type SourceKind = 'pdf' | 'image';

export type Marker = { index: number; x: number; y: number };

// One entry per page that the passage's source image was cropped from.
// Single-page passages have length 1; multi-page passages (an excerpt
// spanning pages 4→5) have length 2+. Coordinates are in source-page pixel space.
export type PassageRegion = { page: number; x: number; y: number; w: number; h: number };

export type Passage = {
  id: string;
  title: string;
  composer: string | null;
  source_kind: SourceKind;
  source_uri: string;
  thumbnail_uri: string | null;
  units_json: string | null;
  folder_id: string | null;
  document_id: string | null;
  regions_json: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export function parseMarkers(units_json: string | null): Marker[] {
  if (!units_json) return [];
  try {
    const parsed = JSON.parse(units_json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m) =>
        typeof m === 'object' &&
        typeof m.index === 'number' &&
        typeof m.x === 'number' &&
        typeof m.y === 'number',
    );
  } catch {
    return [];
  }
}

export type NewPassage = {
  id: string;
  title: string;
  composer?: string | null;
  source_kind: SourceKind;
  source_uri: string;
  thumbnail_uri?: string | null;
  folder_id?: string | null;
  document_id?: string | null;
  regions?: PassageRegion[] | null;
};

export async function insertPassage(p: NewPassage): Promise<Passage> {
  const now = Date.now();
  const regions_json = p.regions && p.regions.length > 0 ? JSON.stringify(p.regions) : null;
  const row = {
    id: p.id,
    title: p.title,
    composer: p.composer ?? null,
    source_kind: p.source_kind,
    source_uri: p.source_uri,
    thumbnail_uri: p.thumbnail_uri ?? null,
    folder_id: p.folder_id ?? null,
    document_id: p.document_id ?? null,
    regions_json,
    created_at: now,
    updated_at: now,
  };
  const { error } = await supabase.from('pieces').insert(row);
  if (error) throw error;
  return {
    ...row,
    units_json: null,
    deleted_at: null,
  };
}

export function parseRegions(regions_json: string | null): PassageRegion[] {
  if (!regions_json) return [];
  try {
    const parsed = JSON.parse(regions_json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) =>
        typeof r === 'object' &&
        typeof r.page === 'number' &&
        typeof r.x === 'number' &&
        typeof r.y === 'number' &&
        typeof r.w === 'number' &&
        typeof r.h === 'number',
    );
  } catch {
    return [];
  }
}

export async function listPassages(): Promise<Passage[]> {
  const { data, error } = await supabase
    .from('pieces')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Passage[];
}

// Document-derived passages live under their document, not in the folder/library
// list — so this query filters them out. Use listPassagesInDocument to enumerate
// the passages marked inside a specific document.
export async function listPassagesInFolder(folder_id: string | null): Promise<Passage[]> {
  let query = supabase
    .from('pieces')
    .select('*')
    .is('deleted_at', null)
    .is('document_id', null)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  query = folder_id === null ? query.is('folder_id', null) : query.eq('folder_id', folder_id);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Passage[];
}

export async function listPassagesInDocument(document_id: string): Promise<Passage[]> {
  const { data, error } = await supabase
    .from('pieces')
    .select('*')
    .eq('document_id', document_id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Passage[];
}

export async function updatePassageSortOrder(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('pieces').update({ sort_order: sortOrder }).eq('id', id);
  if (error) throw error;
}

export async function renamePassage(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('pieces')
    .update({ title, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function movePassage(id: string, folder_id: string | null): Promise<void> {
  const { error } = await supabase
    .from('pieces')
    .update({ folder_id, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function getPassage(id: string): Promise<Passage | null> {
  const { data, error } = await supabase
    .from('pieces')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return (data as Passage | null) ?? null;
}

export async function updatePassageUnits(id: string, markers: Marker[]): Promise<void> {
  const { error } = await supabase
    .from('pieces')
    .update({ units_json: JSON.stringify(markers), updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function updatePassageAssets(
  id: string,
  source_uri: string,
  thumbnail_uri: string,
): Promise<void> {
  const { error } = await supabase
    .from('pieces')
    .update({ source_uri, thumbnail_uri, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function softDeletePassage(id: string): Promise<void> {
  const now = Date.now();
  const { error } = await supabase
    .from('pieces')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw error;
  // Note: web uses Supabase Storage URLs (not local files); no file delete needed.
}
