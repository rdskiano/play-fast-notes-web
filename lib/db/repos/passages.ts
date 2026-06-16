// SQL table name remains "pieces" — see ROADMAP Phase 0 (TS rename only).
import { File } from 'expo-file-system';

import { getDb } from '../client';

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
  // Full, uncropped photo this passage was first created from. Null until the
  // passage is cropped (or for PDF-derived passages). Lets the Crop screen
  // always re-open the full image so cropping is non-destructive.
  original_uri: string | null;
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
  const db = getDb();
  const regions_json = p.regions && p.regions.length > 0 ? JSON.stringify(p.regions) : null;
  await db.runAsync(
    `INSERT INTO pieces (id, title, composer, source_kind, source_uri, thumbnail_uri, folder_id, document_id, regions_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    p.id,
    p.title,
    p.composer ?? null,
    p.source_kind,
    p.source_uri,
    p.thumbnail_uri ?? null,
    p.folder_id ?? null,
    p.document_id ?? null,
    regions_json,
    now,
    now,
  );
  return {
    id: p.id,
    title: p.title,
    composer: p.composer ?? null,
    source_kind: p.source_kind,
    source_uri: p.source_uri,
    thumbnail_uri: p.thumbnail_uri ?? null,
    original_uri: null,
    units_json: null,
    folder_id: p.folder_id ?? null,
    document_id: p.document_id ?? null,
    regions_json,
    created_at: now,
    updated_at: now,
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
  const db = getDb();
  return db.getAllAsync<Passage>(
    `SELECT * FROM pieces WHERE deleted_at IS NULL ORDER BY sort_order ASC, title ASC;`,
  );
}

// How many live photo passages the user has, for the free-tier limit. A "photo
// passage" = any marked passage that isn't from a PDF: legacy standalone photos
// (document_id null) PLUS passages marked on image-documents. PDF "parts" are
// gated separately (Pro), so they're excluded here.
export async function countActivePhotoPassages(): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pieces
     WHERE deleted_at IS NULL
       AND (document_id IS NULL OR document_id NOT IN (
         SELECT id FROM documents WHERE deleted_at IS NULL AND source_kind = 'pdf'
       ));`,
  );
  return row?.n ?? 0;
}

// Document-derived passages live under their document, not in the folder/library
// list — so this query filters them out. Use listPassagesInDocument to enumerate
// the passages marked inside a specific document.
export async function listPassagesInFolder(folder_id: string | null): Promise<Passage[]> {
  const db = getDb();
  if (folder_id === null) {
    return db.getAllAsync<Passage>(
      `SELECT * FROM pieces WHERE folder_id IS NULL AND document_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC, title ASC;`,
    );
  }
  return db.getAllAsync<Passage>(
    `SELECT * FROM pieces WHERE folder_id = ? AND document_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC, title ASC;`,
    folder_id,
  );
}

export async function listPassagesInDocument(document_id: string): Promise<Passage[]> {
  const db = getDb();
  return db.getAllAsync<Passage>(
    `SELECT * FROM pieces WHERE document_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, title ASC;`,
    document_id,
  );
}

export async function updatePassageSortOrder(id: string, sortOrder: number): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE pieces SET sort_order = ? WHERE id = ?;', sortOrder, id);
}

export async function renamePassage(id: string, title: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE pieces SET title = ?, updated_at = ? WHERE id = ?;`,
    title,
    Date.now(),
    id,
  );
}

export async function movePassage(id: string, folder_id: string | null): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE pieces SET folder_id = ?, updated_at = ? WHERE id = ?;`,
    folder_id,
    Date.now(),
    id,
  );
}

export async function getPassage(id: string): Promise<Passage | null> {
  const db = getDb();
  const row = await db.getFirstAsync<Passage>(
    `SELECT * FROM pieces WHERE id = ? AND deleted_at IS NULL;`,
    id,
  );
  return row ?? null;
}

export async function updatePassageUnits(id: string, markers: Marker[]): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE pieces SET units_json = ?, updated_at = ? WHERE id = ?;`,
    JSON.stringify(markers),
    Date.now(),
    id,
  );
}

export async function updatePassageAssets(
  id: string,
  source_uri: string,
  thumbnail_uri: string,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE pieces SET source_uri = ?, thumbnail_uri = ?, updated_at = ? WHERE id = ?;`,
    source_uri,
    thumbnail_uri,
    Date.now(),
    id,
  );
}

// Save a crop without destroying the original. Writes the cropped image to
// source_uri + thumbnail_uri while recording the full, uncropped photo in
// original_uri so the Crop screen can always re-open the full image.
export async function updatePassageCrop(
  id: string,
  source_uri: string,
  thumbnail_uri: string,
  original_uri: string,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE pieces SET source_uri = ?, thumbnail_uri = ?, original_uri = ?, updated_at = ? WHERE id = ?;`,
    source_uri,
    thumbnail_uri,
    original_uri,
    Date.now(),
    id,
  );
}

export async function updatePassageRegions(id: string, regions: PassageRegion[]): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE pieces SET regions_json = ?, updated_at = ? WHERE id = ?;`,
    JSON.stringify(regions),
    Date.now(),
    id,
  );
}

// Combined update for the resize-on-Done flow: writes new regions AND the
// re-cropped/re-stitched image at the same source_uri. One round-trip.
export async function updatePassageRegionsAndAssets(
  id: string,
  regions: PassageRegion[],
  source_uri: string,
  thumbnail_uri: string,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE pieces SET regions_json = ?, source_uri = ?, thumbnail_uri = ?, updated_at = ? WHERE id = ?;`,
    JSON.stringify(regions),
    source_uri,
    thumbnail_uri,
    Date.now(),
    id,
  );
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

export async function softDeletePassage(id: string): Promise<void> {
  const db = getDb();
  const row = await db.getFirstAsync<Passage>(`SELECT * FROM pieces WHERE id = ?;`, id);
  if (!row) return;
  const now = Date.now();
  await db.runAsync(
    `UPDATE pieces SET deleted_at = ?, updated_at = ? WHERE id = ?;`,
    now,
    now,
    id,
  );
  safeDeleteFile(row.source_uri);
  safeDeleteFile(row.thumbnail_uri);
}
