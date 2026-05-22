// Shows one passage's slice of a PDF page's Apple Pencil annotation. The page
// annotation PNG covers the whole page; this crops it to the passage's region
// box and sizes that slice to the passage's score view — so a fingering drawn
// on the PDF shows up (read-only) when practicing the passage. Drop it as an
// absolute-fill child of the score's container.

import { Image } from 'expo-image';
import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

export function CroppedAnnotation({
  imageUri,
  region,
  pageW,
  pageH,
}: {
  imageUri: string;
  region: { x: number; y: number; w: number; h: number };
  pageW: number;
  pageH: number;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });

  const aspect = region.h > 0 ? region.w / region.h : 0;
  const drawn =
    box.w > 0 && box.h > 0 && aspect > 0
      ? drawnRect(box.w, box.h, aspect)
      : null;

  // The passage's box as a fraction of the full page.
  const fx = pageW > 0 ? region.x / pageW : 0;
  const fy = pageH > 0 ? region.y / pageH : 0;
  const fw = pageW > 0 ? region.w / pageW : 0;
  const fh = pageH > 0 ? region.h / pageH : 0;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setBox({ w: width, h: height });
      }}>
      {drawn && fw > 0 && fh > 0 && (
        // Clip to the passage's score rect; oversize + offset the page PNG so
        // that just the passage's box fills the rect.
        <View
          style={{
            position: 'absolute',
            left: drawn.ox,
            top: drawn.oy,
            width: drawn.w,
            height: drawn.h,
            overflow: 'hidden',
          }}>
          <Image
            source={{ uri: imageUri }}
            style={{
              position: 'absolute',
              width: drawn.w / fw,
              height: drawn.h / fh,
              left: -fx * (drawn.w / fw),
              top: -fy * (drawn.h / fh),
            }}
            contentFit="fill"
          />
        </View>
      )}
    </View>
  );
}

// The letterboxed rect of a `contain`-fit image of the given aspect in a box.
function drawnRect(boxW: number, boxH: number, aspect: number) {
  let w: number;
  let h: number;
  if (boxW / boxH > aspect) {
    h = boxH;
    w = h * aspect;
  } else {
    w = boxW;
    h = w / aspect;
  }
  return { w, h, ox: (boxW - w) / 2, oy: (boxH - h) / 2 };
}
