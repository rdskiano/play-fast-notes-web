import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/palette';
import { Type } from '@/constants/tokens';
import {
  playMelody,
  preloadInstrument,
  SAMPLER_AVAILABLE,
  stopMelody,
} from '@/lib/audio/sampler';
import { bucketConcertMidi, type BumblebeeBucket } from '@/lib/onboarding/bumblebee';
import {
  buildMacroDemoFrames,
  CHAIN_DEMO_NOTE_SEC,
  MACRO_BEATS,
  macroChunkBeatsLabel,
  macroChunkSizes,
} from '@/lib/onboarding/strategyDemos';
import { ChainNotes } from '@/components/onboarding/ChainNotes';

// Self-driving "watch how it works" demo of Macro-chaining. Walks the real macro
// step list: isolate each unit (drilled a few times), then chain the units with
// rest-beats between them counting 2 → 1 → 0, then join them seamlessly, then
// the chunk size doubles and you isolate + chain again, up to the whole phrase.
// During a rest the word REST blinks above the staff (once per rest beat). Like
// the ICU demo it plays through ONCE then stops with a Replay button. Performance
// tempo (quarter = 136).

const PLUM = '#9B4F86'; // macro_chaining strategy color
const PLUM_SOFT = '#F0E6EE';

const noteSec = CHAIN_DEMO_NOTE_SEC;

type Props = {
  bucket: BumblebeeBucket;
  gm: string;
  soundShift?: number;
  onDone: () => void;
};

export function MacroChainingDemo({ bucket, gm, soundShift = 0, onDone }: Props) {
  const concert = useMemo(() => bucketConcertMidi(bucket), [bucket]);
  // Drop any trailing silent break so the demo ends ON the whole-phrase frame.
  const frames = useMemo(() => {
    const f = buildMacroDemoFrames(MACRO_BEATS);
    while (f.length > 1 && f[f.length - 1].sound === null) f.pop();
    return f;
  }, []);
  const sizes = useMemo(() => macroChunkSizes(MACRO_BEATS), []);
  const allNotes = useMemo(() => concert.map((_, i) => i), [concert]);

  const [frameIdx, setFrameIdx] = useState(0);
  const [done, setDone] = useState(false);
  const alive = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const framesRef = useRef(frames);
  framesRef.current = frames;

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function runFrom(i: number) {
    const arr = framesRef.current;
    if (!alive.current || arr.length === 0) return;
    const f = arr[i];
    setFrameIdx(i);
    setDone(false);
    if (SAMPLER_AVAILABLE && f.sound && f.sound.length) {
      const sched = f.sound.map((n, k) => ({
        midi: concert[n] + soundShift,
        time: k * noteSec,
        duration: noteSec * 0.9,
      }));
      void playMelody(gm, sched);
    }
    timers.current.push(
      setTimeout(() => {
        if (!alive.current) return;
        if (i + 1 < arr.length) runFrom(i + 1);
        else finish();
      }, f.durMs),
    );
  }

  // Reached the end: hold on the whole phrase, stop. No loop.
  function finish() {
    clearTimers();
    setDone(true);
  }

  function replay() {
    clearTimers();
    stopMelody();
    setDone(false);
    setFrameIdx(0);
    const t = setTimeout(() => runFrom(0), 200);
    timers.current.push(t);
  }

  useEffect(() => {
    alive.current = true;
    if (SAMPLER_AVAILABLE) preloadInstrument(gm);
    const t = setTimeout(() => runFrom(0), 300);
    timers.current.push(t);
    return () => {
      alive.current = false;
      clearTimers();
      stopMelody();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frame = frames[frameIdx] ?? frames[0];
  const stageIdx = done ? sizes.length - 1 : sizes.indexOf(frame.chunkBeats);
  const green = done ? allNotes : frame.green;
  const restShown = !done && frame.rest && frame.restOn;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>Macro-chaining</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>chunks, then doubling</Text>
        </View>
      </View>

      <View style={styles.stage}>
        <View style={styles.restRow}>
          <Text style={[styles.restText, !restShown && styles.restHidden]}>REST</Text>
        </View>
        <View style={styles.notation}>
          <ChainNotes bucket={bucket} activeIndices={green} width={300} />
        </View>
      </View>

      <Text style={styles.caption}>
        Break it into chunks — drill each one, then join them with rests that shrink to
        nothing. As it locks in, the chunks double until you play the whole thing.
      </Text>
      <Text style={styles.hint}>{done ? 'That’s macro-chaining.' : frame.label}</Text>

      <View style={styles.stageRow}>
        {sizes.map((s, i) => {
          const sel = i === stageIdx;
          return (
            <View key={s} style={styles.stageItem}>
              <View
                style={[
                  styles.stageDot,
                  sel
                    ? { backgroundColor: PLUM, borderColor: PLUM }
                    : { borderColor: Palette.borderStrong },
                ]}
              />
              <Text style={[styles.stageLabel, sel ? { color: PLUM, fontWeight: Type.weight.semibold } : null]}>
                {macroChunkBeatsLabel(s, MACRO_BEATS)}
              </Text>
            </View>
          );
        })}
      </View>

      {done ? (
        <Pressable style={[styles.replayBtn, { borderColor: PLUM }]} onPress={replay}>
          <Text style={[styles.replayText, { color: PLUM }]}>▶ Replay</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={styles.exitBtn}
        onPress={() => {
          clearTimers();
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
  pill: { backgroundColor: PLUM_SOFT, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 8 },
  pillText: { fontSize: 12, color: PLUM, fontWeight: Type.weight.semibold },
  stage: { marginBottom: 14 },
  restRow: { height: 22, alignItems: 'center', justifyContent: 'center' },
  restText: {
    fontSize: 14,
    fontWeight: Type.weight.bold,
    letterSpacing: 3,
    color: PLUM,
  },
  restHidden: { opacity: 0 },
  notation: {
    backgroundColor: Palette.card,
    borderWidth: 0.5,
    borderColor: Palette.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  caption: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: Palette.text, marginBottom: 4 },
  hint: { textAlign: 'center', fontSize: 12, color: Palette.textSecondary, marginBottom: 14, minHeight: 16 },
  stageRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 10 },
  stageItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stageDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  stageLabel: { fontSize: 11, color: Palette.textSecondary },
  replayBtn: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  replayText: { fontSize: 14, fontWeight: Type.weight.semibold },
  exitBtn: { alignSelf: 'center', paddingVertical: 10 },
  exitText: { fontSize: 14, color: Palette.textSecondary, fontWeight: Type.weight.semibold },
});
