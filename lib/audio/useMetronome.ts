import { useEffect, useRef, useState } from 'react';

/**
 * Minimal Web Audio API metronome. Schedules clicks ~100ms ahead in the
 * AudioContext clock for stable timing across the main thread's jitter.
 *
 * Web-only: assumes `window.AudioContext` (or webkit-prefixed) is available.
 * On native React Native this hook would need a different implementation;
 * the iPad app uses `react-native-audio-api` for that.
 */
export function useMetronome(initialBpm = 60) {
  const [running, setRunning] = useState(false);
  const [bpm, setBpm] = useState(initialBpm);

  const ctxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmRef = useRef(bpm);

  // Keep the running scheduler in sync with the latest bpm without restarting.
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    if (!running) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (!ctxRef.current) {
      const W = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = W.AudioContext ?? W.webkitAudioContext;
      if (!Ctor) {
        console.warn('Web Audio API not supported in this browser.');
        setRunning(false);
        return;
      }
      ctxRef.current = new Ctor();
    }
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') {
      // Browsers require a user gesture; this hook is invoked after a click
      // anyway, so resume() should succeed.
      ctx.resume().catch(() => undefined);
    }

    nextNoteTimeRef.current = ctx.currentTime + 0.05;

    function scheduler() {
      const c = ctxRef.current;
      if (!c) return;
      while (nextNoteTimeRef.current < c.currentTime + 0.1) {
        const t = nextNoteTimeRef.current;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.exponentialRampToValueAtTime(0.4, t + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.05);
        nextNoteTimeRef.current += 60 / bpmRef.current;
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

  return { running, setRunning, bpm, setBpm };
}
