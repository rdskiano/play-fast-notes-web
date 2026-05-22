// The editable Apple Pencil canvas for a passage cropped from a PDF page.
// The PencilKit canvas is the WHOLE page — so strokes land in page
// coordinates and become part of the page's annotation — but it's oversized
// and offset inside a clip so only the passage's region box is visible and
// drawable. Geometry mirrors CroppedAnnotation (its inverse).

import { type RefObject, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { PencilCanvas, type PencilCanvasHandle } from '@/components/PencilCanvas';

export function RegionAnnotationCanvas({
  pageData,
  region,
  pageW,
  pageH,
  canvasRef,
}: {
  /** The PDF page's PencilKit drawing (base64) to keep editing. */
  pageData: string | null;
  region: { x: number; y: number; w: number; h: number };
  pageW: number;
  pageH: number;
  canvasRef: RefObject<PencilCanvasHandle | null>;
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
      pointerEvents="box-none"
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setBox({ w: width, h: height });
      }}>
      {drawn && fw > 0 && fh > 0 && (
        // Clip to the passage's score rect; the page-sized canvas is offset so
        // just the passage's box shows through and is drawable.
        <View
          style={{
            position: 'absolute',
            left: drawn.ox,
            top: drawn.oy,
            width: drawn.w,
            height: drawn.h,
            overflow: 'hidden',
          }}>
          <PencilCanvas
            ref={canvasRef}
            editable
            initialData={pageData}
            style={{
              position: 'absolute',
              width: drawn.w / fw,
              height: drawn.h / fh,
              left: -fx * (drawn.w / fw),
              top: -fy * (drawn.h / fh),
            }}
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
