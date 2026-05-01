import { useEffect, useRef, useState } from 'react';

/**
 * Subdivision = 1 (quarters), 2 (eighths), 3 (triplets). The downbeat is
 * always emphasised; subdivisions are softer.
 */
export type Subdivision = 1 | 2 | 3;

/**
 * Web Audio API metronome with subdivision support and imperative
 * start / stop / toggle, mirroring the iPad metronome surface.
 *
 * Schedules clicks ~100ms ahead in the AudioContext clock for stable timing
 * across main-thread jitter. Web-only: assumes `window.AudioContext`.
 */
export function useMetronome(initialBpm = 60) {
  const [running, setRunning] = useState(false);
  const [bpm, setBpmState] = useState(initialBpm);
  const [subdivision, setSubdivisionState] = useState<Subdivision>(1);
  const [volume, setVolumeState] = useState(0.4);

  const ctxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const subStepRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmRef = useRef(bpm);
  const subRef = useRef<Subdivision>(1);
  const volRef = useRef(volume);

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

  return {
    running,
    bpm,
    subdivision,
    volume,
    setRunning,
    setBpm,
    setSubdivision,
    setVolume,
    start,
    stop,
    toggle,
  };
}
