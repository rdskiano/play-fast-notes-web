// Per-page Apple Pencil annotations for a document (a multi-page PDF). Like
// lib/db/repos/annotations.ts, but keyed by (document_id, page). Supabase-only,
// used identically on iPad and web.

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
