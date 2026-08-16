// Per-page Apple Pencil annotations for a document (a multi-page PDF) —
// NATIVE side, local-first (SYNC_PLAN Phase 3).
//
// This used to be Supabase-only on both platforms, which meant an offline
// iPad save of PDF-page marks failed outright. Now it follows the same rules
// as lib/db/repos/annotations.ts (standalone-passage marks):
//
// Save: SQLite first (cannot miss), then mirror to Supabase best-effort.
// A native save stamps saved_at; on a successful mirror, mirrored_at too.
// saved_at > mirrored_at means strokes exist only on this device — the sync
// engine (lib/sync/engine.ts) re-mirrors those rows on its next run.
//
// Read: a page whose local row has saved_at set reads locally (this device
// drew last and an older cloud copy must not shadow it); other pages read
// from the cloud so web-drawn marks appear, falling back to the local copy
// offline.
//
// Web keeps the Supabase-only implementation in documentAnnotations.web.ts.

import { type Annotation } from '@/lib/db/repos/annotations';
import { supabase } from '@/lib/supabase/client';

import { getDb } from '../client';

type LocalRow = {
  page: number;
  annotation_data: string | null;
  annotation_image_uri: string | null;
  saved_at: number | null;
};

export async function getDocumentAnnotations(
  documentId: string,
): Promise<Map<number, Annotation>> {
  const db = getDb();
  const locals = await db.getAllAsync<LocalRow>(
    `SELECT page, annotation_data, annotation_image_uri, saved_at
     FROM document_annotations WHERE document_id = ?;`,
    documentId,
  );

  const byPage = new Map<number, Annotation>();
  // Cloud first: web-drawn marks should appear on pages this device hasn't
  // drawn on. Offline this fails and the local copies below cover everything.
  try {
    const { data, error } = await supabase
      .from('document_annotations')
      .select('page, annotation_data, annotation_image_uri')
      .eq('document_id', documentId);
    if (error) throw error;
    for (const row of data ?? []) {
      byPage.set(row.page, {
        data: row.annotation_data ?? null,
        imageUri: row.annotation_image_uri ?? null,
      });
    }
  } catch (e) {
    console.warn('[doc-annotations] cloud read failed — using local copies:', e);
  }

  for (const l of locals) {
    // The local copy wins when this device saved it (saved_at set) OR the
    // cloud read didn't return this page (offline, or not yet mirrored).
    if (l.saved_at != null || !byPage.has(l.page)) {
      byPage.set(l.page, {
        data: l.annotation_data ?? null,
        imageUri: l.annotation_image_uri ?? null,
      });
    }
  }
  return byPage;
}

export async function saveDocumentAnnotation(
  documentId: string,
  page: number,
  annotation: Annotation,
): Promise<void> {
  const now = Date.now();
  const db = getDb();
  await db.runAsync(
    `INSERT INTO document_annotations
       (document_id, page, annotation_data, annotation_image_uri, updated_at, saved_at, mirrored_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT (document_id, page) DO UPDATE SET
       annotation_data = excluded.annotation_data,
       annotation_image_uri = excluded.annotation_image_uri,
       updated_at = excluded.updated_at,
       saved_at = excluded.saved_at,
       mirrored_at = NULL;`,
    documentId,
    page,
    annotation.data,
    annotation.imageUri,
    now,
    now,
  );
  // Mirror to Supabase best-effort so the web app shows the marks. Any
  // failure (offline, stale session, parent document not pushed yet) is fine:
  // the SQLite write above secured the strokes and the sync engine re-mirrors
  // unmirrored rows (saved_at > mirrored_at) on its next run.
  try {
    const { error } = await supabase.from('document_annotations').upsert({
      document_id: documentId,
      page,
      annotation_data: annotation.data,
      annotation_image_uri: annotation.imageUri,
      updated_at: now,
    });
    if (error) throw error;
    await db.runAsync(
      `UPDATE document_annotations SET mirrored_at = ?
       WHERE document_id = ? AND page = ? AND saved_at = ?;`,
      now,
      documentId,
      page,
      now,
    );
  } catch (e) {
    console.warn('[doc-annotations] cloud mirror failed — marks saved locally:', e);
  }
}
