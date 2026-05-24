// A score-annotation layer that sizes itself to the score. Drop it as an
// absolute-fill child of a score's container: it measures that container,
// learns the score image's aspect ratio, computes the letterboxed draw rect,
// and renders the PencilKit canvas (edit) or the saved PNG (view) exactly
// over the score. Used by the useScoreAnnotation / useDocumentAnnotation hooks.

import { Image } from 'expo-image';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';

import { PencilCanvas, type PencilCanvasHandle } from '@/components/PencilCanvas';

export function AnnotationCanvas({
  scoreUri,
  editable,
  initialData,
  imageUri,
  canvasRef,
  aspect: aspectProp,
  drawingPolicy,
  onChange,
}: {
  scoreUri: string;
  editable: boolean;
  initialData?: string | null;
  imageUri?: string | null;
  canvasRef?: RefObject<PencilCanvasHandle | null>;
  /** Explicit score aspect (w / h). When omitted, the score is probed. */
  aspect?: number;
  drawingPolicy?: 'default' | 'anyinput' | 'pencilonly';
  /** Fires after each user edit. */
  onChange?: () => void;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [probedAspect, setProbedAspect] = useState(0);
  const aspect = aspectProp ?? probedAspect;
  const viewRef = useRef<View | null>(null);

  // Web: RN-Web's `onLayout` doesn't report dimensions for absolute-filled
  // Views (the DOM node IS sized via top/right/bottom/left:0 in a relative
  // parent, but the layout callback fires with 0×0). Measure via a
  // ResizeObserver on the underlying DOM node instead so `box` reflects
  // reality and `drawn` is computed.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = viewRef.current as unknown as HTMLElement | null;
    if (!node) return;
    function measure() {
      const r = node!.getBoundingClientRect();
      setBox((prev) =>
        prev.w === r.width && prev.h === r.height
          ? prev
          : { w: r.width, h: r.height },
      );
    }
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const drawn =
    box.w > 0 && box.h > 0 && aspect > 0
      ? drawnRect(box.w, box.h, aspect)
      : null;

  return (
    <View
      ref={viewRef}
      style={StyleSheet.absoluteFill}
      pointerEvents={editable ? 'auto' : 'none'}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setBox({ w: width, h: height });
      }}>
      {aspectProp === undefined && (
        // Hidden — loaded only to read the score's intrinsic aspect ratio.
        <Image
          source={{ uri: scoreUri }}
          style={styles.probe}
          onLoad={(e) => {
            const { width, height } = e.source;
            if (width > 0 && height > 0) setProbedAspect(width / height);
          }}
        />
      )}
      {drawn && (
        <PencilCanvas
          ref={canvasRef}
          editable={editable}
          initialData={initialData}
          imageUri={imageUri}
          drawingPolicy={drawingPolicy}
          onChange={onChange}
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
