import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { Palette } from '@/constants/palette';
import { Type } from '@/constants/tokens';
import {
  playMelody,
  preloadInstrument,
  SAMPLER_AVAILABLE,
  stopMelody,
} from '@/lib/audio/sampler';
import {
  bucketPatternSchedule,
  bucketWrittenPitches,
  clefFor,
  keySignatureFor,
  STARTER_GROUPING,
  STARTER_TEMPO,
  VARIATION_PATTERNS,
  type BumblebeeBucket,
} from '@/lib/onboarding/bumblebee';
import { buildExerciseAbc } from '@/lib/notation/buildExerciseAbc';
import { buildPitchAbc } from '@/lib/notation/buildPitchAbc';

// "Watch how it works" demo of Rhythm Variations, run on the Bumblebee phrase.
// The base phrase stays pinned on top ("the notes"); pressing Next cycles
// through the rhythm variations underneath, auto-playing each one once. Same
// machinery the onboarding variations step + the real Rhythmic tool use.

const VIOLET = Palette.rhythmic;
const SOFT = Palette.rhythmicSoft;

type Props = {
  bucket: BumblebeeBucket;
  gm: string;
  soundShift?: number;
  onDone: () => void;
};

export function RhythmVariationsDemo({ bucket, gm, soundShift = 0, onDone }: Props) {
  const total = VARIATION_PATTERNS.length;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const alive = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const baseAbc = useMemo(
    () =>
      buildPitchAbc(bucketWrittenPitches(bucket), keySignatureFor(bucket), clefFor(bucket), {
        beamGroup: STARTER_GROUPING,
      }),
    [bucket],
  );
  const varAbc = useMemo(
    () =>
      buildExerciseAbc(
        bucketWrittenPitches(bucket),
        keySignatureFor(bucket),
        clefFor(bucket),
        VARIATION_PATTERNS[idx],
      ),
    [bucket, idx],
  );

  function play(i: number) {
    if (!SAMPLER_AVAILABLE) return;
    setPlaying(true);
    void playMelody(
      gm,
      bucketPatternSchedule(bucket, VARIATION_PATTERNS[i], STARTER_TEMPO, soundShift),
      () => {
        if (alive.current) setPlaying(false);
      },
    );
  }

  function goTo(i: number) {
    setIdx(i);
    play(i);
  }

  useEffect(() => {
    alive.current = true;
    if (SAMPLER_AVAILABLE) preloadInstrument(gm);
    const t = setTimeout(() => play(0), 350);
    timers.current.push(t);
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
      stopMelody();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>Rhythm variations</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {idx + 1} of {total}
          </Text>
        </View>
      </View>

      <Text style={styles.staffLabel}>The notes</Text>
      <View style={styles.baseStaff}>
        <AbcStaffView abc={baseAbc} width={300} height={66} centered fitWidth />
      </View>

      <Text style={styles.divider}>the same notes, a new rhythm:</Text>

      <View style={[styles.varStaff, playing && { borderColor: VIOLET }]}>
        <AbcStaffView abc={varAbc} width={300} height={84} centered fitWidth />
      </View>

      <Text style={styles.caption}>
        Drill the passage in many rhythms and your fingers learn the notes cold — not just one
        groove. Tap Next to hear each one.
      </Text>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Hear it again"
          style={styles.againBtn}
          onPress={() => play(idx)}>
          <Text style={[styles.againText, { color: VIOLET }]}>▶ Again</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Next variation"
          style={[styles.nextBtn, { backgroundColor: VIOLET }]}
          onPress={() => goTo((idx + 1) % total)}>
          <Text style={styles.nextText}>Next →</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.exitBtn}
        onPress={() => {
          timers.current.forEach(clearTimeout);
          stopMelody();
          onDone();
        }}>
        <Text style={styles.exitText}>I got it →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    backgroundColor: Palette.surfaceSunk,
    borderRadius: 14,
    padding: 16,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  kicker: { fontSize: 13, color: Palette.textSecondary },
  pill: { backgroundColor: SOFT, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 8 },
  pillText: { fontSize: 12, color: VIOLET, fontWeight: Type.weight.semibold },
  staffLabel: { fontSize: 11, color: Palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  baseStaff: {
    backgroundColor: Palette.card,
    borderWidth: 0.5,
    borderColor: Palette.border,
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  divider: { fontSize: 12, color: Palette.textSecondary, textAlign: 'center', marginVertical: 8 },
  varStaff: {
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  caption: { minHeight: 38, textAlign: 'center', fontSize: 14, lineHeight: 20, color: Palette.text, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  againBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VIOLET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  againText: { fontSize: 14, fontWeight: Type.weight.semibold },
  nextBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nextText: { fontSize: 15, color: '#fff', fontWeight: Type.weight.semibold },
  exitBtn: { alignSelf: 'center', paddingVertical: 10 },
  exitText: { fontSize: 14, color: Palette.textSecondary, fontWeight: Type.weight.semibold },
});
