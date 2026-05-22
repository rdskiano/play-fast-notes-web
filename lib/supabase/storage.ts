import { supabase } from './client';

const BUCKET = 'pieces';

/**
 * Upload an image file to the pieces bucket under the current user's folder.
 * Returns the public URL of the uploaded file.
 *
 * Path scheme: `<user_id>/<piece_id>.<ext>` (storage path uses SQL identifiers).
 * RLS policies in Supabase ensure only the owning user can write to their own
 * folder.
 */
export async function uploadPassageImage(
  pieceId: string,
  file: File,
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  const ext = inferExt(file);
  const path = `${userId}/${pieceId}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust: when a passage is re-cropped, the path is identical (upsert
  // overwrites at <userId>/<pieceId>.<ext>) so browsers and the Supabase CDN
  // would otherwise keep serving the previous bytes. The version query forces
  // a fresh fetch each time the row is updated.
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Upload an annotation PNG (a base64 string) to the pieces bucket. Returns the
 * public URL. The PNG is the flattened Apple Pencil drawing — the web app
 * displays it over the score because it can't render native PencilKit data.
 *
 * `key` identifies the annotation: a passage id, or `<docId>-page<N>` for a
 * document page. Path scheme: `<user_id>/<key>-annotation.png`.
 */
export async function uploadAnnotationImage(
  key: string,
  base64Png: string,
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  const path = `${userId}/${key}-annotation.png`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, base64ToBytes(base64Png), {
      upsert: true,
      contentType: 'image/png',
    });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust: the path is stable (upsert overwrites), so without a version
  // query the CDN keeps serving the previous annotation.
  return `${data.publicUrl}?v=${Date.now()}`;
}

function base64ToBytes(base64: string): Uint8Array {
  // Tolerate a data-URL prefix (`data:image/png;base64,...`).
  const clean = base64.includes(',')
    ? base64.slice(base64.indexOf(',') + 1)
    : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function inferExt(file: File): string {
  // Prefer the actual file extension; fall back to MIME type; default to jpg.
  const fromName = file.name.split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'application/pdf') return 'pdf';
  return 'jpg';
}
