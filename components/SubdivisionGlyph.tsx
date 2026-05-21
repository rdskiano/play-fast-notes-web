import { View } from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import type { Subdivision } from '@/lib/audio/useMetronome';

const ABC: Record<Subdivision, string> = {
  1: 'X:1\nM:none\nL:1/4\nK:none clef=none stafflines=0\nB',
  2: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBB',
  3: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB',
  4: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBB',
};

const WIDTHS: Record<Subdivision, number> = { 1: 40, 2: 46, 3: 54, 4: 62 };

export function SubdivisionGlyph({
  subdivision,
  height = 30,
}: {
  subdivision: Subdivision;
  height?: number;
}) {
  return (
    <View>
      <AbcStaffView
        abc={ABC[subdivision]}
        width={WIDTHS[subdivision]}
        height={height}
        hideStaffLines
        centered
      />
    </View>
  );
}
