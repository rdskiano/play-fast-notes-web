import { AbcStaffView } from '@/components/AbcStaffView';
import { buildPitchAbc } from '@/lib/notation/buildPitchAbc';
import {
  bucketWrittenPitches,
  clefFor,
  keySignatureFor,
  STARTER_GROUPING,
  type BumblebeeBucket,
} from '@/lib/onboarding/bumblebee';

// Native stub: shows the phrase without the live green notehead coloring (that
// uses abcjs DOM). Native onboarding is a fast-follow.
type Props = {
  bucket: BumblebeeBucket;
  activeIndices: number[];
  width?: number;
};

export function ChainNotes({ bucket, width = 320 }: Props) {
  const abc = buildPitchAbc(
    bucketWrittenPitches(bucket),
    keySignatureFor(bucket),
    clefFor(bucket),
    { beamGroup: STARTER_GROUPING },
  );
  return <AbcStaffView abc={abc} width={width} height={92} centered fitWidth />;
}
