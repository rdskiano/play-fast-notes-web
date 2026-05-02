import { useEffect, useRef, useState } from 'react';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ABCJS_CDN = 'https://unpkg.com/abcjs@6/dist/abcjs-basic-min.js';

type AbcjsApi = {
  renderAbc: (
    target: HTMLElement,
    abc: string,
    options?: Record<string, unknown>,
  ) => unknown;
};

declare global {
  interface Window {
    ABCJS?: AbcjsApi;
    __abcjsLoading__?: Promise<AbcjsApi | null>;
  }
}

function loadAbcjs(): Promise<AbcjsApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.ABCJS) return Promise.resolve(window.ABCJS);
  if (window.__abcjsLoading__) return window.__abcjsLoading__;
  window.__abcjsLoading__ = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = ABCJS_CDN;
    script.async = true;
    script.onload = () => resolve(window.ABCJS ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return window.__abcjsLoading__;
}

type Props = {
  abc: string;
  width?: number;
  height?: number;
  hideStaffLines?: boolean;
  centered?: boolean;
  /**
   * abcjs internal scale — controls note + staff size.
   * iPad's centered (small) usage uses 1.0; the playing-card usage uses 1.6.
   */
  scale?: number;
  /** Wrap notation across multiple staff lines (used by PitchStaff). */
  wrap?: boolean;
  preferredMeasuresPerLine?: number;
  /** Shown when abcjs fails to render (corrupt ABC, missing CDN, etc.). */
  fallbackText?: string;
  /**
   * Maps a note-tap on the rendered SVG back to the index of the
   * space-separated note in the ABC body. Used by PitchStaff to open
   * NoteCardEditor on the tapped note.
   */
  onNoteTap?: (noteIndex: number) => void;
  /** When set, draws a coloured highlight under the note at this index. */
  activeNoteIndex?: number | null;
};

export function AbcStaffView({
  abc,
  width,
  height,
  hideStaffLines,
  centered,
  scale = 1,
  wrap,
  preferredMeasuresPerLine = 4,
  fallbackText,
  onNoteTap,
  activeNoteIndex,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState<boolean>(
    typeof window !== 'undefined' && !!window.ABCJS,
  );
  const [renderFailed, setRenderFailed] = useState(false);

  // Cache the note-start char positions in the ABC body, so a click on a
  // rendered note can be mapped back to its index in the parent's pitches[].
  const noteStartsRef = useRef<number[]>([]);
  const onNoteTapRef = useRef<typeof onNoteTap>(onNoteTap);
  useEffect(() => {
    onNoteTapRef.current = onNoteTap;
  }, [onNoteTap]);

  useEffect(() => {
    let cancelled = false;
    loadAbcjs().then((api) => {
      if (!cancelled && api) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const el = containerRef.current;
    const api = window.ABCJS;
    if (!el || !api) return;
    el.innerHTML = '';
    setRenderFailed(false);

    // Pre-compute note start char offsets (space-separated tokens) so the
    // click handler can map an abcelem back to the user's pitch index.
    if (onNoteTap) {
      const bodyStart = abc.lastIndexOf('\n') + 1;
      let bodyEnd = abc.lastIndexOf('|');
      if (bodyEnd < 0) bodyEnd = abc.length;
      const body = abc.substring(bodyStart, bodyEnd);
      const parts = body.split(' ').filter((s) => s.length > 0);
      const starts: number[] = [];
      let cursor = bodyStart;
      for (const part of parts) {
        starts.push(cursor);
        cursor += part.length + 1;
      }
      noteStartsRef.current = starts;
    } else {
      noteStartsRef.current = [];
    }

    try {
      const staffWidth = Math.max(40, (width ?? 240) - 10);
      const options: Record<string, unknown> = {
        staffwidth: staffWidth,
        scale,
        paddingleft: 4,
        paddingright: 4,
        paddingtop: 4,
        paddingbottom: 4,
        format: {
          stafflinescolor: hideStaffLines ? 'transparent' : C.text,
        },
      };
      if (wrap) {
        options.wrap = {
          minSpacing: 1.4,
          maxSpacing: 2.7,
          preferredMeasuresPerLine,
          lastLineLimit: 0.5,
        };
      }
      if (onNoteTap) {
        options.clickListener = (
          abcelem: { startChar?: number } | null | undefined,
        ) => {
          if (!abcelem || typeof abcelem.startChar !== 'number') return;
          const sc = abcelem.startChar;
          const starts = noteStartsRef.current;
          for (let i = 0; i < starts.length; i++) {
            const lo = starts[i];
            const hi = i + 1 < starts.length ? starts[i + 1] : Infinity;
            if (sc >= lo && sc < hi) {
              onNoteTapRef.current?.(i);
              return;
            }
          }
        };
      }
      api.renderAbc(el, abc, options);

      const svg = el.querySelector('svg');
      if (svg) {
        svg.querySelectorAll('path').forEach((p) => {
          p.setAttribute('fill', C.text);
          if (p.getAttribute('stroke') && p.getAttribute('stroke') !== 'none') {
            p.setAttribute('stroke', C.text);
          }
        });
        if (centered) {
          try {
            const bbox = (svg as SVGSVGElement).getBBox();
            if (bbox && bbox.width > 0 && bbox.height > 0) {
              svg.setAttribute(
                'viewBox',
                `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`,
              );
              svg.setAttribute('width', String(bbox.width));
              svg.setAttribute('height', String(bbox.height));
            }
          } catch {
            // safe to skip
          }
        }
      }
    } catch {
      setRenderFailed(true);
    }
  }, [
    abc,
    ready,
    width,
    hideStaffLines,
    C.text,
    scale,
    centered,
    wrap,
    preferredMeasuresPerLine,
    onNoteTap,
  ]);

  // Highlight the active note in a separate pass so changing it doesn't
  // re-render the whole staff (which would lose abcjs internal layout state).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.querySelectorAll<SVGElement>('.abcjs-note').forEach((node, idx) => {
      if (activeNoteIndex != null && idx === activeNoteIndex) {
        node.setAttribute('fill', '#9b59b6');
      } else {
        node.setAttribute('fill', C.text);
      }
    });
  }, [activeNoteIndex, C.text]);

  if (renderFailed && fallbackText) {
    return (
      <div
        style={{
          width: width ?? '100%',
          height: height ?? 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          color: C.icon,
          fontSize: 14,
          fontStyle: 'italic',
        }}>
        {fallbackText}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: width ?? '100%',
        height: height ?? 60,
        display: 'flex',
        alignItems: wrap ? 'flex-start' : 'flex-end',
        justifyContent: centered ? 'center' : 'flex-start',
        overflow: 'hidden',
      }}
    />
  );
}
