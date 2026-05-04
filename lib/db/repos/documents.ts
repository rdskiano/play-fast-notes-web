// SQL table is "documents" — Phase 1 of the documents+passages plan.
// A document is a multi-page parent of passages: an uploaded PDF or
// multi-image set the user marks passages inside of. Standalone passages
// (the existing flow) keep working unchanged with document_id = null.
import { supabase } from '@/lib/supabase/client';

import { listPassagesInDocument, softDeletePassage } from './passages';

export type DocumentSourceKind = 'pdf' | 'images';

// One per page in the document's rendered pages_json. image_uri is the
// JPG produced by the pdf-render-page Edge Function (or the uploaded
// image for source_kind='images'). w/h are the rendered pixel dimensions.
export type DocumentPage = { index: number; image_uri: string; w: number; h: number };

export type DocumentRow = {
  id: string;
  title: string;
  composer: string | null;
  source_kind: DocumentSourceKind;
  original_uri: string | null;
  page_count: number;
  pages_json: string;
  folder_id: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export type NewDocument = {
  id: string;
  title: string;
  composer?: string | null;
  source_kind: DocumentSourceKind;
  original_uri?: string | null;
  page_count: number;
  pages: DocumentPage[];
  folder_id?: string | null;
};

export function parsePages(pages_json: string): DocumentPage[] {
  try {
    const parsed = JSON.parse(pages_json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) =>
        typeof p === 'object' &&
        typeof p.index === 'number' &&
        typeof p.image_uri === 'string' &&
        typeof p.w === 'number' &&
        typeof p.h === 'number',
    );
  } catch {
    return [];
  }
}

export async function insertDocument(d: NewDocument): Promise<DocumentRow> {
  const now = Date.now();
  const pages_json = JSON.stringify(d.pages);
  const row = {
    id: d.id,
    title: d.title,
    composer: d.composer ?? null,
    source_kind: d.source_kind,
    original_uri: d.original_uri ?? null,
    page_count: d.page_count,
    pages_json,
    folder_id: d.folder_id ?? null,
    created_at: now,
    updated_at: now,
  };
  const { error } = await supabase.from('documents').insert(row);
  if (error) throw error;
  return {
    ...row,
    sort_order: 0,
    deleted_at: null,
  };
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return (data as DocumentRow | null) ?? null;
}

export async function listDocumentsInFolder(folder_id: string | null): Promise<DocumentRow[]> {
  let query = supabase
    .from('documents')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  query = folder_id === null ? query.is('folder_id', null) : query.eq('folder_id', folder_id);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}

// Replace pages_json wholesale. Pattern: the client orchestrates the parallel
// pdf-render-page fan-out, collects all results, then writes once. Avoids the
// read-modify-write race a per-page update path would introduce.
export async function replaceDocumentPages(id: string, pages: DocumentPage[]): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ pages_json: JSON.stringify(pages), updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function renameDocument(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ title, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function moveDocument(id: string, folder_id: string | null): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ folder_id, updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
}

export async function updateDocumentSortOrder(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('documents').update({ sort_order: sortOrder }).eq('id', id);
  if (error) throw error;
}

// Cascade: soft-deleting a document soft-deletes its passages too. Practice-log
// entries pointing at those passages still resolve (deleted_at is non-null but
// the row is intact), per the existing log/history semantics.
export async function softDeleteDocument(id: string): Promise<void> {
  const childPassages = await listPassagesInDocument(id);
  for (const p of childPassages) {
    await softDeletePassage(p.id);
  }
  const now = Date.now();
  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw error;
}
