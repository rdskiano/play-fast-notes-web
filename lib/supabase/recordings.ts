import { File } from 'expo-file-system';

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
  if (idx < 0) {
    // Either a malformed URL or an old schema we no longer know how to
    // address. Warn loudly — a silent return would orphan the file in
    // storage forever with no diagnostic trail. Callers can still treat
    // this as a soft failure (the practice_log row gets removed anyway).
    console.warn(
      '[recordings] deleteRecording: unrecognised URL, skipping storage remove',
      publicUrl,
    );
    return;
  }
  const path = publicUrl.slice(idx + marker.length).split('?')[0];
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export function newRecordingId(): string {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Where a saved recording is filed in the practice log. */
export type RecordingTarget =
  | { passageId: string }
  | { documentId: string };

/**
 * Save a finished recording: upload the audio to Supabase Storage and write a
 * `'recording'` entry into the Supabase `practice_log`. The entry attaches to
 * a passage, or to a whole document when recorded from the PDF viewer (which
 * has no single passage). It's written straight to Supabase (not the local
 * SQLite log) so a recording made on the iPad shows up in the practice log on
 * the web app too.
 *
 * `fileUri` is a local `file://` URI from expo-audio's recorder.
 */
export async function saveRecording(
  target: RecordingTarget,
  fileUri: string,
  durationSec: number,
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  // Read the recording's bytes directly. `fetch(fileUri).blob()` yields a
  // zero-length blob in React Native, which would silently upload an empty
  // file — the recording would look saved but play back as silence.
  const bytes = await new File(fileUri).bytes();
  if (bytes.length === 0) throw new Error('Recording is empty.');

  const recordingId = newRecordingId();
  const path = `${userId}/${recordingId}.m4a`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'audio/mp4', upsert: false });
  if (uploadError) throw uploadError;
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error } = await supabase.from('practice_log').insert({
    piece_id: 'passageId' in target ? target.passageId : null,
    document_id: 'documentId' in target ? target.documentId : null,
    strategy: 'recording',
    practiced_at: Date.now(),
    data_json: JSON.stringify({
      recording_uri: pub.publicUrl,
      recording_id: recordingId,
      duration_seconds: Math.round(durationSec),
    }),
  });
  if (error) throw error;
}
