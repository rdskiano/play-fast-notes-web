// Apple Pencil annotation canvas (iOS). In edit mode it mounts a live
// PencilKit canvas with Apple's tool picker; in view mode it shows the saved
// flattened PNG. The web sibling (PencilCanvas.web.tsx) is view-only.
//
// The canvas is transparent so the score behind it shows through. That is
// done in native code — see patches/react-native-pencil-kit+1.2.3.patch —
// because the library's backgroundColor / isOpaque props skip any value
// equal to their zero default and so can't deliver transparency. The
// `isOpaque={false}` below only stops the library's JS default (true) from
// re-opaquing the patched canvas.

import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import PencilKitView, { type PencilKitRef } from 'react-native-pencil-kit';

export type PencilCanvasHandle = {
  /** Pull the drawing out: editable PencilKit blob + flattened PNG (base64). */
  export(): Promise<{ data: string; png: string }>;
  /** Erase the whole drawing. */
  clear(): void;
};

export type PencilCanvasProps = {
  /** base64 PencilKit blob to keep editing (edit mode). */
  initialData?: string | null;
  /** PNG URL of the saved annotation (view mode). */
  imageUri?: string | null;
  /** true = live drawing canvas; false = static display of the saved PNG. */
  editable: boolean;
  style?: StyleProp<ViewStyle>;
};

export const PencilCanvas = forwardRef<PencilCanvasHandle, PencilCanvasProps>(
  function PencilCanvas({ initialData, imageUri, editable, style }, ref) {
    const pk = useRef<PencilKitRef>(null);

    useImperativeHandle(ref, () => ({
      async export() {
        const data = (await pk.current?.getBase64Data()) ?? '';
        const png = (await pk.current?.getBase64PngData({ scale: 0 })) ?? '';
        return { data, png };
      },
      clear() {
        pk.current?.clear();
      },
    }));

    useEffect(() => {
      if (!editable) return;
      // Let the native canvas attach, then restore the saved drawing and
      // pop Apple's tool picker.
      const t = setTimeout(() => {
        if (initialData) pk.current?.loadBase64Data(initialData);
        pk.current?.showToolPicker();
      }, 0);
      return () => {
        clearTimeout(t);
        pk.current?.hideToolPicker();
      };
    }, [editable, initialData]);

    if (!editable) {
      if (!imageUri) return null;
      return (
        <View style={style} pointerEvents="none">
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
          />
        </View>
      );
    }

    return (
      <PencilKitView
        ref={pk}
        style={style}
        backgroundColor="transparent"
        isOpaque={false}
        alwaysBounceVertical={false}
        alwaysBounceHorizontal={false}
        drawingPolicy="anyinput"
      />
    );
  },
);
