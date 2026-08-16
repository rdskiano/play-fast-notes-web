// Per-page Apple Pencil annotations for a document (a multi-page PDF) — WEB.
//
// On web every row lives in Supabase, so this reads/writes the cloud table
// directly. The native sibling (documentAnnotations.ts) is local-first
// instead: SQLite is written first (an offline save must not lose strokes)
// and the cloud copy is a best-effort mirror the sync engine retries.

import { type Annotation } from '@/lib/db/repos/annotations';
import { supabase } from '@/lib/supabase/client';

export async function getDocumentAnnotations(
  documentId: string,
): Promise<Map<number, Annotation>> {
  const { data, error } = await supabase
    .from('document_annotations')
    .select('page, annotation_data, annotation_image_uri')
    .eq('document_id', documentId);
  if (error) throw error;
  const byPage = new Map<number, Annotation>();
  for (const row of data ?? []) {
    byPage.set(row.page, {
      data: row.annotation_data ?? null,
      imageUri: row.annotation_image_uri ?? null,
    });
  }
  return byPage;
}

export async function saveDocumentAnnotation(
  documentId: string,
  page: number,
  annotation: Annotation,
): Promise<void> {
  const { error } = await supabase.from('document_annotations').upsert({
    document_id: documentId,
    page,
    annotation_data: annotation.data,
    annotation_image_uri: annotation.imageUri,
    updated_at: Date.now(),
  });
  if (error) throw error;
}
