// A score-annotation layer that sizes itself to the score. Drop it as an
// absolute-fill child of a score's container: it measures that container,
// learns the score image's aspect ratio, computes the letterboxed draw rect,
// and renders the PencilKit canvas (edit) or the saved PNG (view) exactly
// over the score. Used by the useScoreAnnotation hook.

import { Image } from 'expo-image';
import { type RefObject, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { PencilCanvas, type PencilCanvasHandle } from '@/components/PencilCanvas';

export function AnnotationCanvas({
  scoreUri,
  editable,
  initialData,
  imageUri,
  canvasRef,
}: {
  scoreUri: string;
  editable: boolean;
  initialData?: string | null;
  imageUri?: string | null;
  canvasRef: RefObject<PencilCanvasHandle | null>;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState(0);

  const drawn =
    box.w > 0 && box.h > 0 && aspect > 0
      ? drawnRect(box.w, box.h, aspect)
      : null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={editable ? 'auto' : 'none'}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setBox({ w: width, h: height });
      }}>
      {/* Hidden — loaded only to read the score's intrinsic aspect ratio. */}
      <Image
        source={{ uri: scoreUri }}
        style={styles.probe}
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width > 0 && height > 0) setAspect(width / height);
        }}
      />
      {drawn && (
        <PencilCanvas
          ref={canvasRef}
          editable={editable}
          initialData={initialData}
          imageUri={imageUri}
          style={{
            position: 'absolute',
            left: drawn.ox,
            top: drawn.oy,
            width: drawn.w,
            height: drawn.h,
          }}
        />
      )}
    </View>
  );
}

// The letterboxed rect of a `contain`-fit image of the given aspect inside a box.
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

const styles = StyleSheet.create({
  probe: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
