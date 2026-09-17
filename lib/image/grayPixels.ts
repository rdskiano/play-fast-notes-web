// Native: a passage photo as grayscale pixels, for the staff-line reader
// (lib/image/staffSystems.ts). ImageManipulator shrinks it and writes a JPEG;
// jpeg-js (pure JS, so OTA-safe) decodes the bytes. Web sibling uses a canvas.

import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { Image } from 'react-native';

import { ensureLocalFile } from '@/lib/image/canvasCrop';

export type GrayPixels = { gray: Uint8Array; width: number; height: number };

function getImageWidth(uri: string): Promise<number> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width) => resolve(width),
      (e) => reject(e instanceof Error ? e : new Error('Could not read that photo.')),
    );
  });
}

export async function loadGrayPixels(uri: string, maxWidth: number): Promise<GrayPixels> {
  const local = await ensureLocalFile(uri);
  const width = await getImageWidth(local);
  const result = await ImageManipulator.manipulateAsync(
    local,
    width > maxWidth ? [{ resize: { width: maxWidth } }] : [],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
  );
  const bytes = await new File(result.uri).bytes();
  const img = decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { gray: toGray(img.data, img.width * img.height), width: img.width, height: img.height };
}

function toGray(rgba: Uint8Array, n: number): Uint8Array {
  const gray = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    gray[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  }
  return gray;
}
