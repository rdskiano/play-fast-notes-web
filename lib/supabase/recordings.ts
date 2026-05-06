import { supabase } from './client';

const BUCKET = 'recordings';

/**
 * Upload an audio recording to the recordings bucket under the current user's
 * folder. Returns the public URL of the uploaded file.
 *
 * Path scheme: `<user_id>/<recording_id>.<ext>`. The extension is derived
 * from the blob's mime type so iOS Safari (which produces audio/mp4) and
 * Chrome (which produces audio/webm) both end up at a URL whose extension
 * matches the actual container — without that match, iOS refuses to play.
 *
 * RLS policies on the bucket scope writes to the owner; reads are public so
 * an inline `<audio>` tag in the practice log can play the clip without
 * juggling auth headers.
 */
export async function uploadRecording(
  recordingId: string,
  file: Blob,
  extOverride?: string,
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  const ext = extOverride ?? inferExtFromMime(file.type);
  const path = `${userId}/${recordingId}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || `audio/${ext}`,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function inferExtFromMime(mime: string): string {
  // Strip any codec suffix: "audio/webm;codecs=opus" → "audio/webm".
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  if (base.includes('webm')) return 'webm';
  if (base.includes('ogg')) return 'ogg';
  if (base.includes('mp4') || base.includes('aac')) return 'm4a';
  if (base.includes('mpeg')) return 'mp3';
  if (base.includes('wav')) return 'wav';
  return 'webm';
}

/**
 * Delete a recording from storage. Caller is responsible for also removing
 * the practice_log entry (or its data_json.recording_uri) — this function
 * just removes the file.
 *
 * Pass the public URL stored in `data_json.recording_uri`. We extract the
 * `<userId>/<recordingId>.<ext>` path from it to call storage.remove().
 */
export async function deleteRecording(publicUrl: string): Promise<void> {
  // publicUrl format: <project>/storage/v1/object/public/recordings/<path>
  const marker = `/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return;
  const path = publicUrl.slice(idx + marker.length).split('?')[0];
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export function newRecordingId(): string {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
