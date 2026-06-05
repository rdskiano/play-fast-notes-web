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
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
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
  /** Which inputs draw. 'pencilonly' lets a finger still scroll / page. */
  drawingPolicy?: 'default' | 'anyinput' | 'pencilonly';
  /** Pen width in the canvas's OWN pixel space. For a page-resolution canvas
   *  scaled down on screen (the PDF viewer), this must be large or the thin
   *  on-screen stroke renders dotted in the live canvas. Defaults to 3. */
  penWidth?: number;
  /** Fires after each user edit — not the initial restore of `initialData`. */
  onChange?: () => void;
  style?: StyleProp<ViewStyle>;
};

export const PencilCanvas = forwardRef<PencilCanvasHandle, PencilCanvasProps>(
  function PencilCanvas(
    {
      initialData,
      imageUri,
      editable,
      drawingPolicy = 'anyinput',
      penWidth = 3,
      onChange,
      style,
    },
    ref,
  ) {
    const pk = useRef<PencilKitRef>(null);
    // False until the initial restore has settled, so the restore's own
    // drawing-change event isn't reported as a user edit.
    const settled = useRef(false);

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
      settled.current = false;
      // Let the native canvas attach, then restore the saved drawing, select
      // the pencil tool, and pop Apple's tool picker.
      const t = setTimeout(() => {
        if (initialData) pk.current?.loadBase64Data(initialData);
        pk.current?.showToolPicker();
      }, 0);
      // Restoring a drawing fires its own change event — wait it out before
      // treating change events as real user edits.
      const settle = setTimeout(() => {
        settled.current = true;
      }, 350);
      return () => {
        clearTimeout(t);
        clearTimeout(settle);
        settled.current = false;
        pk.current?.hideToolPicker();
      };
    }, [editable, initialData]);

    // Select a solid pen at the given width. Separate from the restore effect
    // so a width change (it settles once the canvas measures its scale) doesn't
    // reload the drawing and wipe unsaved strokes.
    useEffect(() => {
      if (!editable) return;
      const t = setTimeout(() => {
        pk.current?.setTool({ toolType: 'pen', width: penWidth });
      }, 0);
      return () => clearTimeout(t);
    }, [editable, penWidth]);

    const handleDrawingChange = useCallback(() => {
      if (settled.current) onChange?.();
    }, [onChange]);

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
        drawingPolicy={drawingPolicy}
        onCanvasViewDrawingDidChange={handleDrawingChange}
      />
    );
  },
);
