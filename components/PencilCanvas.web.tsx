// Web Apple-Pencil-equivalent annotation canvas. Edit mode mounts a real
// drawing surface — Pointer Events for input (so Apple Pencil in iPad
// Safari, Surface Pen, mouse, and finger all work) and perfect-freehand for
// pressure-aware stroke geometry. View mode (and the default on screens with
// no edit access) shows the saved flattened PNG, same as the original web
// stub did.
//
// **Save behavior — additive vs. the iPad's full edit.** The iPad's
// PencilKit canvas loads the editable `data` blob and lets the user erase
// or modify previous strokes. The web has no way to re-hydrate that
// proprietary blob, so we treat the previous PNG as a fixed background and
// only let new strokes go ON TOP. On export the canvas is composited with
// the previous PNG and flattened to a new PNG. Net effect: web users can
// add marks but not remove them — the right tradeoff per CLAUDE.md's
// "Pencil is a stylus-surface feature" rule (the iPad remains the source
// of truth for fine editing).
//
// We always return `data: ''` from export — `Annotation.data` is nullable
// in the schema, and `saveAnnotation` writes `data ?? null`. So a web-saved
// annotation has only the flattened PNG; if the same passage is later
// opened on iPad, the iPad falls through to view-mode-only display since
// there's no PencilKit blob to load. Marks roundtrip correctly visually
// even though the iPad can't re-edit them.

import { Image } from 'expo-image';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStroke } from 'perfect-freehand';

import { ThemedText } from '@/components/themed-text';

export type PencilCanvasHandle = {
  /** Returns `{ data: '', png }` — web has no editable native blob.
   *  `png` is a base64 string of the flattened PNG (previous marks +
   *  newly-drawn strokes, composited). */
  export(): Promise<{ data: string; png: string }>;
  clear(): void;
  /** Pop the most recent stroke from the current edit session. */
  undo(): void;
};

export type PencilCanvasProps = {
  /** Ignored on web — there's no editable PencilKit blob to restore. */
  initialData?: string | null;
  /** PNG URL of the existing flattened drawing. Shown underneath new
   *  strokes in edit mode (so additions are visible alongside iPad marks)
   *  and as the only content in view mode. */
  imageUri?: string | null;
  editable: boolean;
  /** Honored for parity with the native signature; web treats any pointer
   *  as draw-capable (the stylus gate happens at the tab level, not here). */
  drawingPolicy?: 'default' | 'anyinput' | 'pencilonly';
  onChange?: () => void;
  style?: StyleProp<ViewStyle>;
};

// perfect-freehand options tuned to feel close to PencilKit's default pencil:
// medium weight, pressure-driven thinning, soft tapered ends.
const STROKE_OPTIONS = {
  size: 4,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
  easing: (t: number) => t,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
  simulatePressure: true,
};

const STROKE_COLOR = '#1a1a1a';

type Stroke = {
  points: number[][];
  color: string;
};

export const PencilCanvas = forwardRef<PencilCanvasHandle, PencilCanvasProps>(
  function PencilCanvas(
    { imageUri, editable, onChange, style },
    ref,
  ) {
    // Keep the undo button clear of a landscape phone's side notch.
    const insets = useSafeAreaInsets();
    const containerRef = useRef<View | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const bgImgRef = useRef<HTMLImageElement | null>(null);
    const [bgLoaded, setBgLoaded] = useState(false);
    // Tracks whether a bg image is currently being downloaded. We use this to
    // block draw events while the saved annotation is still loading — if a
    // user drew on the (briefly) blank canvas after entering edit mode and
    // then saved, the upload would replace the previous marks with just
    // their new ones.
    const bgPendingRef = useRef(false);

    // Live drawing state.
    const strokesRef = useRef<Stroke[]>([]);
    const currentRef = useRef<Stroke | null>(null);
    const activePointerRef = useRef<number | null>(null);
    // Canvas pixel size — kept on a ref so the redraw loop doesn't re-render.
    const sizeRef = useRef({ w: 0, h: 0 });
    // Stroke count drives the undo button's enabled state. Mirrored from the
    // ref via `setStrokeCount(strokesRef.current.length)` after every mutation
    // so React can re-render the button when there's (no) anything to undo.
    const [strokeCount, setStrokeCount] = useState(0);

    // Load the background PNG once per imageUri so the redraw can composite it
    // under new strokes during edit mode and produce a complete export.
    useEffect(() => {
      if (!imageUri) {
        bgImgRef.current = null;
        setBgLoaded(false);
        bgPendingRef.current = false;
        return;
      }
      bgPendingRef.current = true;
      let cancelled = false;
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        // Atomic swap: only replace bgImgRef once the new image is fully
        // loaded. This (combined with the cleanup below) means bgImgRef
        // never goes null mid-edit when the auto-save updates imageUri.
        bgImgRef.current = img;
        setBgLoaded(true);
        bgPendingRef.current = false;
        redraw();
      };
      img.onerror = () => {
        if (cancelled) return;
        bgPendingRef.current = false;
        // Keep whatever bg was previously loaded; don't blank the canvas
        // because of a transient network failure.
      };
      img.src = imageUri;
      return () => {
        // Keep the previously-loaded bg in the ref across imageUri changes.
        // `cancelled` ensures the old load can't overwrite a newer one;
        // the new load swaps `bgImgRef` atomically when complete. Avoids
        // a "blank canvas" window in two cases:
        //   1. Auto-save mid-edit: imageUri gets a new cache-buster every
        //      2.5 s of idle time; clearing here would wipe the previous
        //      marks if the user drew and saved before the new image
        //      downloaded.
        //   2. Edit-exit → quick re-entry: the post-save image may not
        //      have downloaded yet by the time the user taps PENCIL
        //      again; the still-loaded prior bg keeps the previous marks
        //      visible as a baseline for new strokes.
        // The component unmounts on navigation, so stale bg doesn't leak
        // across passages.
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageUri]);

    // Wipe and re-render: background PNG (if any) then every stroke.
    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) return;
      ctx.clearRect(0, 0, w, h);
      const bg = bgImgRef.current;
      if (bg && bg.naturalWidth > 0) {
        ctx.drawImage(bg, 0, 0, w, h);
      }
      for (const stroke of strokesRef.current) {
        drawStroke(ctx, stroke);
      }
      if (currentRef.current) {
        drawStroke(ctx, currentRef.current);
      }
    }, []);

    function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
      const outline = getStroke(stroke.points, STROKE_OPTIONS);
      if (outline.length < 2) return;
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i++) {
        ctx.lineTo(outline[i][0], outline[i][1]);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Convert PointerEvent client coords → canvas pixel coords.
    function pointFromEvent(e: PointerEvent): [number, number, number] {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
      const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
      // pressure is 0 for mouse if no button is held — perfect-freehand
      // handles that via simulatePressure, but feeding a real pen pressure
      // lets the stroke vary in width.
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      return [x, y, pressure];
    }

    // Pointer handlers — bound via addEventListener in useEffect because
    // RN-Web's View doesn't forward pointer-* events with full PointerEvent
    // shape (it strips pressure / pointerType).
    useEffect(() => {
      if (!editable) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      function onDown(e: PointerEvent) {
        // Ignore secondary buttons.
        if (e.button !== undefined && e.button !== 0) return;
        if (activePointerRef.current !== null) return;
        // Block drawing while the saved bg is still downloading. A stroke
        // captured here would land on a blank canvas, and the next save
        // would overwrite the saved annotation with just the new mark —
        // losing whatever was previously there. The block is short-lived:
        // the bg finishes loading within a few hundred ms on a normal
        // connection, after which strokes register normally.
        if (bgPendingRef.current) return;
        activePointerRef.current = e.pointerId;
        try {
          canvas!.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic events (e.g. tests) don't register with the OS as
          // active pointers — capture fails harmlessly; pointermove still
          // dispatches because we're listening directly on the canvas.
        }
        currentRef.current = {
          points: [pointFromEvent(e)],
          color: STROKE_COLOR,
        };
        redraw();
        e.preventDefault();
      }

      function onMove(e: PointerEvent) {
        if (activePointerRef.current !== e.pointerId) return;
        if (!currentRef.current) return;
        currentRef.current.points.push(pointFromEvent(e));
        redraw();
        e.preventDefault();
      }

      function onUp(e: PointerEvent) {
        if (activePointerRef.current !== e.pointerId) return;
        try {
          canvas!.releasePointerCapture(e.pointerId);
        } catch {
          // already released
        }
        if (currentRef.current && currentRef.current.points.length > 1) {
          strokesRef.current.push(currentRef.current);
          setStrokeCount(strokesRef.current.length);
          onChange?.();
        }
        currentRef.current = null;
        activePointerRef.current = null;
        redraw();
      }

      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      return () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
      };
    }, [editable, onChange, redraw]);

    // Match the canvas's internal pixel size to its rendered size (DPI-aware).
    function syncCanvasSize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // The layout style sets width/height; without setting canvas.width
      // explicitly the canvas defaults to 300×150 and strokes look stretched.
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.round(rect.width * dpr));
      const targetH = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        sizeRef.current = { w: targetW, h: targetH };
        redraw();
      }
    }

    // Leaving edit mode: the saved PNG is now the authoritative source of
    // truth (it contains both the previous marks and the new strokes the
    // user just made). Drop the strokes ref so re-entering edit doesn't
    // double-draw them on top of the now-rebaked background.
    useEffect(() => {
      if (editable) return;
      strokesRef.current = [];
      currentRef.current = null;
      setStrokeCount(0);
    }, [editable]);

    // Pop the most recent stroke. The background PNG stays — only strokes the
    // user added in this edit session are undoable; once they tap DONE the
    // strokes get baked into the saved PNG and there's no more session
    // history to walk back through.
    const undo = useCallback(() => {
      if (strokesRef.current.length === 0) return;
      strokesRef.current.pop();
      setStrokeCount(strokesRef.current.length);
      redraw();
      onChange?.();
    }, [redraw, onChange]);

    // Cmd/Ctrl+Z while edit mode is open. Captured on window so the user
    // doesn't have to focus the canvas first.
    useEffect(() => {
      if (!editable) return;
      function onKey(e: KeyboardEvent) {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undo();
        }
      }
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [editable, undo]);

    // Whenever the canvas mounts or the parent layout changes (e.g. on a
    // window resize), recompute the internal pixel size.
    useEffect(() => {
      if (!canvasRef.current) return;
      syncCanvasSize();
      const onResize = () => syncCanvasSize();
      window.addEventListener('resize', onResize);
      const ro =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(syncCanvasSize)
          : null;
      if (ro && canvasRef.current) ro.observe(canvasRef.current);
      return () => {
        window.removeEventListener('resize', onResize);
        ro?.disconnect();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editable, bgLoaded]);

    useImperativeHandle(
      ref,
      () => ({
        async export() {
          const canvas = canvasRef.current;
          // View mode (no live canvas): nothing to flatten.
          if (!canvas) return { data: '', png: '' };
          // Always flatten the live canvas — even if the user added zero
          // strokes — because the canvas already has the previous PNG
          // composited under any new strokes from `redraw`. Returning empty
          // here would cause `useScoreAnnotation.saveDrawing` to write
          // `imageUri: null`, wiping the previous iPad-drawn marks. The
          // cost of a no-op re-upload is preferable to that data loss.
          const url = canvas.toDataURL('image/png');
          const png = url.slice(url.indexOf(',') + 1);
          return { data: '', png };
        },
        clear() {
          // Match iPad PencilKit: clear wipes everything, including any
          // previously-saved marks. The next export will emit a transparent
          // PNG, which `saveAnnotation` will store — effectively erasing
          // the annotation on disk too.
          strokesRef.current = [];
          currentRef.current = null;
          bgImgRef.current = null;
          setStrokeCount(0);
          redraw();
        },
        undo() {
          undo();
        },
      }),
      [redraw, undo],
    );

    // View mode: same as before — render the saved PNG as a passive overlay.
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

    // Edit mode: a transparent canvas the same size as the score letterbox.
    // touchAction:'none' stops the browser from interpreting drags as
    // scroll/zoom while the user is mid-stroke. RN-Web's View renders as a
    // <div>, so a raw <canvas> child is rendered normally by React DOM.
    return (
      <View ref={containerRef} style={style}>
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            touchAction: 'none',
            cursor: 'crosshair',
          }}
        />
        {/* Undo affordance — sits in the top-left of the score area while
            edit mode is open. The page-nav chevrons are hidden during
            annotation, so the corner is free. Disabled (faded) when there
            are no strokes in this session to walk back. */}
        <Pressable
          onPress={undo}
          disabled={strokeCount === 0}
          hitSlop={8}
          accessibilityLabel="Undo last stroke"
          style={[
            undoStyles.btn,
            { top: 8 + insets.top, left: 8 + insets.left },
            strokeCount === 0 && undoStyles.btnDisabled,
          ]}>
          <ThemedText style={undoStyles.glyph}>↶</ThemedText>
          <ThemedText style={undoStyles.label}>Undo</ThemedText>
        </Pressable>
      </View>
    );
  },
);

const undoStyles = StyleSheet.create({
  btn: {
    position: 'absolute',
    top: 8,
    left: 8,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#0006',
    backgroundColor: '#ffffffee',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnDisabled: {
    opacity: 0.35,
  },
  glyph: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '800',
    color: '#222',
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: '#222',
  },
});
