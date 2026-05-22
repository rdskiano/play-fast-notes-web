// The editable Apple Pencil canvas for a page-based annotation — a PDF page,
// or a passage cropped from one. The PencilKit canvas is pinned to the page's
// NATIVE pixel dimensions, so a drawing keeps the same coordinates no matter
// which screen, size, or orientation edited it. It's then visually scaled
// (and, for a passage, clipped) so the chosen `region` fills the score view:
// a passage's crop box, or the whole page for the PDF viewer.

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
  /** The part of the page to show — a passage box, or the whole page. */
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
  // Page pixels -> on-screen points, sized so the region fills the score rect.
  const scale = drawn && region.w > 0 ? drawn.w / region.w : 0;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setBox({ w: width, h: height });
      }}>
      {drawn && scale > 0 && (
        // Clip to the passage's score rect.
        <View
          style={{
            position: 'absolute',
            left: drawn.ox,
            top: drawn.oy,
            width: drawn.w,
            height: drawn.h,
            overflow: 'hidden',
          }}>
          {/* The canvas is the WHOLE page at native pixel size; scaled from
              its top-left corner and offset so the region shows in the clip.
              The PencilKit drawing therefore always lives in page pixels. */}
          <View
            style={{
              position: 'absolute',
              left: -region.x * scale,
              top: -region.y * scale,
              width: pageW,
              height: pageH,
              transformOrigin: '0% 0%',
              transform: [{ scale }],
            }}>
            <PencilCanvas
              ref={canvasRef}
              editable
              initialData={pageData}
              style={StyleSheet.absoluteFill}
            />
          </View>
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
