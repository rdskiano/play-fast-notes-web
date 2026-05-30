import { supabase } from './client';

const BUCKET = 'pieces';

/**
 * SHA-1 hex digest of the given bytes. Used to content-address upload URLs so
 * stable bytes ⇒ stable URL ⇒ CDN + service-worker cache hits.
 */
async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', bytes as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

  // Hash the bytes before upload so the URL we return is content-addressed.
  // Stable bytes ⇒ stable URL ⇒ CDN + service-worker cache hits. Re-cropping
  // to the same rect produces the same hash, so the CDN keeps serving the
  // cached copy instead of treating every save as a fresh URL.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = (await sha1Hex(bytes)).slice(0, 12);

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${hash}`;
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
  const bytes = base64ToBytes(base64Png);
  // Content-address the URL so redrawing the same overlay reuses the cached
  // copy; a distinct drawing yields a distinct hash ⇒ fresh fetch.
  const hash = (await sha1Hex(bytes)).slice(0, 12);

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    upsert: true,
    contentType: 'image/png',
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${hash}`;
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
