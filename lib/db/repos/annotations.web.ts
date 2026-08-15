// Score annotations — the Apple Pencil markup of a passage (WEB side).
//
// On web every passage row lives in Supabase, so the pieces row is written
// directly. The native sibling (annotations.ts) is local-first instead:
// iPad-created passages often have NO Supabase pieces row (only their parent
// document syncs at creation), so a plain Supabase UPDATE there was a silent
// zero-row no-op that dropped the user's strokes.

import { supabase } from '@/lib/supabase/client';

export type Annotation = {
  /** base64 PencilKit drawing blob — editable, used by the iPad canvas. */
  data: string | null;
  /** Public URL of the flattened PNG — used by the web app to display it. */
  imageUri: string | null;
};

export async function getAnnotation(
  passageId: string,
): Promise<Annotation | null> {
  const { data, error } = await supabase
    .from('pieces')
    .select('annotation_data, annotation_image_uri')
    .eq('id', passageId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    data: data.annotation_data ?? null,
    imageUri: data.annotation_image_uri ?? null,
  };
}

export async function saveAnnotation(
  passageId: string,
  annotation: Annotation,
): Promise<void> {
  const { error } = await supabase
    .from('pieces')
    .update({
      annotation_data: annotation.data,
      annotation_image_uri: annotation.imageUri,
      updated_at: Date.now(),
    })
    .eq('id', passageId);
  if (error) throw error;
}
