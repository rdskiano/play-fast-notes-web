import { useEffect, useMemo, useRef } from 'react';

import { AbcStaffView } from '@/components/AbcStaffView';
import { Palette } from '@/constants/palette';
import { buildPitchAbc } from '@/lib/notation/buildPitchAbc';
import {
  bucketWrittenPitches,
  clefFor,
  keySignatureFor,
  STARTER_GROUPING,
  type BumblebeeBucket,
} from '@/lib/onboarding/bumblebee';

// The real Bumblebee notation with the active span highlighted + the two green
// ▼ unit-arrows over its boundary notes — the same markers the real ICU tool
// shows, driven here by the demo's current step so they move in lockstep with
// the abstract graphic above. Web-only (abcjs DOM); native renders nothing.

const ARROW = Palette.success;

type Props = {
  bucket: BumblebeeBucket;
  /** Inclusive active note span (0-based) into the 17-note phrase. */
  from: number;
  to: number;
  /** False during the between-step rest — dims the highlight + hides arrows. */
  active: boolean;
  width?: number;
};

export function PhraseMarkers({ bucket, from, to, active, width = 320 }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const arrowA = useRef<HTMLDivElement | null>(null);
  const arrowB = useRef<HTMLDivElement | null>(null);

  const abc = useMemo(
    () =>
      buildPitchAbc(bucketWrittenPitches(bucket), keySignatureFor(bucket), clefFor(bucket), {
        beamGroup: STARTER_GROUPING,
      }),
    [bucket],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    let tries = 0;

    const apply = () => {
      const notes = wrap.querySelectorAll<SVGGraphicsElement>('.abcjs-notehead');
      // abcjs renders async via a CDN load — wait until the noteheads exist.
      if (notes.length < 17 && tries < 40) {
        tries += 1;
        raf = requestAnimationFrame(apply);
        return;
      }
      const wrapRect = wrap.getBoundingClientRect();
      // Noteheads stay black — the green ▼ arrows alone mark the active span,
      // matching the real ICU tool.
      const place = (el: HTMLDivElement | null, idx: number) => {
        if (!el) return;
        const n = notes[idx];
        if (!n || !active) {
          el.style.display = 'none';
          return;
        }
        const r = n.getBoundingClientRect();
        el.style.display = 'block';
        el.style.left = `${r.left - wrapRect.left + r.width / 2 - 5}px`;
        el.style.top = `${r.top - wrapRect.top - 13}px`;
      };
      place(arrowA.current, from);
      place(arrowB.current, to);
    };

    apply();
    return () => cancelAnimationFrame(raf);
  }, [abc, from, to, active]);

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeft: '5px solid transparent',
    borderRight: '5px solid transparent',
    borderTop: `7px solid ${ARROW}`,
    display: 'none',
    pointerEvents: 'none',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width, alignSelf: 'center' }}>
      <div ref={arrowA} style={arrowStyle} />
      <div ref={arrowB} style={arrowStyle} />
      <AbcStaffView abc={abc} width={width} height={92} centered fitWidth />
    </div>
  );
}
