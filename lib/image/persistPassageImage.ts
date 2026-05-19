// Native (iOS/Android): persist a cropped image to documents/pieces/<id>.jpg
// and return the file:// URI to store in pieces.source_uri.

import { Directory, File, Paths } from 'expo-file-system';

export async function persistPassageImage(passageId: string, uri: string): Promise<string> {
  const piecesDir = new Directory(Paths.document, 'pieces');
  if (!piecesDir.exists) piecesDir.create({ intermediates: true });
  const target = new File(piecesDir, `${passageId}.jpg`);
  const source = new File(uri);
  const b64 = await source.base64();
  if (target.exists) target.delete();
  target.create();
  target.write(b64, { encoding: 'base64' });
  return target.uri;
}
