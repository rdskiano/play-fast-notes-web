import * as ImageManipulator from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ImportedImage = {
  id: string;
  source_uri: string;
  thumbnail_uri: string;
};

export async function importImage(sourceUri: string): Promise<ImportedImage> {
  const id = newId();

  const piecesDir = new Directory(Paths.document, 'pieces');
  if (!piecesDir.exists) piecesDir.create({ intermediates: true });

  const ext = sourceUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext) ? ext : 'jpg';
  const dest = new File(piecesDir, `${id}.${safeExt}`);

  const src = new File(sourceUri);
  src.copy(dest);

  const thumb = await ImageManipulator.manipulateAsync(
    dest.uri,
    [{ resize: { width: 400 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );
  const thumbDest = new File(piecesDir, `${id}.thumb.jpg`);
  const thumbSrc = new File(thumb.uri);
  thumbSrc.copy(thumbDest);

  return { id, source_uri: dest.uri, thumbnail_uri: thumbDest.uri };
}
