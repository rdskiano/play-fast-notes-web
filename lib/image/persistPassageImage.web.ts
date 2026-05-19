// Web: upload a cropped image (blob: URL) to Supabase Storage and return
// the public URL to store in pieces.source_uri.

import { uploadPassageImage } from '@/lib/supabase/storage';

export async function persistPassageImage(passageId: string, blobUri: string): Promise<string> {
  const res = await fetch(blobUri);
  const blob = await res.blob();
  const file = new File([blob], `${passageId}.jpg`, { type: 'image/jpeg' });
  return uploadPassageImage(passageId, file);
}
