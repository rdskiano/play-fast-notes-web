import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IcuStrategyDemo } from '@/components/onboarding/IcuStrategyDemo';
import { MacroChainingDemo } from '@/components/onboarding/MacroChainingDemo';
import { MicroChainingDemo } from '@/components/onboarding/MicroChainingDemo';
import { RepRotatorDemo } from '@/components/onboarding/RepRotatorDemo';
import { RhythmVariationsDemo } from '@/components/onboarding/RhythmVariationsDemo';
import { TempoLadderDemo } from '@/components/onboarding/TempoLadderDemo';
import { Spacing } from '@/constants/tokens';
import {
  bucketForInstrument,
  gmForInstrument,
  soundShiftForInstrument,
} from '@/lib/onboarding/bumblebee';
import { resolveOnboardingInstrument } from '@/lib/onboarding/strategyDemos';

// The six self-driving strategy demos (built for onboarding) made reusable from
// anywhere. Same demo IDs onboarding uses: 'tempo' | 'icu' | 'rv' | 'micro' |
// 'macro' | 'rep'. Pass `demoId={null}` to keep it closed. The demos run on the
// Flight of the Bumblebee phrase, transposed into the user's own clef — we load
// their instrument from settings (the one they picked during onboarding),
// falling back to Flute (concert pitch) for anyone who never set one.

export type StrategyDemoId = 'tempo' | 'icu' | 'rv' | 'micro' | 'macro' | 'rep';

// Maps a passage-hub strategy `key` to its demo ID. Returns null for any
// strategy that doesn't have a demo.
const DEMO_FOR_STRATEGY: Record<string, StrategyDemoId> = {
  tempo_ladder: 'tempo',
  click_up: 'icu',
  rhythmic: 'rv',
  micro_chaining: 'micro',
  macro_chaining: 'macro',
  rep_rotator: 'rep',
};

export function demoIdForStrategy(key: string): StrategyDemoId | null {
  return DEMO_FOR_STRATEGY[key] ?? null;
}

type Props = {
  demoId: StrategyDemoId | null;
  onClose: () => void;
};

export function StrategyDemoModal({ demoId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [instrument, setInstrument] = useState('Flute');

  // Resolve the user's onboarding instrument once, so the phrase plays in their
  // clef (picked instrument → backfilled from the seeded piece → Flute default).
  useEffect(() => {
    let alive = true;
    resolveOnboardingInstrument()
      .then((name) => {
        if (alive) setInstrument(name);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!demoId) return null;

  const bucket = bucketForInstrument(instrument);
  const gm = gmForInstrument(instrument);
  const soundShift = soundShiftForInstrument(instrument);

  let demo: React.ReactNode = null;
  if (demoId === 'icu') {
    demo = <IcuStrategyDemo bucket={bucket} gm={gm} soundShift={soundShift} onDone={onClose} />;
  } else if (demoId === 'tempo') {
    demo = <TempoLadderDemo bucket={bucket} gm={gm} soundShift={soundShift} onDone={onClose} />;
  } else if (demoId === 'rv') {
    demo = <RhythmVariationsDemo bucket={bucket} gm={gm} soundShift={soundShift} onDone={onClose} />;
  } else if (demoId === 'micro') {
    demo = <MicroChainingDemo bucket={bucket} gm={gm} soundShift={soundShift} onDone={onClose} />;
  } else if (demoId === 'macro') {
    demo = <MacroChainingDemo bucket={bucket} gm={gm} soundShift={soundShift} onDone={onClose} />;
  } else if (demoId === 'rep') {
    demo = <RepRotatorDemo onDone={onClose} />;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {/* Scrim: tap outside the sheet to dismiss. Rendered first so the sheet
            sits above it and keeps its own taps. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close demo" />
        <View style={styles.sheet}>{demo}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20,25,26,0.55)',
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { width: '100%', maxWidth: 380 },
});
