// Score annotations — the Apple Pencil markup of a passage.
//
// Unlike the other repos (which split SQLite for iPad / Supabase for web),
// annotations live ONLY in Supabase on BOTH platforms: they're the one piece
// of data shared live between the iPad (where you draw) and the web app
// (where you practice). The `supabase` import resolves per-platform, so this
// single file serves both. iPad writes require a signed-in session — see
// lib/supabase/client.ts.

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
