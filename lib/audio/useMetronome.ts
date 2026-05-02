import { useEffect, useRef, useState } from 'react';

import { TOKEN_QUARTER_FRACTIONS, type RhythmToken } from '@/lib/strategies/rhythmPatterns';

/**
 * Subdivision = 1 (quarters), 2 (eighths), 3 (triplets). The downbeat is
 * always emphasised; subdivisions are softer.
 */
export type Subdivision = 1 | 2 | 3;

/**
 * Web Audio API metronome with subdivision support, imperative
 * start / stop / toggle, plus a rhythm-pattern looper used by Rhythmic
 * Variation. Mirrors the iPad metronome surface.
 */
export function useMetronome(initialBpm = 60) {
  const [running, setRunning] = useState(false);
  const [bpm, setBpmState] = useState(initialBpm);
  const [subdivision, setSubdivisionState] = useState<Subdivision>(1);
  const [volume, setVolumeState] = useState(0.4);
  const [rhythmLooping, setRhythmLooping] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const subStepRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmRef = useRef(bpm);
  const subRef = useRef<Subdivision>(1);
  const volRef = useRef(volume);

  // Rhythm loop state
  const rhythmTokensRef = useRef<RhythmToken[] | null>(null);
  const rhythmBeatDenomRef = useRef<number>(4);
  const rhythmNextStartRef = useRef<number>(0);
  const rhythmTokenIdxRef = useRef<number>(0);
  const rhythmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rhythmGateRef = useRef<GainNode | null>(null);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    subRef.current = subdivision;
  }, [subdivision]);
  useEffect(() => {
    volRef.current = volume;
  }, [volume]);

  function ensureContext(): AudioContext | null {
    if (ctxRef.current) return ctxRef.current;
    const W = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = W.AudioContext ?? W.webkitAudioContext;
    if (!Ctor) {
      console.warn('Web Audio API not supported in this browser.');
      return null;
    }
    ctxRef.current = new Ctor();
    return ctxRef.current;
  }

  useEffect(() => {
    if (!running) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const ctx = ensureContext();
    if (!ctx) {
      setRunning(false);
      return;
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    nextNoteTimeRef.current = ctx.currentTime + 0.05;
    subStepRef.current = 0;

    function scheduler() {
      const c = ctxRef.current;
      if (!c) return;
      while (nextNoteTimeRef.current < c.currentTime + 0.1) {
        const t = nextNoteTimeRef.current;
        const sub = subRef.current;
        const isDownbeat = subStepRef.current === 0;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.frequency.value = isDownbeat ? 1200 : 800;
        const peak = (isDownbeat ? 1.0 : 0.5) * volRef.current;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.05);
        subStepRef.current = (subStepRef.current + 1) % sub;
        nextNoteTimeRef.current += 60 / bpmRef.current / sub;
      }
      timerRef.current = setTimeout(scheduler, 25);
    }

    scheduler();

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running]);

  function setBpm(v: number) {
    setBpmState(Math.max(20, Math.min(300, Math.round(v))));
  }
  function setSubdivision(s: Subdivision) {
    setSubdivisionState(s);
  }
  function setVolume(v: number) {
    setVolumeState(Math.max(0, Math.min(1, v)));
  }
  function start() {
    setRunning(true);
  }
  function stop() {
    setRunning(false);
  }
  function toggle() {
    setRunning((prev) => !prev);
  }

  // ── Rhythm loop ────────────────────────────────────────────────────
  // Plays a list of rhythm tokens at the current BPM, looping forever.
  // Each token is one click whose offset to the next click is its
  // quarter-note fraction times the seconds-per-quarter at the current
  // BPM. The first note of each cycle is accented.

  function rhythmTick() {
    const ctx = ctxRef.current;
    const tokens = rhythmTokensRef.current;
    const gate = rhythmGateRef.current;
    if (!ctx || !tokens || tokens.length === 0 || !gate) return;
    const beatDenom = rhythmBeatDenomRef.current;
    const secondsPerQuarter = (4 / beatDenom) * (60 / bpmRef.current);
    // Schedule notes whose start time is within the next ~250 ms.
    while (rhythmNextStartRef.current < ctx.currentTime + 0.25) {
      const idx = rhythmTokenIdxRef.current;
      const token = tokens[idx];
      const t = rhythmNextStartRef.current;
      const isDownbeat = idx === 0;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = isDownbeat ? 1500 : 1100;
      const peak = (isDownbeat ? 1.0 : 0.6) * volRef.current;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.connect(g).connect(gate);
      osc.start(t);
      osc.stop(t + 0.05);

      const tokDur = TOKEN_QUARTER_FRACTIONS[token] * secondsPerQuarter;
      rhythmNextStartRef.current += tokDur;
      rhythmTokenIdxRef.current = (idx + 1) % tokens.length;
    }
    rhythmTimerRef.current = setTimeout(rhythmTick, 50);
  }

  function startRhythmLoop(tokens: RhythmToken[], beatDenominator = 4) {
    if (tokens.length === 0) return;
    stopRhythmLoop();
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    const gate = ctx.createGain();
    gate.gain.value = 1;
    gate.connect(ctx.destination);
    rhythmGateRef.current = gate;
    rhythmTokensRef.current = tokens.slice();
    rhythmBeatDenomRef.current = beatDenominator;
    rhythmTokenIdxRef.current = 0;
    rhythmNextStartRef.current = ctx.currentTime + 0.08;
    setRhythmLooping(true);
    rhythmTick();
  }

  function stopRhythmLoop() {
    rhythmTokensRef.current = null;
    if (rhythmTimerRef.current !== null) {
      clearTimeout(rhythmTimerRef.current);
      rhythmTimerRef.current = null;
    }
    const gate = rhythmGateRef.current;
    rhythmGateRef.current = null;
    setRhythmLooping(false);
    if (gate && ctxRef.current) {
      try {
        const now = ctxRef.current.currentTime;
        gate.gain.setValueAtTime(gate.gain.value, now);
        gate.gain.linearRampToValueAtTime(0, now + 0.02);
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          gate.disconnect();
        } catch {
          // ignore
        }
      }, 80);
    }
  }

  function toggleRhythmLoop(tokens: RhythmToken[], beatDenominator = 4) {
    if (rhythmTokensRef.current) {
      stopRhythmLoop();
    } else {
      startRhythmLoop(tokens, beatDenominator);
    }
  }

  // ── Pitch playback (Exercise Builder) ──────────────────────────────
  // One-shot or sequence of sine-wave tones. Used by the entry-phase
  // piano keyboard to sound the tapped note, and by the Play button to
  // hear the entered passage straight through.
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playingSequence, setPlayingSequence] = useState(false);

  function playPitch(freqHz: number, durationSec = 0.4) {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    const t = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freqHz;
    const peak = 0.5 * volRef.current;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durationSec + 0.05);
  }

  function playPitchSequence(freqs: number[], secondsPerNote: number): number {
    const ctx = ensureContext();
    if (!ctx || freqs.length === 0) return 0;
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    const start = ctx.currentTime + 0.05;
    for (let i = 0; i < freqs.length; i++) {
      const t = start + i * secondsPerNote;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freqs[i];
      const peak = 0.5 * volRef.current;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + secondsPerNote * 0.85);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + secondsPerNote);
    }
    const totalSec = freqs.length * secondsPerNote;
    setPlayingSequence(true);
    if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
    sequenceTimerRef.current = setTimeout(
      () => setPlayingSequence(false),
      Math.ceil(totalSec * 1000) + 150,
    );
    return totalSec;
  }

  function playPitchRhythm(freqs: number[], durations: number[]): number {
    const ctx = ensureContext();
    if (!ctx || freqs.length === 0) return 0;
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    let cursor = ctx.currentTime + 0.05;
    for (let i = 0; i < freqs.length; i++) {
      const dur = durations[i] ?? 0.3;
      const t = cursor;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freqs[i];
      const peak = 0.5 * volRef.current;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.85);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      cursor += dur;
    }
    const totalSec = cursor - (ctx.currentTime + 0.05);
    setPlayingSequence(true);
    if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
    sequenceTimerRef.current = setTimeout(
      () => setPlayingSequence(false),
      Math.ceil(totalSec * 1000) + 150,
    );
    return totalSec;
  }

  function stopPitchSequence() {
    if (sequenceTimerRef.current) {
      clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }
    setPlayingSequence(false);
    // Re-create the AudioContext to silence any in-flight oscillators.
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.close().catch(() => undefined);
      ctxRef.current = null;
    }
  }

  return {
    running,
    bpm,
    subdivision,
    volume,
    rhythmLooping,
    playingSequence,
    setRunning,
    setBpm,
    setSubdivision,
    setVolume,
    start,
    stop,
    toggle,
    startRhythmLoop,
    stopRhythmLoop,
    toggleRhythmLoop,
    playPitch,
    playPitchSequence,
    playPitchRhythm,
    stopPitchSequence,
  };
}
