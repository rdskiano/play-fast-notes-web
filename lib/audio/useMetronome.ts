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

import { MetronomeEngine, type BeatState, type Subdivision } from './metronomeEngine';

export type { BeatState, Subdivision };

// MIDI note + A4 reference (440/441/442) → frequency in Hz.
function droneHz(midi: number, a4Hz: number): number {
  return a4Hz * Math.pow(2, (midi - 69) / 12);
}

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
  const [droneEnabled, setDroneEnabledState] = useState(false);
  const [droneMidi, setDroneMidiState] = useState(69); // A4
  const [droneSustain, setDroneSustainState] = useState(0.6);
  const [droneA4, setDroneA4State] = useState(440);
  // Groove ("Rhythms") selection. The native engine synthesizes the drum
  // voices (ported from the web engine); this state mirrors the engine's
  // selection so the shared MetronomePanel reflects which groove is active.
  const [activeGroove, setActiveGrooveState] = useState<string | null>(null);
  // "Gaps" random beat-dropper (0..0.8). Mirrors useMetronome.web.ts.
  const [dropChance, setDropChanceState] = useState(0);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Opt-in tempo-bump signal. The MetronomePanel shows a floating "↑ N"
  // only when a caller passes `{ animateBump: true }` to setBpm (today just
  // the Interleaved Click-Up advance). Mirrors useMetronome.web.ts.
  const [bump, setBump] = useState<{ token: number; delta: number }>({
    token: 0,
    delta: 0,
  });

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
    droneEnabled,
    droneMidi,
    droneSustain,
    droneA4,
    activeGroove,
    dropChance,
    bump,
    setBpm(v: number, opts?: { animateBump?: boolean }) {
      const prev = engineRef.current?.bpm ?? bpm;
      engineRef.current?.setBpm(v);
      const next = engineRef.current?.bpm ?? v;
      if (opts?.animateBump) {
        const delta = next - prev;
        if (delta > 0) setBump((b) => ({ token: b.token + 1, delta }));
      }
      setBpmState(next);
    },
    setVolume(v: number) {
      engineRef.current?.setVolume(v);
      setVolumeState(engineRef.current?.volume ?? v);
    },
    setSubdivision(s: Subdivision) {
      engineRef.current?.setSubdivision(s);
      setSubdivisionState(s);
    },
    setBeatPattern(pattern: BeatState[]) {
      engineRef.current?.setBeatPattern(pattern);
    },
    setGroove(id: string | null) {
      engineRef.current?.setGroove(id);
      setActiveGrooveState(id);
    },
    setDroneEnabled(enabled: boolean) {
      engineRef.current?.setDroneEnabled(enabled);
      setDroneEnabledState(enabled);
    },
    setDroneMidi(midi: number) {
      engineRef.current?.setDroneFreq(droneHz(midi, droneA4));
      setDroneMidiState(midi);
    },
    setDroneSustain(frac: number) {
      const f = Math.max(0, Math.min(1, frac));
      engineRef.current?.setDroneSustain(f);
      setDroneSustainState(f);
    },
    setDroneA4(a4Hz: number) {
      engineRef.current?.setDroneFreq(droneHz(droneMidi, a4Hz));
      setDroneA4State(a4Hz);
    },
    setDropChance(frac: number) {
      const v = Math.max(0, Math.min(0.8, frac));
      engineRef.current?.setDropChance(v);
      setDropChanceState(v);
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
    playPitchRhythm(
      freqs: number[],
      tokens: RhythmToken[],
      beatDenominator: number,
    ): void {
      if (sequenceTimerRef.current) {
        clearTimeout(sequenceTimerRef.current);
        sequenceTimerRef.current = null;
      }
      const engine = engineRef.current;
      if (!engine || freqs.length === 0 || tokens.length === 0) return;
      setPlayingSequence(true);
      engine.playPitchRhythm(freqs, tokens, beatDenominator, () => {
        setPlayingSequence(false);
      });
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

// The object useMetronome returns — passed around so a metronome owner
// (e.g. a practice-strategy session) can hand its instance to the UI.
export type MetronomeApi = ReturnType<typeof useMetronome>;
