import { supabase } from '@/lib/supabase/client';

export type Folder = {
  id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

function newId(): string {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function insertFolder(
  name: string,
  parent_folder_id: string | null,
): Promise<Folder> {
  const now = Date.now();
  const id = newId();
  const row = { id, name, parent_folder_id, created_at: now, updated_at: now };
  const { error } = await supabase.from('folders').insert(row);
  if (error) throw error;
  return { ...row, deleted_at: null };
}

export async function listFoldersInParent(
  parent_folder_id: string | null,
): Promise<Folder[]> {
  let query = supabase
    .from('folders')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  query =
    parent_folder_id === null
      ? query.is('parent_folder_id', null)
      : query.eq('parent_folder_id', parent_folder_id);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Folder[];
}

export async function updateFolderSortOrder(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('folders').update({ sort_order: sortOrder }).eq('id', id);
  if (error) throw error;
}

export async function getFolder(id: string): Promise<Folder | null> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return (data as Folder | null) ?? null;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('folders')
    .update({ name, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function moveFolder(
  id: string,
  parent_folder_id: string | null,
): Promise<void> {
  if (parent_folder_id === id) return;
  if (parent_folder_id !== null) {
    let cursor: string | null = parent_folder_id;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === id) return;
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const parent = await getFolder(cursor);
      cursor = parent?.parent_folder_id ?? null;
    }
  }
  const { error } = await supabase
    .from('folders')
    .update({ parent_folder_id, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function softDeleteFolder(id: string): Promise<void> {
  const target = await getFolder(id);
  if (!target) return;
  const newParent = target.parent_folder_id;
  const now = Date.now();

  const { error: foldersErr } = await supabase
    .from('folders')
    .update({ parent_folder_id: newParent, updated_at: now })
    .eq('parent_folder_id', id)
    .is('deleted_at', null);
  if (foldersErr) throw foldersErr;

  const { error: piecesErr } = await supabase
    .from('pieces')
    .update({ folder_id: newParent, updated_at: now })
    .eq('folder_id', id)
    .is('deleted_at', null);
  if (piecesErr) throw piecesErr;

  const { error: deleteErr } = await supabase
    .from('folders')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);
  if (deleteErr) throw deleteErr;
}

export async function rehomeOrphans(): Promise<{ passages: number; folders: number }> {
  // The iPad version does this via SQL subqueries; on Supabase we read the
  // live folder ids first, then run two scoped updates. RLS already filters
  // to the current user.
  const { data: liveFolders, error: lfErr } = await supabase
    .from('folders')
    .select('id')
    .is('deleted_at', null);
  if (lfErr) throw lfErr;
  const liveIds = (liveFolders ?? []).map((f) => f.id);
  const now = Date.now();

  const { data: orphanPieces, error: opErr } = await supabase
    .from('pieces')
    .select('id, folder_id')
    .is('deleted_at', null)
    .not('folder_id', 'is', null);
  if (opErr) throw opErr;
  const orphanPieceIds = (orphanPieces ?? [])
    .filter((p) => p.folder_id && !liveIds.includes(p.folder_id))
    .map((p) => p.id);
  if (orphanPieceIds.length > 0) {
    const { error } = await supabase
      .from('pieces')
      .update({ folder_id: null, updated_at: now })
      .in('id', orphanPieceIds);
    if (error) throw error;
  }

  const { data: orphanFolders, error: ofErr } = await supabase
    .from('folders')
    .select('id, parent_folder_id')
    .is('deleted_at', null)
    .not('parent_folder_id', 'is', null);
  if (ofErr) throw ofErr;
  const orphanFolderIds = (orphanFolders ?? [])
    .filter((f) => f.parent_folder_id && !liveIds.includes(f.parent_folder_id))
    .map((f) => f.id);
  if (orphanFolderIds.length > 0) {
    const { error } = await supabase
      .from('folders')
      .update({ parent_folder_id: null, updated_at: now })
      .in('id', orphanFolderIds);
    if (error) throw error;
  }

  return { passages: orphanPieceIds.length, folders: orphanFolderIds.length };
}

export async function listAllFolders(): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Folder[];
}

export async function getFolderPath(id: string | null): Promise<Folder[]> {
  if (id === null) return [];
  const out: Folder[] = [];
  let cursor: string | null = id;
  const visited = new Set<string>();
  while (cursor) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const f = await getFolder(cursor);
    if (!f) break;
    out.unshift(f);
    cursor = f.parent_folder_id;
  }
  return out;
}
