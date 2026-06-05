// Add a standalone photo passage on-device (native), local-first.
//
// A photo passage is a single picture of a passage — NOT a multi-page document.
// It's a `pieces` row with document_id null and source_kind 'image'; its photo
// IS the passage. Save the image into the sandbox, insert the passage locally,
// and — when signed in — upload the image + insert the row in Supabase so it
// shows on the web too. Mirrors the web "add a passage" flow (upload.web.tsx).

import { File } from 'expo-file-system';

import { insertPassage } from '@/lib/db/repos/passages';
import { persistPassageImage } from '@/lib/image/persistPassageImage';
import { supabase } from '@/lib/supabase/client';

const BUCKET = 'pieces';

function newPassageId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type AddPhotoResult = { passageId: string; synced: boolean };

export async function addPhotoPassage(opts: {
  /** Local file:// URI of the chosen / captured photo. */
  imageUri: string;
  title?: string;
  folderId?: string | null;
  onProgress?: (line: string) => void;
}): Promise<AddPhotoResult> {
  const { imageUri, title = '', folderId = null, onProgress } = opts;
  const id = newPassageId();
  const cleanTitle = title.trim() || 'Untitled';

  // 1. Copy the photo into the sandbox (pieces/<id>.jpg).
  onProgress?.('Saving photo…');
  const localUri = await persistPassageImage(id, imageUri);

  // 2. Local SQLite passage — the device's source of truth.
  await insertPassage({
    id,
    title: cleanTitle,
    source_kind: 'image',
    source_uri: localUri,
    thumbnail_uri: localUri,
    folder_id: folderId,
    document_id: null,
  });

  // 3. Best-effort cloud sync — upload the image + insert the row.
  let synced = false;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      onProgress?.('Saved on this device. (Sign in to sync to the web.)');
      return { passageId: id, synced: false };
    }

    onProgress?.('Syncing to your account…');
    const userId = session.user.id;
    const path = `${userId}/${id}.jpg`;
    const bytes = await new File(localUri).bytes();
    const up = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (up.error) throw up.error;
    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    const now = Date.now();
    // user_id omitted — defaults to auth.uid() under RLS.
    const { error } = await supabase.from('pieces').insert({
      id,
      title: cleanTitle,
      source_kind: 'image',
      source_uri: publicUrl,
      thumbnail_uri: publicUrl,
      folder_id: folderId,
      created_at: now,
      updated_at: now,
    });
    if (error) throw error;

    synced = true;
    onProgress?.('Synced to the web ✓');
  } catch (e) {
    onProgress?.(`Saved on this device; cloud sync failed: ${(e as Error).message}`);
  }

  return { passageId: id, synced };
}
