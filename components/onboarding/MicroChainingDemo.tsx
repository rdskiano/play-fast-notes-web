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
import { CHAIN_DEMO_NOTE_SEC } from '@/lib/onboarding/strategyDemos';
import { generateMicroSteps, type MicroMode } from '@/lib/strategies/microChain';
import { ChainNotes } from '@/components/onboarding/ChainNotes';

// "Watch how it works" demo of Micro-chaining. Shows the WHOLE phrase and turns
// the notes themselves green as the chain rebuilds an (arbitrary) tricky spot
// one note at a time — looping continuously. A 3-way toggle switches between the
// real tool's three variations (Forward / Backward / Problem) without stopping
// the loop. Reuses the real generateMicroSteps().

const INDIGO = '#3F5BD9'; // micro_chaining strategy color
const INDIGO_SOFT = '#E7EAFB';

// The demo rebuilds the WHOLE phrase so each mode starts at a meaningful place:
// Forward from the first note, Backward from the last note, Problem from the
// middle. (Marks are 1-based into the phrase.)
// Micro-chaining is done AT PERFORMANCE TEMPO (quarter = 136).
const NOTE_SEC = CHAIN_DEMO_NOTE_SEC;
// Repeat each step this many times before advancing (mimics "repeat until comfortable").
const STEP_REPS = 2;

const MODES: { key: MicroMode; label: string; hint: string }[] = [
  { key: 'forward', label: 'Forward', hint: 'add a note to the end each step' },
  { key: 'backward', label: 'Backward', hint: 'add a note to the front each step' },
  { key: 'problem', label: 'Problem', hint: 'start in the middle, grow outward' },
];

type Props = {
  bucket: BumblebeeBucket;
  gm: string;
  soundShift?: number;
  onDone: () => void;
};

export function MicroChainingDemo({ bucket, gm, soundShift = 0, onDone }: Props) {
  const [mode, setMode] = useState<MicroMode>('forward');
  const [stepIdx, setStepIdx] = useState(0);

  const alive = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stepsRef = useRef<ReturnType<typeof generateMicroSteps>>([]);

  const concert = useMemo(() => bucketConcertMidi(bucket), [bucket]);
  const N = concert.length; // rebuild the whole phrase
  const problemA = Math.floor(N / 2); // a spot in the middle, for Problem mode
  const problemB = problemA + 1;
  const steps = useMemo(
    () => generateMicroSteps(mode, N, problemA, problemB),
    [mode, N, problemA, problemB],
  );

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function runFrom(i: number, rep = 0) {
    const arr = stepsRef.current;
    if (!alive.current || arr.length === 0) return;
    const active = arr[i].activeIndices;
    setStepIdx(i);
    if (SAMPLER_AVAILABLE) {
      const sched = active.map((f, k) => ({
        midi: concert[f - 1] + soundShift,
        time: k * NOTE_SEC,
        duration: NOTE_SEC * 0.9,
      }));
      void playMelody(gm, sched);
    }
    // Play each step twice (a real user repeats a link until it's comfortable):
    // a short breath between the two reps, a longer gap before the next step.
    const playMs = active.length * NOTE_SEC * 1000;
    const last = rep >= STEP_REPS - 1;
    timers.current.push(
      setTimeout(() => {
        if (!alive.current) return;
        if (last) runFrom((i + 1) % arr.length, 0);
        else runFrom(i, rep + 1);
      }, playMs + (last ? 550 : 260)),
    );
  }

  // Mount / unmount.
  useEffect(() => {
    alive.current = true;
    if (SAMPLER_AVAILABLE) preloadInstrument(gm);
    return () => {
      alive.current = false;
      clearTimers();
      stopMelody();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)start the loop whenever the mode (steps) changes — keeps looping.
  // Cut the previous mode's audio + reset to step 0 first, so switching modes
  // doesn't overlap the two playbacks.
  useEffect(() => {
    stepsRef.current = steps;
    clearTimers();
    stopMelody();
    setStepIdx(0);
    const t = setTimeout(() => runFrom(0), 200);
    timers.current.push(t);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

  const step = steps[stepIdx];
  // Active note numbers (1-based) → 0-based phrase indices for the green highlight.
  const activeAbs = (step?.activeIndices ?? []).map((f) => f - 1);
  const hint = MODES.find((m) => m.key === mode)?.hint ?? '';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>Micro-chaining</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>one note at a time</Text>
        </View>
      </View>

      <View style={styles.notation}>
        <ChainNotes bucket={bucket} activeIndices={activeAbs} width={300} />
      </View>

      <Text style={styles.caption}>
        Rebuild a tricky spot one note at a time — lock two notes, add the next, and the
        connection between them is never new.
      </Text>
      <Text style={styles.hint}>{hint}</Text>

      <View style={styles.toggle}>
        {MODES.map((m) => {
          const sel = m.key === mode;
          return (
            <Pressable
              key={m.key}
              accessibilityLabel={`${m.label} mode`}
              onPress={() => setMode(m.key)}
              style={[
                styles.segment,
                sel
                  ? { backgroundColor: INDIGO, borderColor: INDIGO }
                  : { borderColor: Palette.borderStrong },
              ]}>
              <Text style={[styles.segmentText, { color: sel ? '#fff' : INDIGO }]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

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
  pill: { backgroundColor: INDIGO_SOFT, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 8 },
  pillText: { fontSize: 12, color: INDIGO, fontWeight: Type.weight.semibold },
  notation: {
    backgroundColor: Palette.card,
    borderWidth: 0.5,
    borderColor: Palette.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  caption: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: Palette.text, marginBottom: 4 },
  hint: { textAlign: 'center', fontSize: 12, color: Palette.textSecondary, marginBottom: 14 },
  toggle: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 13, fontWeight: Type.weight.semibold },
  exitBtn: { alignSelf: 'center', paddingVertical: 10 },
  exitText: { fontSize: 14, color: Palette.textSecondary, fontWeight: Type.weight.semibold },
});
