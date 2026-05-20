// Native (iOS/Android) metronome hook. Wraps MetronomeEngine and matches
// the return shape of lib/audio/useMetronome.web.ts so cross-platform
// callers import either via Metro's .ts / .web.ts resolution.
//
// Ported from learn-fast-notes/lib/metronome/useMetronome.ts.

import { useEffect, useRef, useState } from 'react';

import {
  useMicrobreakTimer,
  usePlayItColdTimer,
} from '@/components/PracticeTimersContext';
import type { RhythmToken } from '@/lib/strategies/rhythmPatterns';

import { MetronomeEngine, type Subdivision } from './metronomeEngine';

export type { Subdivision };

export function useMetronome(initialBpm: number = 60) {
  const engineRef = useRef<MetronomeEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new MetronomeEngine();
    engineRef.current.setBpm(initialBpm);
  }
  const [bpm, setBpmState] = useState(initialBpm);
  const [subdivision, setSubdivisionState] = useState<Subdivision>(1);
  const [running, setRunning] = useState(false);
  // Default to the middle of the 5-step VolumeSlider (0.6 = segment 3 of 5).
  const [volume, setVolumeState] = useState(0.6);
  const [rhythmLooping, setRhythmLooping] = useState(false);
  const [playingSequence, setPlayingSequence] = useState(false);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-pause during interruptions (microbreak / Play It Cold). If the
  // metronome was running when the interruption started, resume when it ends.
  const microbreak = useMicrobreakTimer();
  const playItCold = usePlayItColdTimer();
  const interrupted = Boolean(microbreak.firing || playItCold.firing);
  const shouldResumeRef = useRef(false);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (interrupted) {
      if (engine.isRunning) {
        engine.stop();
        setRunning(false);
        shouldResumeRef.current = true;
      }
    } else if (shouldResumeRef.current) {
      shouldResumeRef.current = false;
      if (!engine.isRunning) {
        engine.start();
        setRunning(true);
      }
    }
  }, [interrupted]);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return {
    bpm,
    subdivision,
    running,
    volume,
    rhythmLooping,
    playingSequence,
    setBpm(v: number) {
      engineRef.current?.setBpm(v);
      setBpmState(engineRef.current?.bpm ?? v);
    },
    setVolume(v: number) {
      engineRef.current?.setVolume(v);
      setVolumeState(engineRef.current?.volume ?? v);
    },
    setSubdivision(s: Subdivision) {
      engineRef.current?.setSubdivision(s);
      setSubdivisionState(s);
    },
    start() {
      engineRef.current?.start();
      setRunning(true);
      shouldResumeRef.current = false;
    },
    stop() {
      engineRef.current?.stop();
      setRunning(false);
      shouldResumeRef.current = false;
    },
    toggle() {
      if (engineRef.current?.isRunning) {
        engineRef.current.stop();
        setRunning(false);
      } else {
        engineRef.current?.start();
        setRunning(true);
      }
      shouldResumeRef.current = false;
    },
    startRhythmLoop(tokens: RhythmToken[], beatDenominator = 4) {
      engineRef.current?.startRhythmLoop(tokens, beatDenominator);
      setRhythmLooping(true);
    },
    stopRhythmLoop() {
      engineRef.current?.stopRhythmLoop();
      setRhythmLooping(false);
    },
    toggleRhythmLoop(tokens: RhythmToken[], beatDenominator = 4) {
      if (engineRef.current?.isRhythmLooping) {
        engineRef.current.stopRhythmLoop();
        setRhythmLooping(false);
      } else {
        engineRef.current?.startRhythmLoop(tokens, beatDenominator);
        setRhythmLooping(true);
      }
    },
    playPitch(freqHz: number, durationSec?: number) {
      engineRef.current?.playPitch(freqHz, durationSec);
    },
    playPitchSequence(freqs: number[], secondsPerNote: number): number {
      const dur = engineRef.current?.playPitchSequence(freqs, secondsPerNote) ?? 0;
      if (dur > 0) {
        setPlayingSequence(true);
        if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
        sequenceTimerRef.current = setTimeout(
          () => setPlayingSequence(false),
          Math.ceil(dur * 1000) + 150,
        );
      }
      return dur;
    },
    playPitchRhythm(freqs: number[], durations: number[]): number {
      const dur = engineRef.current?.playPitchRhythm(freqs, durations) ?? 0;
      if (dur > 0) {
        setPlayingSequence(true);
        if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
        sequenceTimerRef.current = setTimeout(
          () => setPlayingSequence(false),
          Math.ceil(dur * 1000) + 150,
        );
      }
      return dur;
    },
    stopPitchSequence() {
      engineRef.current?.stopPitchSequence();
      if (sequenceTimerRef.current) {
        clearTimeout(sequenceTimerRef.current);
        sequenceTimerRef.current = null;
      }
      setPlayingSequence(false);
    },
  };
}
