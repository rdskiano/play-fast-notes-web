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

// The whole Bumblebee phrase with the active chain's noteheads turned green —
// the chaining happens on the real notes, not separate dots. Web-only (abcjs
// notehead DOM); native renders the phrase without the live coloring.

const GREEN = Palette.success;
const BLACK = Palette.text;

type Props = {
  bucket: BumblebeeBucket;
  /** 0-based note indices into the 17-note phrase to color green. */
  activeIndices: number[];
  width?: number;
};

export function ChainNotes({ bucket, activeIndices, width = 320 }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
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
    const active = new Set(activeIndices);
    const apply = () => {
      const notes = wrap.querySelectorAll<SVGGraphicsElement>('.abcjs-notehead');
      if (notes.length < 17 && tries < 40) {
        tries += 1;
        raf = requestAnimationFrame(apply);
        return;
      }
      notes.forEach((n, i) => n.setAttribute('fill', active.has(i) ? GREEN : BLACK));
    };
    apply();
    return () => cancelAnimationFrame(raf);
  }, [abc, activeIndices]);

  return (
    <div ref={wrapRef} style={{ width, alignSelf: 'center' }}>
      <AbcStaffView abc={abc} width={width} height={92} centered fitWidth />
    </div>
  );
}
