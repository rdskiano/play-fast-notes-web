import { supabase } from './client';

const BUCKET = 'pieces';

/**
 * Content hash (hex) of the given bytes. Used to content-address upload URLs so
 * stable bytes ⇒ stable URL ⇒ CDN + service-worker cache hits.
 *
 * Prefers Web Crypto SHA-1. That API only exists in a SECURE CONTEXT (https://
 * or localhost), so when the app is opened over plain http:// on a LAN IP —
 * e.g. testing the dev server from the iPad at http://192.168.x.x:8081 —
 * `crypto.subtle` is undefined. We fall back to a fast non-cryptographic hash
 * there. The hash is only a cache-bust token (`?v=`), so collision-resistance
 * isn't required; we just need it stable per content.
 */
async function contentHashHex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle?.digest) {
    const buf = await subtle.digest('SHA-1', bytes as BufferSource);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return fnv1aHex(bytes);
}

// FNV-1a over the bytes, run with two seeds and concatenated, so the result is
// long enough for the 12-char `?v=` token used by callers. Non-cryptographic —
// fine for cache-busting in insecure-context dev (no Web Crypto).
function fnv1aHex(bytes: Uint8Array): string {
  const hashWithSeed = (seed: number): string => {
    let h = seed >>> 0;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  return hashWithSeed(0x811c9dc5) + hashWithSeed(0x9dc50811);
}

/**
 * Upload one rendered document page (a JPEG blob) to the same path the
 * pdf-render-page edge function used: `<userId>/documents/<docId>/p<page>.jpg`.
 * Returns the content-hashed public URL. Used by the on-device PDF renderer so
 * the document viewer sees the same path scheme regardless of who rendered it.
 */
export async function uploadDocumentPageImage(
  userId: string,
  docId: string,
  page: number,
  blob: Blob,
): Promise<string> {
  const path = `${userId}/documents/${docId}/p${page}.jpg`;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = (await contentHashHex(bytes)).slice(0, 12);

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${hash}`;
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
  variant?: 'crop',
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  const ext = inferExt(file);
  // The full upload lives at `<userId>/<pieceId>.<ext>`. A crop goes to a
  // SEPARATE path (`…-crop.<ext>`) so saving a crop never overwrites the
  // original photo file — the Crop screen can always re-open the full image.
  const base = variant ? `${pieceId}-${variant}` : pieceId;
  const path = `${userId}/${base}.${ext}`;

  // Hash the bytes before upload so the URL we return is content-addressed.
  // Stable bytes ⇒ stable URL ⇒ CDN + service-worker cache hits. Re-cropping
  // to the same rect produces the same hash, so the CDN keeps serving the
  // cached copy instead of treating every save as a fresh URL.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = (await contentHashHex(bytes)).slice(0, 12);

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
  const hash = (await contentHashHex(bytes)).slice(0, 12);

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    upsert: true,
    contentType: 'image/png',
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${hash}`;
}

/**
 * Permanently delete objects from the pieces bucket, given their PUBLIC URLs.
 * Extracts each object's storage path (the part after `/public/<bucket>/`, with
 * the `?v=` cache-bust token stripped). URLs that aren't in this bucket, blank,
 * or null are ignored. Deleting via this Storage API call is the ONLY way to
 * actually free the bytes — a SQL delete of storage.objects orphans the file
 * and you keep paying for it.
 */
export async function removePublicUrls(
  urls: (string | null | undefined)[],
): Promise<void> {
  const marker = `/public/${BUCKET}/`;
  const paths = urls
    .filter((u): u is string => !!u && u.includes(marker))
    .map((u) => u.slice(u.indexOf(marker) + marker.length).split('?')[0]);
  if (paths.length === 0) return;
  // remove() accepts up to 1000 paths; a single passage/document is far under.
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
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
