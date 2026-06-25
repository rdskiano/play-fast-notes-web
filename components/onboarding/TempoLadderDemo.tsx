import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/palette';
import { Type } from '@/constants/tokens';
import {
  playMelody,
  preloadInstrument,
  SAMPLER_AVAILABLE,
  stopMelody,
} from '@/lib/audio/sampler';
import type { BumblebeeBucket } from '@/lib/onboarding/bumblebee';
import {
  fullPhraseSchedule,
  TL_BASE_TEMPO,
  TL_INCREMENT,
  TL_TARGET_REPS,
} from '@/lib/onboarding/strategyDemos';
import { PhraseMarkers } from '@/components/onboarding/PhraseMarkers';

// Self-driving "watch how it works" demo of Tempo Ladder, run on the Flight of
// the Bumblebee phrase. Each rep plays the whole phrase at the current tempo;
// the user marks Clean or Miss. Three clean in a row completes a rung (a miss
// resets the streak to zero) → a congrats that offers to bump the tempo and go
// again — the "ladder". Faithful to useTempoLadderSession's step mode.

const GREEN = Palette.success; // tempo_ladder strategy color
const SOFT = Palette.successSoft;

type Phase = 'playing' | 'judge' | 'gap' | 'congrats';

type Props = {
  bucket: BumblebeeBucket;
  gm: string;
  soundShift?: number;
  onDone: () => void;
};

export function TempoLadderDemo({ bucket, gm, soundShift = 0, onDone }: Props) {
  const [tempo, setTempo] = useState(TL_BASE_TEMPO);
  const [streak, setStreak] = useState(0);
  const [rung, setRung] = useState(1);
  const [phase, setPhase] = useState<Phase>('playing');
  const [message, setMessage] = useState('Listen — one play-through, then mark it.');
  const [pulseOn, setPulseOn] = useState(false);

  const tempoRef = useRef(TL_BASE_TEMPO);
  const streakRef = useRef(0);
  const phaseRef = useRef<Phase>('playing');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const beat = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(true);

  function setPhaseBoth(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  function stopPulse() {
    if (beat.current) {
      clearInterval(beat.current);
      beat.current = null;
    }
    setPulseOn(false);
  }
  function startPulse(t: number) {
    stopPulse();
    const period = 60000 / t;
    beat.current = setInterval(() => {
      if (!alive.current) return;
      setPulseOn(true);
      const off = setTimeout(() => setPulseOn(false), Math.min(120, period * 0.4));
      timers.current.push(off);
    }, period);
  }

  // Play one rep: the whole phrase at tempo `t`, then ask for a judgment.
  function startRep(t: number) {
    if (!alive.current) return;
    setPhaseBoth('playing');
    setMessage(`Listen — one play-through at ${t} bpm.`);
    startPulse(t);
    const { notes, durationSec } = fullPhraseSchedule(bucket, t, soundShift);
    if (SAMPLER_AVAILABLE) void playMelody(gm, notes);
    timers.current.push(
      setTimeout(
        () => {
          if (!alive.current) return;
          setPhaseBoth('judge');
          setMessage('Was that clean? Mark it — a miss sends the streak back to zero.');
        },
        durationSec * 1000 + 150,
      ),
    );
  }

  function onClean() {
    if (phaseRef.current !== 'judge') return;
    const s = streakRef.current + 1;
    streakRef.current = s;
    setStreak(s);
    if (s >= TL_TARGET_REPS) {
      stopPulse();
      setPhaseBoth('congrats');
      setMessage('Three clean in a row — that’s one rung of the tempo ladder.');
      return;
    }
    setMessage(`Clean! ${s} of ${TL_TARGET_REPS} — keep the streak going.`);
    setPhaseBoth('gap');
    timers.current.push(setTimeout(() => startRep(tempoRef.current), 1000));
  }

  function onMiss() {
    if (phaseRef.current !== 'judge') return;
    streakRef.current = 0;
    setStreak(0);
    setMessage('A miss resets the streak to zero — that’s the point: it builds reliability, not luck.');
    setPhaseBoth('gap');
    timers.current.push(setTimeout(() => startRep(tempoRef.current), 1400));
  }

  function keepGoing() {
    const t = tempoRef.current + TL_INCREMENT;
    tempoRef.current = t;
    setTempo(t);
    streakRef.current = 0;
    setStreak(0);
    setRung((r) => r + 1);
    setMessage(`Now a little faster — ${t} bpm. Same goal: three clean in a row.`);
    startRep(t);
  }

  useEffect(() => {
    alive.current = true;
    if (SAMPLER_AVAILABLE) preloadInstrument(gm);
    const t = setTimeout(() => startRep(TL_BASE_TEMPO), 350);
    timers.current.push(t);
    return () => {
      alive.current = false;
      clearTimers();
      stopPulse();
      stopMelody();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canJudge = phase === 'judge';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>Tempo ladder</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Rung {rung}</Text>
        </View>
      </View>

      <View style={styles.notation}>
        <PhraseMarkers bucket={bucket} from={0} to={16} active={false} width={300} />
      </View>

      <View style={styles.meterRow}>
        <View
          style={[
            styles.pulse,
            { backgroundColor: pulseOn ? GREEN : Palette.textMuted, transform: [{ scale: pulseOn ? 1.3 : 1 }] },
          ]}
        />
        <Text style={styles.bpm}>{tempo}</Text>
        <Text style={styles.bpmUnit}>bpm</Text>
        <View style={styles.vr} />
        <View style={styles.dots}>
          {Array.from({ length: TL_TARGET_REPS }, (_, i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: i < streak ? GREEN : 'transparent', borderColor: i < streak ? GREEN : Palette.borderStrong }]}
            />
          ))}
          <Text style={styles.dotsLabel}>{streak} / {TL_TARGET_REPS} clean</Text>
        </View>
      </View>

      <Text style={styles.caption}>{message}</Text>

      {phase === 'congrats' ? (
        <View style={styles.congrats}>
          <View style={[styles.cele, { backgroundColor: SOFT }]}>
            <Text style={[styles.celeMark, { color: GREEN }]}>✓</Text>
          </View>
          <Pressable accessibilityLabel="Keep going" style={[styles.primary, { backgroundColor: GREEN }]} onPress={keepGoing}>
            <Text style={styles.primaryText}>Keep going — faster →</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.judgeRow}>
          <Pressable
            accessibilityLabel="Mark miss"
            style={[styles.judgeBtn, styles.missBtn, !canJudge && styles.disabled]}
            disabled={!canJudge}
            onPress={onMiss}>
            <Text style={[styles.judgeText, { color: Palette.danger }]}>✗ Miss</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Mark clean"
            style={[styles.judgeBtn, { backgroundColor: canJudge ? GREEN : SOFT, borderColor: GREEN }, !canJudge && styles.disabled]}
            disabled={!canJudge}
            onPress={onClean}>
            <Text style={[styles.judgeText, { color: canJudge ? '#fff' : GREEN }]}>✓ Clean</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        style={styles.exitBtn}
        onPress={() => {
          clearTimers();
          stopPulse();
          stopMelody();
          onDone();
        }}>
        <Text style={styles.exitText}>{phase === 'congrats' ? 'I’ve got it →' : 'I got it →'}</Text>
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
  pillText: { fontSize: 12, color: GREEN, fontWeight: Type.weight.semibold },
  notation: {
    backgroundColor: Palette.card,
    borderWidth: 0.5,
    borderColor: Palette.border,
    borderRadius: 8,
    paddingVertical: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  meterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 },
  pulse: { width: 13, height: 13, borderRadius: 7 },
  bpm: { fontSize: 21, fontWeight: Type.weight.semibold, color: Palette.text, minWidth: 36, textAlign: 'center' },
  bpmUnit: { fontSize: 12, color: Palette.textMuted },
  vr: { width: 1, height: 16, backgroundColor: Palette.border },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5 },
  dotsLabel: { fontSize: 12, color: Palette.textSecondary, marginLeft: 4 },
  caption: { minHeight: 40, textAlign: 'center', fontSize: 14, lineHeight: 20, color: Palette.text, marginBottom: 12 },
  judgeRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  judgeBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missBtn: { borderColor: Palette.danger, backgroundColor: 'transparent' },
  disabled: { opacity: 0.4 },
  judgeText: { fontSize: 16, fontWeight: Type.weight.semibold },
  congrats: { alignItems: 'center', gap: 12, marginBottom: 8 },
  cele: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  celeMark: { fontSize: 26, fontWeight: Type.weight.bold },
  primary: { width: '100%', paddingVertical: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, color: '#fff', fontWeight: Type.weight.semibold },
  exitBtn: { alignSelf: 'center', paddingVertical: 10 },
  exitText: { fontSize: 14, color: Palette.textSecondary, fontWeight: Type.weight.semibold },
});
