// SQL table is "documents" — Phase 1 of the documents+passages plan.
// A document is a multi-page parent of passages: an uploaded PDF or
// multi-image set the user marks passages inside of. Standalone passages
// (the existing flow) keep working unchanged with document_id = null.
import { File } from 'expo-file-system';

import { getDb } from '../client';
import { listPassagesInDocument, softDeletePassage } from './passages';

export type DocumentSourceKind = 'pdf' | 'images';

// One per page in the document's pages_json. w/h are the page's pixel
// dimensions at the reference render scale. image_uri is OPTIONAL as of
// "Stage 2" (web): new PDF uploads store no per-page JPEG and render from the
// PDF on demand. Native imports and source_kind='images' sets still carry it.
// Resolve to a displayable URI via lib/pdf/pageImage's resolvePageImageUri.
export type DocumentPage = { index: number; image_uri?: string; w: number; h: number };

// One per named section (e.g. "II. Trio", "IV. Adagio"). start_page is
// 1-indexed; start_y is in source pixels on that page (0 = top of page).
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
        typeof p.w === 'number' &&
        typeof p.h === 'number',
      // image_uri is optional — Stage 2 pages render from the PDF on demand.
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

export function sectionForPage(
  sections: DocumentSection[],
  page: number,
): DocumentSection | null {
  return sectionForPosition(sections, page, Number.MAX_SAFE_INTEGER);
}

export async function insertDocument(d: NewDocument): Promise<DocumentRow> {
  const now = Date.now();
  const db = getDb();
  const pages_json = JSON.stringify(d.pages);
  await db.runAsync(
    `INSERT INTO documents (id, title, composer, source_kind, original_uri, page_count, pages_json, folder_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    d.id,
    d.title,
    d.composer ?? null,
    d.source_kind,
    d.original_uri ?? null,
    d.page_count,
    pages_json,
    d.folder_id ?? null,
    now,
    now,
  );
  return {
    id: d.id,
    title: d.title,
    composer: d.composer ?? null,
    source_kind: d.source_kind,
    original_uri: d.original_uri ?? null,
    page_count: d.page_count,
    pages_json,
    sections_json: null,
    folder_id: d.folder_id ?? null,
    sort_order: 0,
    created_at: now,
    updated_at: now,
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
  const db = getDb();
  await db.runAsync(
    `UPDATE documents SET sections_json = ?, updated_at = ? WHERE id = ?;`,
    JSON.stringify(sorted),
    Date.now(),
    id,
  );
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const db = getDb();
  const row = await db.getFirstAsync<DocumentRow>(
    `SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL;`,
    id,
  );
  return row ?? null;
}

export async function listDocumentsInFolder(folder_id: string | null): Promise<DocumentRow[]> {
  const db = getDb();
  if (folder_id === null) {
    return db.getAllAsync<DocumentRow>(
      `SELECT * FROM documents WHERE folder_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC, title ASC;`,
    );
  }
  return db.getAllAsync<DocumentRow>(
    `SELECT * FROM documents WHERE folder_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, title ASC;`,
    folder_id,
  );
}

export async function listAllDocuments(): Promise<DocumentRow[]> {
  const db = getDb();
  return db.getAllAsync<DocumentRow>(
    `SELECT * FROM documents WHERE deleted_at IS NULL ORDER BY sort_order ASC, title ASC;`,
  );
}

// Replace pages_json wholesale (and keep page_count in step with it). Pattern:
// the client orchestrates the parallel pdf-render-page fan-out, collects all
// results, then writes once. Avoids the read-modify-write race a per-page update
// path would introduce.
export async function replaceDocumentPages(id: string, pages: DocumentPage[]): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE documents SET pages_json = ?, page_count = ?, updated_at = ? WHERE id = ?;`,
    JSON.stringify(pages),
    pages.length,
    Date.now(),
    id,
  );
}

export async function renameDocument(id: string, title: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE documents SET title = ?, updated_at = ? WHERE id = ?;`,
    title,
    Date.now(),
    id,
  );
}

export async function moveDocument(id: string, folder_id: string | null): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE documents SET folder_id = ?, updated_at = ? WHERE id = ?;`,
    folder_id,
    Date.now(),
    id,
  );
}

export async function updateDocumentSortOrder(id: string, sortOrder: number): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE documents SET sort_order = ? WHERE id = ?;', sortOrder, id);
}

function safeDeleteFile(uri: string | null) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
}

// Cascade: soft-deleting a document soft-deletes its passages too. Practice-log
// entries pointing at those passages still resolve (deleted_at is non-null but
// the row is intact), per the existing log/history semantics.
export async function softDeleteDocument(id: string): Promise<void> {
  const db = getDb();
  const row = await db.getFirstAsync<DocumentRow>(`SELECT * FROM documents WHERE id = ?;`, id);
  if (!row) return;
  const childPassages = await listPassagesInDocument(id);
  for (const p of childPassages) {
    await softDeletePassage(p.id);
  }
  const now = Date.now();
  await db.runAsync(
    `UPDATE documents SET deleted_at = ?, updated_at = ? WHERE id = ?;`,
    now,
    now,
    id,
  );
  safeDeleteFile(row.original_uri);
  for (const page of parsePages(row.pages_json)) {
    if (page.image_uri) safeDeleteFile(page.image_uri);
  }
}
