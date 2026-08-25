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
  /** Step back the most recent stroke (PencilKit's own undo). */
  undo(): void;
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
  /** Starting pen ink for the session; null/undefined = PencilKit's default.
   *  Changing it mid-session recolors the pen (a swatch tap). */
  inkColor?: string | null;
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
      inkColor,
      style,
    },
    ref,
  ) {
    const pk = useRef<PencilKitRef>(null);
    // Read via ref inside the once-per-session tool init so a late-loading
    // saved ink doesn't re-trigger that effect.
    const inkRef = useRef(inkColor);
    inkRef.current = inkColor;
    // False until the initial restore has settled, so the restore's own
    // drawing-change events aren't reported as user edits. The settle deadline
    // is ADAPTIVE: restoring a large drawing can emit change events well past
    // any fixed delay, and one leaked event marks the session dirty — which
    // used to fire a pointless auto-save (and its error alert) before the
    // user had drawn anything. Every pre-settle change event pushes the
    // deadline out; we settle only once the restore has gone quiet.
    const settled = useRef(false);
    const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const armSettle = useCallback((ms: number) => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        settleTimer.current = null;
        settled.current = true;
      }, ms);
    }, []);

    useImperativeHandle(ref, () => ({
      async export() {
        const data = (await pk.current?.getBase64Data()) ?? '';
        // The native module REJECTS the PNG export for a stroke-free drawing
        // (UIImagePNGRepresentation of a zero-size image is nil). An empty
        // drawing is a legitimate state — the user erased every mark — so
        // treat "no PNG" as "no image", not as a failure.
        let png = '';
        try {
          png = (await pk.current?.getBase64PngData({ scale: 0 })) ?? '';
        } catch {
          png = '';
        }
        return { data, png };
      },
      clear() {
        pk.current?.clear();
      },
      undo() {
        (pk.current as unknown as { undo?: () => void } | null)?.undo?.();
      },
    }));

    // Restore the saved drawing ONCE per edit session. Reloading whenever
    // `initialData` changes was the bug: the idle auto-save updates the saved
    // data mid-session, and reloading that snapshot while the user is still
    // drawing/erasing reverts their in-progress strokes (a long erase scribble
    // "popped the old marks back"). Load on entry; ignore later changes.
    const loadedRef = useRef(false);
    useEffect(() => {
      if (!editable) {
        loadedRef.current = false;
        settled.current = false;
        if (settleTimer.current) {
          clearTimeout(settleTimer.current);
          settleTimer.current = null;
        }
        pk.current?.hideToolPicker();
        return;
      }
      if (loadedRef.current) return;
      settled.current = false;
      const t = setTimeout(() => {
        if (initialData) pk.current?.loadBase64Data(initialData);
        pk.current?.showToolPicker();
        loadedRef.current = true;
      }, 0);
      // Restoring a drawing fires its own change events — wait for them to go
      // quiet before treating change events as real user edits (each pre-settle
      // event re-arms this deadline; see handleDrawingChange).
      armSettle(400);
      return () => {
        clearTimeout(t);
        if (settleTimer.current) {
          clearTimeout(settleTimer.current);
          settleTimer.current = null;
        }
      };
    }, [editable, initialData, armSettle]);

    // Select a solid pen ONCE per edit session — then leave the tool alone so
    // the user's own picks (eraser, a different colour/width) stick. Re-setting
    // on every penWidth recompute was silently flipping the eraser back to pen,
    // so erasing "sometimes didn't work".
    const toolInit = useRef(false);
    useEffect(() => {
      if (!editable) {
        toolInit.current = false;
        return;
      }
      if (toolInit.current) return;
      const t = setTimeout(() => {
        pk.current?.setTool({
          toolType: 'pen',
          width: penWidth,
          ...(inkRef.current ? { color: inkRef.current } : null),
        });
        toolInit.current = true;
      }, 0);
      return () => clearTimeout(t);
    }, [editable, penWidth]);

    // Recolor the pen when the remembered ink arrives or a swatch is tapped.
    // Deliberately keyed on inkColor alone — re-running on penWidth would
    // reintroduce the eraser-flips-back-to-pen bug the once-guard fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
      if (!editable || !toolInit.current || !inkColor) return;
      pk.current?.setTool({ toolType: 'pen', width: penWidth, color: inkColor });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inkColor]);

    const handleDrawingChange = useCallback(() => {
      if (!settled.current) {
        // Still restoring — this event is the load itself, not a user edit.
        // Push the settle deadline out so a long restore never leaks events.
        armSettle(400);
        return;
      }
      onChange?.();
    }, [onChange, armSettle]);

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
