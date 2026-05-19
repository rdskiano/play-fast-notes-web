// Native (iOS/Android) image manipulation. Same export shape as canvasCrop.web.ts
// so cross-platform code can import either via Metro's platform resolution.
//
// Web-only Blob-based functions (loadImage, cropToBlob, cropImageToBlob, and the
// Blob-based stitchVertically) exist as throw-stubs here so TypeScript imports
// resolve. They're never reached at runtime because no iOS caller invokes them.
//
// The CROSS-PLATFORM API is `cropImage(uri, rect) → uri` and
// `stitchVerticallyUris(uris) → uri`. URIs are file:// on iOS, blob: on web.

import * as ImageManipulator from 'expo-image-manipulator';

import { stitchOnHost } from '@/components/StitchHost';

export type Rect = { x: number; y: number; w: number; h: number };

export async function loadImage(_url: string): Promise<HTMLImageElement> {
  throw new Error('loadImage() is web-only. On iOS use cropImage(uri, rect).');
}

export async function cropToBlob(_imageUrl: string, _area: Rect): Promise<Blob> {
  throw new Error('cropToBlob() is web-only. On iOS use cropImage(uri, rect).');
}

export async function cropImageToBlob(
  _img: HTMLImageElement,
  _area: Rect,
): Promise<Blob> {
  throw new Error('cropImageToBlob() is web-only. On iOS use cropImage(uri, rect).');
}

export async function stitchVertically(_blobs: Blob[]): Promise<Blob> {
  throw new Error(
    'stitchVertically(blobs) is web-only. On iOS use stitchVerticallyUris(uris).',
  );
}

// Crop a region of a source image (by file:// URI) to a new JPEG file. Coords
// are in the source image's natural pixel space. Returns the URI of the
// cropped JPEG (lives in expo's cache dir).
export async function cropImage(uri: string, area: Rect): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      {
        crop: {
          originX: Math.round(area.x),
          originY: Math.round(area.y),
          width: Math.round(area.w),
          height: Math.round(area.h),
        },
      },
    ],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

// Multi-page stitching on iOS uses react-native-view-shot via the
// <StitchHost /> rendered in app/_layout.tsx. N=1 short-circuits to
// avoid the extra capture roundtrip. See components/StitchHost.tsx.
export async function stitchVerticallyUris(uris: string[]): Promise<string> {
  if (uris.length === 0) throw new Error('stitchVerticallyUris: empty input');
  if (uris.length === 1) return uris[0];
  return stitchOnHost(uris);
}

export function displayToSource(rect: Rect, displayW: number, sourceW: number): Rect {
  const k = sourceW / displayW;
  return {
    x: Math.round(rect.x * k),
    y: Math.round(rect.y * k),
    w: Math.round(rect.w * k),
    h: Math.round(rect.h * k),
  };
}

export function sourceToDisplay(rect: Rect, sourceW: number, displayW: number): Rect {
  const k = displayW / sourceW;
  return {
    x: rect.x * k,
    y: rect.y * k,
    w: rect.w * k,
    h: rect.h * k,
  };
}
