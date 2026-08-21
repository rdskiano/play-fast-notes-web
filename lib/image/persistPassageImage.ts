// Native (iOS/Android): persist a cropped image to documents/pieces/ and
// return the file:// URI to store in pieces.source_uri.
//
// The filename carries a per-save timestamp (`<id>-<ts>.jpg`), never the bare
// `<id>.jpg`. Both expo-image and RN Image cache decoded bitmaps by URI — and
// expo-image's disk cache survives relaunches — so overwriting the same path
// after a passage resize left every screen rendering the stale crop (and the
// ICU spot picker misplacing marks: tap geometry measured the new file while
// the display drew the cached old one). A fresh name per save makes staleness
// impossible; prior files for the same passage are deleted so re-crops don't
// accumulate in the sandbox.

import { Directory, File, Paths } from 'expo-file-system';

export async function persistPassageImage(passageId: string, uri: string): Promise<string> {
  const piecesDir = new Directory(Paths.document, 'pieces');
  if (!piecesDir.exists) piecesDir.create({ intermediates: true });
  const source = new File(uri);
  const b64 = await source.base64();
  // Drop prior saves for this passage: legacy `<id>.jpg`, import-path
  // `<id>-src.*`/`<id>-thumb.*`, crop-flow `<id>.<ts>[.thumb].jpg`, and older
  // `<id>-<ts>.jpg`. The `<id>.`/`<id>-` prefixes can't hit another passage's
  // files because ids never nest. `<id>.original.jpg` is the photo-crop flow's
  // preserved full photo — never delete it.
  try {
    for (const entry of piecesDir.list()) {
      if (!(entry instanceof File)) continue;
      const isOurs =
        entry.name.startsWith(`${passageId}.`) || entry.name.startsWith(`${passageId}-`);
      if (isOurs && entry.name !== `${passageId}.original.jpg`) {
        entry.delete();
      }
    }
  } catch {
    // Cleanup is best-effort — an orphaned file is cosmetic and must not
    // block saving the new crop.
  }
  const target = new File(piecesDir, `${passageId}-${Date.now()}.jpg`);
  target.create();
  target.write(b64, { encoding: 'base64' });
  return target.uri;
}
