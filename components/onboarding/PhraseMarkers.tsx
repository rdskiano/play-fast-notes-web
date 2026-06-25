import type { BumblebeeBucket } from '@/lib/onboarding/bumblebee';

// Native stub. The synced notation + green arrow markers are a web-DOM feature
// (abcjs note nodes); on native the demo shows the abstract graphic only.
// Native onboarding is a fast-follow — see strategy-demos notes.
type Props = {
  bucket: BumblebeeBucket;
  from: number;
  to: number;
  active: boolean;
  width?: number;
};

export function PhraseMarkers(_props: Props) {
  return null;
}
