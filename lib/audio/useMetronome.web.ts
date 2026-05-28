import { useEffect, useRef, useState } from 'react';

import {
  useMicrobreakTimer,
  usePlayItColdTimer,
} from '@/components/PracticeTimersContext';
import { TOKEN_QUARTER_FRACTIONS, type RhythmToken } from '@/lib/strategies/rhythmPatterns';

/**
 * Subdivision = clicks per beat: 1 (quarter), 2 (eighths), 3 (triplet),
 * 4 (sixteenths). The downbeat is always emphasised; subdivisions softer.
 */
export type Subdivision = 1 | 2 | 3 | 4;

// Persist the user's preferred metronome volume across sessions and across
// every screen that mounts its own `useMetronome` instance. The metronome
// device looks identical on every passage, document, and practice screen —
// the volume the user set on one should carry over to the next.
const VOLUME_STORAGE_KEY = 'pfn:metronome-volume';
const DEFAULT_VOLUME = 0.7;

function readSavedVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_VOLUME;
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(1, n));
  } catch {
    return DEFAULT_VOLUME;
  }
}

function writeSavedVolume(v: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(v));
  } catch {
    // localStorage can throw in private mode — keep volume session-only.
  }
}

// One entry per beat of the measure: 'accent' (loud), 'normal' (mid), or
// 'mute' (skipped). Mirrors lib/audio/metronomeEngine.ts.
export type BeatState = 'accent' | 'normal' | 'mute';

/**
 * Web Audio API metronome with subdivision support, imperative
 * start / stop / toggle, plus a rhythm-pattern looper used by Rhythmic
 * Variation. Mirrors the iPad metronome surface.
 */
export function useMetronome(initialBpm = 60) {
  const [running, setRunning] = useState(false);
  const [bpm, setBpmState] = useState(initialBpm);
  const [subdivision, setSubdivisionState] = useState<Subdivision>(1);
  const [volume, setVolumeState] = useState<number>(readSavedVolume);
  const [rhythmLooping, setRhythmLooping] = useState(false);
  const [droneEnabled, setDroneEnabledState] = useState(false);
  const [droneMidi, setDroneMidiState] = useState(69); // A4
  const [droneSustain, setDroneSustainState] = useState(0.6);
  const [droneA4, setDroneA4State] = useState(440);
  // Opt-in tempo-bump signal. The MetronomePanel shows a floating "↑ N"
  // only when a caller passes `{ animateBump: true }` to setBpm (today just
  // the Interleaved Click-Up advance). `token` changes on each animated
  // bump; `delta` is the BPM increase to display.
  const [bump, setBump] = useState<{ token: number; delta: number }>({
    token: 0,
    delta: 0,
  });

  const ctxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const subStepRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmRef = useRef(bpm);
  const subRef = useRef<Subdivision>(1);
  const volRef = useRef(volume);
  // Per-beat accent/normal/mute pattern. Default is a single accented beat
  // (uniform, meterless) so practice-flow callers that never set a pattern
  // keep the old behaviour. The MetronomePanel overrides it.
  const beatPatternRef = useRef<BeatState[]>(['accent']);
  const droneEnabledRef = useRef(false);
  const droneFreqRef = useRef(440);
  const droneSustainRef = useRef(0.6);

  // Rhythm loop state
  const rhythmTokensRef = useRef<RhythmToken[] | null>(null);
  const rhythmBeatDenomRef = useRef<number>(4);
  const rhythmNextStartRef = useRef<number>(0);
  const rhythmTokenIdxRef = useRef<number>(0);
  const rhythmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rhythmGateRef = useRef<GainNode | null>(null);

  // Pitch-rhythm playback state. Lookahead-scheduled (~250 ms ahead) so
  // changes to BPM during playback retempo the remaining notes live, and
  // the BPM is interpreted against the exercise's time-signature
  // denominator (an "8" token in 3/8 lasts one beat at the current BPM).
  const pitchFreqsRef = useRef<number[] | null>(null);
  const pitchTokensRef = useRef<RhythmToken[] | null>(null);
  const pitchBeatDenomRef = useRef<number>(4);
  const pitchIdxRef = useRef<number>(0);
  const pitchNextStartRef = useRef<number>(0);
  const pitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pitchGateRef = useRef<GainNode | null>(null);
  const pitchEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref-mirror of `running` so non-render code (the pitch-rhythm
  // start-time computation) can see live state without going stale.
  const runningRef = useRef(false);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    subRef.current = subdivision;
  }, [subdivision]);
  useEffect(() => {
    volRef.current = volume;
    writeSavedVolume(volume);
  }, [volume]);
  useEffect(() => {
    droneEnabledRef.current = droneEnabled;
  }, [droneEnabled]);
  useEffect(() => {
    droneFreqRef.current = droneA4 * Math.pow(2, (droneMidi - 69) / 12);
  }, [droneMidi, droneA4]);
  useEffect(() => {
    droneSustainRef.current = droneSustain;
  }, [droneSustain]);

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
      // Browser may suspend the AudioContext when the laptop sleeps or the
      // tab stays hidden too long — resume on the way back.
      if (c.state === 'suspended') {
        c.resume().catch(() => undefined);
      }
      // If we fell way behind (sleep / freeze), resync to "now" instead of
      // trying to fire every missed beat at once.
      if (nextNoteTimeRef.current < c.currentTime - 0.5) {
        nextNoteTimeRef.current = c.currentTime + 0.05;
        subStepRef.current = 0;
      }
      while (nextNoteTimeRef.current < c.currentTime + 0.1) {
        const t = nextNoteTimeRef.current;
        const sub = subRef.current;
        const pattern = beatPatternRef.current;
        // subStepRef counts ticks within the current measure.
        const ticksPerMeasure = (pattern.length || 1) * sub;
        const tim = subStepRef.current % ticksPerMeasure;
        const beatIndex = Math.floor(tim / sub);
        const isBeatStart = tim % sub === 0;
        const beatState = pattern[beatIndex] ?? 'normal';
        if (beatState !== 'mute') {
          if (droneEnabledRef.current) {
            // Drone-click: a pitched tone with a fast, defined attack that
            // always ends before the next tick so each beat stays
            // articulated. Sustain is squared so low steps stay short.
            const tickSec = 60 / bpmRef.current / sub;
            const ATTACK = 0.004;
            const RELEASE = 0.045;
            const MIN_TONE = 0.06;
            const maxTone = Math.max(MIN_TONE, tickSec * 0.9);
            const sus = droneSustainRef.current * droneSustainRef.current;
            const toneLen = MIN_TONE + (maxTone - MIN_TONE) * sus;
            const tier = isBeatStart
              ? beatState === 'accent'
                ? 1.0
                : 0.72
              : 0.5;
            const peak = Math.max(0.0002, volRef.current * tier * 0.7);
            const releaseStart = t + Math.max(ATTACK, toneLen - RELEASE);
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'triangle';
            osc.frequency.value = droneFreqRef.current;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.linearRampToValueAtTime(peak, t + ATTACK);
            gain.gain.setValueAtTime(peak, releaseStart);
            gain.gain.linearRampToValueAtTime(0.0001, t + toneLen);
            osc.connect(gain).connect(c.destination);
            osc.start(t);
            osc.stop(t + toneLen + 0.02);
          } else {
            // Click synth — higher frequencies + square wave (more
            // harmonics) for a sharper "tick" that cuts through; 2× gain
            // headroom so the user's saved volume actually moves the
            // perceived loudness across its full slider range (matches the
            // native engine's `_volume * 2` headroom). Faster decay (30ms)
            // keeps the click crisp instead of "boopy".
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'square';
            osc.frequency.value = isBeatStart
              ? beatState === 'accent'
                ? 2200
                : 1800
              : 1400;
            const level = isBeatStart
              ? beatState === 'accent'
                ? 1.0
                : 0.7
              : 0.5;
            const peak = Math.min(2, level * volRef.current * 2);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.001);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
            osc.connect(gain).connect(c.destination);
            osc.start(t);
            osc.stop(t + 0.04);
          }
        }
        subStepRef.current = (subStepRef.current + 1) % ticksPerMeasure;
        nextNoteTimeRef.current += 60 / bpmRef.current / sub;
      }
      timerRef.current = setTimeout(scheduler, 25);
    }

    scheduler();

    // Resync as soon as the tab regains focus so the user does not have to
    // wait for the next throttled setTimeout to fire after waking.
    function onVisibility() {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      const c = ctxRef.current;
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => undefined);
      nextNoteTimeRef.current = c.currentTime + 0.05;
      subStepRef.current = 0;
      if (rhythmTokensRef.current) {
        rhythmNextStartRef.current = c.currentTime + 0.08;
        rhythmTokenIdxRef.current = 0;
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [running]);

  // Auto-pause during interruptions (microbreak / Play It Cold). If the
  // metronome or rhythm loop was running when the interruption started,
  // resume after it ends. Mirrors the iPad pattern in lib/metronome.
  const microbreak = useMicrobreakTimer();
  const playItCold = usePlayItColdTimer();
  const interrupted = Boolean(microbreak.firing || playItCold.firing);
  const resumeStateRef = useRef<{
    metronome: boolean;
    rhythm: { tokens: RhythmToken[]; beatDenominator: number } | null;
  } | null>(null);
  useEffect(() => {
    if (interrupted) {
      if (resumeStateRef.current) return; // already snapshotted
      const wasRunning = running;
      const wasRhythm = rhythmTokensRef.current;
      const beatDenom = rhythmBeatDenomRef.current;
      if (!wasRunning && !wasRhythm) return; // nothing to silence
      resumeStateRef.current = {
        metronome: wasRunning,
        rhythm: wasRhythm ? { tokens: wasRhythm.slice(), beatDenominator: beatDenom } : null,
      };
      if (wasRunning) setRunning(false);
      if (wasRhythm) stopRhythmLoop();
    } else {
      const snap = resumeStateRef.current;
      if (!snap) return;
      resumeStateRef.current = null;
      if (snap.metronome) setRunning(true);
      if (snap.rhythm) startRhythmLoop(snap.rhythm.tokens, snap.rhythm.beatDenominator);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interrupted]);

  function setBpm(v: number, opts?: { animateBump?: boolean }) {
    const next = Math.max(20, Math.min(300, Math.round(v)));
    if (opts?.animateBump) {
      const delta = next - bpmRef.current;
      if (delta > 0) setBump((b) => ({ token: b.token + 1, delta }));
    }
    setBpmState(next);
  }
  function setSubdivision(s: Subdivision) {
    setSubdivisionState(s);
  }
  function setBeatPattern(pattern: BeatState[]) {
    if (pattern.length > 0) beatPatternRef.current = pattern.slice();
  }
  function setDroneEnabled(enabled: boolean) {
    setDroneEnabledState(enabled);
  }
  function setDroneMidi(midi: number) {
    setDroneMidiState(midi);
  }
  function setDroneSustain(frac: number) {
    setDroneSustainState(Math.max(0, Math.min(1, frac)));
  }
  function setDroneA4(a4Hz: number) {
    setDroneA4State(a4Hz);
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
    // Same suspended/resync handling as the metronome scheduler — laptop
    // sleep can suspend the AudioContext and starve the lookahead.
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }
    if (rhythmNextStartRef.current < ctx.currentTime - 0.5) {
      rhythmNextStartRef.current = ctx.currentTime + 0.08;
      rhythmTokenIdxRef.current = 0;
    }
    const beatDenom = rhythmBeatDenomRef.current;
    // BPM means "denominator-units per minute" (conventional musical
    // interpretation). secondsPerEighth = (60/bpm) when denom=8, etc.
    // → secondsPerQuarter = secondsPerDenom * (denom/4).
    const secondsPerQuarter = (60 / bpmRef.current) * (beatDenom / 4);
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

  // Lookahead tick for the pitch-rhythm scheduler. Reads bpm + denominator
  // from refs each iteration, so a BPM change during playback retempos the
  // remaining notes live (same pattern the metronome's rhythmTick uses).
  function pitchTick() {
    const ctx = ctxRef.current;
    const freqs = pitchFreqsRef.current;
    const tokens = pitchTokensRef.current;
    const gate = pitchGateRef.current;
    if (!ctx || !freqs || !tokens || !gate) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }
    // If the audio clock fell far behind (laptop sleep, tab throttled),
    // bail rather than spam-scheduling old notes.
    if (pitchNextStartRef.current < ctx.currentTime - 0.5) {
      pitchNextStartRef.current = ctx.currentTime + 0.05;
    }
    const beatDenom = pitchBeatDenomRef.current;
    // See rhythmTick: BPM = denominator-units per minute (conventional).
    const secondsPerQuarter = (60 / bpmRef.current) * (beatDenom / 4);
    // Schedule notes whose start time falls within the next ~250 ms.
    while (
      pitchIdxRef.current < freqs.length &&
      pitchNextStartRef.current < ctx.currentTime + 0.25
    ) {
      const i = pitchIdxRef.current;
      // Tokens repeat as we wrap across chunks (same pattern, next pitches).
      const token = tokens[i % tokens.length];
      const dur = TOKEN_QUARTER_FRACTIONS[token] * secondsPerQuarter;
      const t = pitchNextStartRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freqs[i];
      const peak = 0.5 * volRef.current;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.85);
      osc.connect(gain).connect(gate);
      osc.start(t);
      osc.stop(t + dur);
      pitchNextStartRef.current += dur;
      pitchIdxRef.current = i + 1;
    }
    // All notes scheduled — clear playingSequence shortly after the last
    // one is due to finish ringing out.
    if (pitchIdxRef.current >= freqs.length) {
      const remainingSec = pitchNextStartRef.current - ctx.currentTime;
      if (pitchEndTimerRef.current) clearTimeout(pitchEndTimerRef.current);
      pitchEndTimerRef.current = setTimeout(
        () => setPlayingSequence(false),
        Math.max(0, Math.ceil(remainingSec * 1000)) + 120,
      );
      return;
    }
    pitchTimerRef.current = setTimeout(pitchTick, 50);
  }

  // Start a pitch-rhythm sequence. `tokens` is the rhythm pattern (one
  // chunk, e.g. ["8","16","16","8"]); the scheduler walks `freqs`
  // beat-by-beat, wrapping the tokens modulo their length. Duration of
  // each token is computed against the metronome's live BPM and the
  // passed `beatDenominator` (so the BPM means "denominator-units per
  // minute" — conventional musical interpretation).
  function playPitchRhythm(
    freqs: number[],
    tokens: RhythmToken[],
    beatDenominator: number,
  ): void {
    if (freqs.length === 0 || tokens.length === 0) return;
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    stopPitchSequence();
    const gate = ctx.createGain();
    gate.gain.value = 1;
    gate.connect(ctx.destination);
    pitchGateRef.current = gate;
    pitchFreqsRef.current = freqs.slice();
    pitchTokensRef.current = tokens.slice();
    pitchBeatDenomRef.current = beatDenominator;
    pitchIdxRef.current = 0;
    pitchNextStartRef.current = computePitchStartTime(ctx);
    setPlayingSequence(true);
    pitchTick();
  }

  // If the metronome is currently clicking, align the first pitch with
  // the next downbeat (beat 1 of the next measure) so the exercise lines
  // up with the click track audibly. Otherwise, start ~80 ms ahead so
  // the audio thread has time to commit the first note.
  function computePitchStartTime(ctx: AudioContext): number {
    const defaultStart = ctx.currentTime + 0.08;
    if (!runningRef.current) return defaultStart;
    const sub = subRef.current;
    const beats = beatPatternRef.current.length;
    if (sub <= 0 || beats <= 0) return defaultStart;
    const ticksPerMeasure = beats * sub;
    const tickSec = 60 / bpmRef.current / sub;
    // subStepRef.current is the index of the NEXT tick to be scheduled,
    // and nextNoteTimeRef.current is when that tick will fire. Walk
    // forward to the next tick whose index is a multiple of
    // ticksPerMeasure (a downbeat).
    const idx = ((subStepRef.current % ticksPerMeasure) + ticksPerMeasure) %
      ticksPerMeasure;
    const ticksTilDownbeat = idx === 0 ? 0 : ticksPerMeasure - idx;
    let downbeat = nextNoteTimeRef.current + ticksTilDownbeat * tickSec;
    // Need at least ~50 ms of lead time to schedule reliably. If the
    // computed downbeat is too close (or already past), skip to the
    // following measure.
    while (downbeat < ctx.currentTime + 0.05) {
      downbeat += ticksPerMeasure * tickSec;
    }
    return downbeat;
  }

  function stopPitchSequence() {
    if (pitchTimerRef.current) {
      clearTimeout(pitchTimerRef.current);
      pitchTimerRef.current = null;
    }
    if (pitchEndTimerRef.current) {
      clearTimeout(pitchEndTimerRef.current);
      pitchEndTimerRef.current = null;
    }
    if (sequenceTimerRef.current) {
      clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }
    pitchFreqsRef.current = null;
    pitchTokensRef.current = null;
    pitchIdxRef.current = 0;
    setPlayingSequence(false);
    // Mute the per-sequence gate so any in-flight oscillators silence
    // immediately, then disconnect it. The shared AudioContext stays
    // alive so the metronome can keep playing.
    const gate = pitchGateRef.current;
    if (gate) {
      try {
        gate.gain.value = 0;
        gate.disconnect();
      } catch {
        // ignore
      }
      pitchGateRef.current = null;
    }
  }

  return {
    running,
    bpm,
    subdivision,
    volume,
    rhythmLooping,
    playingSequence,
    droneEnabled,
    droneMidi,
    droneSustain,
    droneA4,
    bump,
    setBpm,
    setSubdivision,
    setBeatPattern,
    setDroneEnabled,
    setDroneMidi,
    setDroneSustain,
    setDroneA4,
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
