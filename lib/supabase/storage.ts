import { supabase } from './client';

const BUCKET = 'pieces';

/**
 * Upload an image file to the pieces bucket under the current user's folder.
 * Returns the public URL of the uploaded file.
 *
 * Path scheme: `<user_id>/<piece_id>.<ext>`. RLS policies in Supabase ensure
 * only the owning user can write to their own folder.
 */
export async function uploadPieceImage(
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
  return data.publicUrl;
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
