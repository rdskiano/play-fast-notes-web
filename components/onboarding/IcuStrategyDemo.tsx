import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/palette';
import { Type } from '@/constants/tokens';
import {
  isInstrumentReady,
  playMelody,
  preloadInstrument,
  SAMPLER_AVAILABLE,
  stopMelody,
} from '@/lib/audio/sampler';
import type { BumblebeeBucket } from '@/lib/onboarding/bumblebee';
import {
  DEMO_CHUNK,
  DEMO_CHUNKS,
  generateIcuDemoSteps,
  ICU_PHASE_CAPTIONS,
  icuStepSchedule,
  stepDoingLabel,
  stepNoteSpan,
} from '@/lib/onboarding/strategyDemos';
import { PhraseMarkers } from '@/components/onboarding/PhraseMarkers';

// Self-driving "watch how it works" demo of Interleaved Click-Up, run on the
// Flight of the Bumblebee phrase the user just heard. The abstract graphic
// (chunks + bracket) teaches the UNIT abstraction; the real notation below,
// with its green ▼ arrows, grounds it — both move on the same step so seeing
// the arrows and understanding the units click together. Faithful to the real
// ICU generator (lib/strategies/clickUp.ts).

const NOTES = DEMO_CHUNKS * DEMO_CHUNK + 1; // 17
const BAR_W = 6;
const GAP = 2;
const GROUP_GAP = 8;

type Props = {
  bucket: BumblebeeBucket;
  gm: string;
  soundShift?: number;
  onDone: () => void;
};

export function IcuStrategyDemo({ bucket, gm, soundShift = 0, onDone }: Props) {
  const steps = useMemo(() => generateIcuDemoSteps(), []);

  // Precompute bar geometry so the bracket + labels align by arithmetic
  // (no on-screen measuring needed, works identically on web + native).
  const geo = useMemo(() => {
    const lefts: number[] = [];
    const rights: number[] = [];
    const heights: number[] = [];
    let x = 0;
    for (let i = 0; i < NOTES; i++) {
      const ml = i === 0 ? 0 : i % DEMO_CHUNK === 0 ? GROUP_GAP : GAP;
      x += ml;
      lefts[i] = x;
      rights[i] = x + BAR_W;
      heights[i] = 15 + ((i * 7) % 18);
      x = rights[i];
    }
    return { lefts, rights, heights, total: x };
  }, []);

  const [stepIndex, setStepIndex] = useState(0);
  const [resting, setResting] = useState(false);
  const [pulseOn, setPulseOn] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [done, setDone] = useState(false);

  const idxRef = useRef(0);
  const autoRef = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const beat = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(true);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (beat.current) {
      clearInterval(beat.current);
      beat.current = null;
    }
  }

  function startPulse(tempo: number) {
    if (beat.current) clearInterval(beat.current);
    const period = 60000 / tempo;
    beat.current = setInterval(() => {
      if (!alive.current) return;
      setPulseOn(true);
      const off = setTimeout(() => setPulseOn(false), Math.min(120, period * 0.4));
      timers.current.push(off);
    }, period);
  }

  // Enter a step: show it, play its slice, pulse the beat. In auto mode also
  // schedule the rest + advance (looping at the end).
  function enterStep(i: number) {
    if (!alive.current) return;
    const step = steps[i];
    idxRef.current = i;
    setStepIndex(i);
    setResting(false);
    setDone(false);
    startPulse(step.tempo);

    const { notes, durationSec } = icuStepSchedule(bucket, step, soundShift);
    if (SAMPLER_AVAILABLE) void playMelody(gm, notes);

    if (autoRef.current) {
      const activeMs = Math.max(500, durationSec * 1000);
      const restMs = Math.min(60000 / step.tempo, 450);
      timers.current.push(
        setTimeout(() => {
          if (alive.current) setResting(true);
        }, activeMs),
      );
      timers.current.push(
        setTimeout(() => {
          if (!alive.current) return;
          if (i + 1 < steps.length) enterStep(i + 1);
          else finish();
        }, activeMs + restMs),
      );
    }
  }

  // Reached the end: hold on the final (all-chunks) frame, stop. No loop.
  function finish() {
    clearTimers();
    autoRef.current = false;
    setAutoPlay(false);
    setResting(false);
    setDone(true);
  }

  function next() {
    clearTimers();
    const i = idxRef.current;
    if (i + 1 < steps.length) enterStep(i + 1);
    else finish();
  }

  function toggleAuto() {
    const on = !autoRef.current;
    autoRef.current = on;
    setAutoPlay(on);
    clearTimers();
    // Turning auto on at the end replays from the top; otherwise resume here.
    enterStep(on && idxRef.current >= steps.length - 1 ? 0 : idxRef.current);
  }

  useEffect(() => {
    alive.current = true;
    autoRef.current = true;
    if (SAMPLER_AVAILABLE) preloadInstrument(gm);
    const t = setTimeout(() => enterStep(0), 300);
    timers.current.push(t);
    return () => {
      alive.current = false;
      clearTimers();
      stopMelody();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = steps[stepIndex];
  const span = stepNoteSpan(step);
  const showActive = !resting;
  const bracketLeft = geo.lefts[span.from] - 1;
  const bracketWidth = geo.rights[span.to] - geo.lefts[span.from] + 2;
  const arrowCenter = (geo.lefts[span.from] + geo.rights[span.to]) / 2;

  const phaseLabel =
    step.phase === 1 ? 'Chunk 1' : step.phase === DEMO_CHUNKS ? 'All chunks' : `Chunk ${step.phase}`;
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>Interleaved click-up</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{phaseLabel}</Text>
        </View>
      </View>

      {/* Real notation + green unit-arrows, synced to the current step. */}
      <View style={styles.notation}>
        <PhraseMarkers bucket={bucket} from={span.from} to={span.to} active={showActive} width={300} />
      </View>

      {/* Abstract graphic: the same span as chunks + bracket. */}
      <View style={styles.panel}>
        <View style={{ width: geo.total, alignSelf: 'center' }}>
          <View style={styles.staff}>
            {geo.heights.map((h, i) => {
              const landing = i % DEMO_CHUNK === 0 && i > 0;
              const active = showActive && i >= span.from && i <= span.to;
              return (
                <View
                  key={i}
                  style={{
                    width: BAR_W,
                    height: h,
                    marginLeft: i === 0 ? 0 : landing ? GROUP_GAP : GAP,
                    borderRadius: 2,
                    backgroundColor: active
                      ? Palette.accent
                      : landing
                        ? Palette.borderStrong
                        : Palette.border,
                  }}
                />
              );
            })}
          </View>

          <View style={[styles.bracketLayer, { opacity: showActive ? 1 : 0.25 }]}>
            <View
              style={{
                position: 'absolute',
                left: arrowCenter - 5,
                top: 0,
                width: 0,
                height: 0,
                borderLeftWidth: 5,
                borderRightWidth: 5,
                borderBottomWidth: 6,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderBottomColor: Palette.accent,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: bracketLeft,
                top: 6,
                width: bracketWidth,
                height: 6,
                borderColor: Palette.accent,
                borderLeftWidth: 2,
                borderRightWidth: 2,
                borderBottomWidth: 2,
                borderTopWidth: 0,
                borderBottomLeftRadius: 5,
                borderBottomRightRadius: 5,
              }}
            />
          </View>

          <View style={styles.labelLayer}>
            {Array.from({ length: DEMO_CHUNKS }, (_, gi) => {
              const g = gi + 1;
              const c = (geo.lefts[(g - 1) * DEMO_CHUNK] + geo.rights[(g - 1) * DEMO_CHUNK + 3]) / 2;
              return (
                <Text key={g} style={[styles.chunkNum, { left: c }]}>
                  {g}
                </Text>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.meterRow}>
        <View
          style={[
            styles.pulse,
            {
              backgroundColor: pulseOn ? Palette.accent : Palette.textMuted,
              transform: [{ scale: pulseOn ? 1.3 : 1 }],
            },
          ]}
        />
        <Text style={styles.bpm}>{step.tempo}</Text>
        <Text style={styles.bpmUnit}>bpm</Text>
        <View style={styles.vr} />
        <Text style={styles.doing}>{done ? '' : stepDoingLabel(step)}</Text>
      </View>

      <Text style={styles.caption}>
        {done ? 'That’s interleaved click-up.' : ICU_PHASE_CAPTIONS[step.phase]}
      </Text>

      <View style={styles.progTrack}>
        <View style={[styles.progFill, { width: `${done ? 100 : progress}%` }]} />
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.autoBtn, autoPlay ? styles.autoOn : null]}
          onPress={toggleAuto}
          accessibilityLabel="Toggle auto-play">
          <Text style={[styles.autoText, autoPlay ? styles.autoTextOn : null]}>
            {done ? '▶ Replay' : autoPlay ? '❙❙ Auto' : '▶ Auto'}
          </Text>
        </Pressable>
        <Pressable style={styles.nextBtn} onPress={next}>
          <Text style={styles.nextText}>Next →</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.gotBtn}
        onPress={() => {
          clearTimers();
          stopMelody();
          onDone();
        }}>
        <Text style={styles.gotText}>I got it →</Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  kicker: { fontSize: 13, color: Palette.textSecondary },
  pill: {
    backgroundColor: Palette.accentSoft,
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pillText: { fontSize: 12, color: Palette.accent, fontWeight: Type.weight.semibold },
  notation: {
    backgroundColor: Palette.card,
    borderWidth: 0.5,
    borderColor: Palette.border,
    borderRadius: 8,
    paddingVertical: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  panel: {
    backgroundColor: Palette.card,
    borderWidth: 0.5,
    borderColor: Palette.border,
    borderRadius: 8,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  staff: { flexDirection: 'row', alignItems: 'flex-end', height: 44 },
  bracketLayer: { position: 'relative', height: 14, marginTop: 3 },
  labelLayer: { position: 'relative', height: 14, marginTop: 1 },
  chunkNum: {
    position: 'absolute',
    top: 0,
    marginLeft: -4,
    width: 8,
    textAlign: 'center',
    fontSize: 10,
    color: Palette.textMuted,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  pulse: { width: 13, height: 13, borderRadius: 7 },
  bpm: {
    fontSize: 21,
    fontWeight: Type.weight.semibold,
    color: Palette.text,
    minWidth: 40,
    textAlign: 'center',
  },
  bpmUnit: { fontSize: 12, color: Palette.textMuted },
  vr: { width: 1, height: 16, backgroundColor: Palette.border },
  doing: { fontSize: 12, color: Palette.textSecondary, minWidth: 96, textAlign: 'center' },
  caption: {
    minHeight: 38,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: Palette.text,
    marginBottom: 10,
  },
  progTrack: {
    height: 4,
    backgroundColor: Palette.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progFill: { height: '100%', backgroundColor: Palette.accent },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  autoBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: Palette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoOn: { backgroundColor: Palette.accentSoft, borderColor: Palette.accent },
  autoText: { fontSize: 14, color: Palette.textSecondary, fontWeight: Type.weight.semibold },
  autoTextOn: { color: Palette.accent },
  nextBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: Palette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: { fontSize: 15, color: Palette.text, fontWeight: Type.weight.semibold },
  gotBtn: {
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gotText: { fontSize: 15, color: '#fff', fontWeight: Type.weight.semibold },
});
