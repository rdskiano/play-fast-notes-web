// Score annotations — the Apple Pencil markup of a passage (NATIVE side).
//
// The iPad is local-first: the SQLite pieces row is the source of truth for a
// passage's pencil marks, because passages created ON the iPad have no
// Supabase pieces row at all (only their parent document syncs at creation).
// The previous Supabase-only write was a zero-row UPDATE for those passages —
// PostgREST doesn't error on that, so strokes looked saved but were dropped.
//
// Save: SQLite first (cannot miss), then mirror to Supabase best-effort so
// web-visible passages still share marks with the web app. A native save
// stamps annotation_saved_at; once set, the local copy wins over Supabase
// reads — an offline save must not be shadowed by an older or empty cloud
// row, and the full drawing re-mirrors on the next online save anyway.
// Passages never drawn on natively (imported from web) keep reading from
// Supabase, so marks made on the web still appear here.
//
// Web keeps the Supabase-only implementation in annotations.web.ts.

import { supabase } from '@/lib/supabase/client';

import { getDb } from '../client';

export type Annotation = {
  /** base64 PencilKit drawing blob — editable, used by the iPad canvas. */
  data: string | null;
  /** Public URL of the flattened PNG — used by the web app to display it. */
  imageUri: string | null;
};

type LocalRow = {
  annotation_data: string | null;
  annotation_image_uri: string | null;
  annotation_saved_at: number | null;
};

export async function getAnnotation(
  passageId: string,
): Promise<Annotation | null> {
  const db = getDb();
  const local = await db.getFirstAsync<LocalRow>(
    `SELECT annotation_data, annotation_image_uri, annotation_saved_at
     FROM pieces WHERE id = ? AND deleted_at IS NULL;`,
    passageId,
  );
  if (local?.annotation_saved_at != null) {
    return {
      data: local.annotation_data ?? null,
      imageUri: local.annotation_image_uri ?? null,
    };
  }
  try {
    const { data, error } = await supabase
      .from('pieces')
      .select('annotation_data, annotation_image_uri')
      .eq('id', passageId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return {
        data: data.annotation_data ?? null,
        imageUri: data.annotation_image_uri ?? null,
      };
    }
  } catch (e) {
    // Offline or stale session: fall through to whatever the local row holds
    // (imported passages carry their annotation columns from /import-supabase).
    console.warn('[annotations] cloud read failed — using local copy:', e);
  }
  if (!local) return null;
  return {
    data: local.annotation_data ?? null,
    imageUri: local.annotation_image_uri ?? null,
  };
}

export async function saveAnnotation(
  passageId: string,
  annotation: Annotation,
): Promise<void> {
  const now = Date.now();
  const db = getDb();
  await db.runAsync(
    `UPDATE pieces
     SET annotation_data = ?, annotation_image_uri = ?, annotation_saved_at = ?, annotation_mirrored_at = NULL, updated_at = ?
     WHERE id = ?;`,
    annotation.data,
    annotation.imageUri,
    now,
    now,
    passageId,
  );
  // Mirror to Supabase so the web app shows the marks on passages it knows
  // about. Zero rows matched (passage not pushed to the cloud yet) or a
  // network/auth failure is fine — the SQLite write above already secured the
  // strokes, and the sync engine re-mirrors any row whose annotation_saved_at
  // is newer than annotation_mirrored_at on its next run. mirrored_at is only
  // stamped when the cloud CONFIRMS a row was written (.select), because
  // PostgREST reports a zero-row update as success.
  try {
    const { data, error } = await supabase
      .from('pieces')
      .update({
        annotation_data: annotation.data,
        annotation_image_uri: annotation.imageUri,
        updated_at: now,
      })
      .eq('id', passageId)
      .select('id');
    if (error) throw error;
    if ((data ?? []).length > 0) {
      await db.runAsync(
        'UPDATE pieces SET annotation_mirrored_at = ? WHERE id = ? AND annotation_saved_at = ?;',
        now,
        passageId,
        now,
      );
    }
  } catch (e) {
    console.warn('[annotations] cloud mirror failed — marks saved locally:', e);
  }
}
