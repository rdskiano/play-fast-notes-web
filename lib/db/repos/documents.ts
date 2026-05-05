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

// One per named section (e.g. "II. Trio", "IV. Adagio"). start_page is
// 1-indexed; start_y is in source pixels on that page (0 = top of page).
// The section runs until the next section's marker or end of document.
// Persisted in documents.sections_json. Unset = no sections.
export type DocumentSection = {
  name: string;
  start_page: number;
  start_y: number;
};

export type DocumentRow = {
  id: string;
  title: string;
  composer: string | null;
  source_kind: DocumentSourceKind;
  original_uri: string | null;
  page_count: number;
  pages_json: string;
  sections_json: string | null;
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

export function parseSections(sections_json: string | null): DocumentSection[] {
  if (!sections_json) return [];
  try {
    const parsed = JSON.parse(sections_json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s) =>
          typeof s === 'object' &&
          s !== null &&
          typeof s.name === 'string' &&
          typeof s.start_page === 'number',
      )
      .map((s): DocumentSection => ({
        name: s.name,
        start_page: s.start_page,
        // Tolerate sections written before start_y existed — top of page = 0.
        start_y: typeof s.start_y === 'number' ? s.start_y : 0,
      }))
      .sort((a, b) =>
        a.start_page === b.start_page
          ? a.start_y - b.start_y
          : a.start_page - b.start_page,
      );
  } catch {
    return [];
  }
}

// Returns the section that contains a given (page, y) position, or null if
// no section starts at or before this position. Sections are ordered by
// (page, y) so we can scan linearly.
export function sectionForPosition(
  sections: DocumentSection[],
  page: number,
  y: number,
): DocumentSection | null {
  let current: DocumentSection | null = null;
  for (const s of sections) {
    if (s.start_page < page) current = s;
    else if (s.start_page === page && s.start_y <= y) current = s;
    else break;
  }
  return current;
}

// Convenience for cases where only the page is known (e.g. the top of a
// freshly-opened spread). Equivalent to sectionForPosition with y = +Infinity.
export function sectionForPage(
  sections: DocumentSection[],
  page: number,
): DocumentSection | null {
  return sectionForPosition(sections, page, Number.MAX_SAFE_INTEGER);
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
    sections_json: null,
    sort_order: 0,
    deleted_at: null,
  };
}

export async function updateDocumentSections(
  id: string,
  sections: DocumentSection[],
): Promise<void> {
  const sorted = [...sections].sort((a, b) =>
    a.start_page === b.start_page
      ? a.start_y - b.start_y
      : a.start_page - b.start_page,
  );
  const { error } = await supabase
    .from('documents')
    .update({ sections_json: JSON.stringify(sorted), updated_at: Date.now() })
    .eq('id', id);
  if (error) throw error;
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
