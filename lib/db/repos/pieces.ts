import { supabase } from '@/lib/supabase/client';

export type SourceKind = 'pdf' | 'image';

export type Marker = { index: number; x: number; y: number };

export type Piece = {
  id: string;
  title: string;
  composer: string | null;
  source_kind: SourceKind;
  source_uri: string;
  thumbnail_uri: string | null;
  units_json: string | null;
  folder_id: string | null;
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

export type NewPiece = {
  id: string;
  title: string;
  composer?: string | null;
  source_kind: SourceKind;
  source_uri: string;
  thumbnail_uri?: string | null;
  folder_id?: string | null;
};

export async function insertPiece(p: NewPiece): Promise<Piece> {
  const now = Date.now();
  const row = {
    id: p.id,
    title: p.title,
    composer: p.composer ?? null,
    source_kind: p.source_kind,
    source_uri: p.source_uri,
    thumbnail_uri: p.thumbnail_uri ?? null,
    folder_id: p.folder_id ?? null,
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

export async function listPieces(): Promise<Piece[]> {
  const { data, error } = await supabase
    .from('pieces')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Piece[];
}

export async function listPiecesInFolder(folder_id: string | null): Promise<Piece[]> {
  let query = supabase
    .from('pieces')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  query = folder_id === null ? query.is('folder_id', null) : query.eq('folder_id', folder_id);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Piece[];
}

export async function updatePieceSortOrder(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('pieces').update({ sort_order: sortOrder }).eq('id', id);
  if (error) throw error;
}

export async function renamePiece(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('pieces')
    .update({ title, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function movePiece(id: string, folder_id: string | null): Promise<void> {
  const { error } = await supabase
    .from('pieces')
    .update({ folder_id, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function getPiece(id: string): Promise<Piece | null> {
  const { data, error } = await supabase
    .from('pieces')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return (data as Piece | null) ?? null;
}

export async function updatePieceUnits(id: string, markers: Marker[]): Promise<void> {
  const { error } = await supabase
    .from('pieces')
    .update({ units_json: JSON.stringify(markers), updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function updatePieceAssets(
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

export async function softDeletePiece(id: string): Promise<void> {
  const now = Date.now();
  const { error } = await supabase
    .from('pieces')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw error;
  // Note: web uses Supabase Storage URLs (not local files); no file delete needed.
}
