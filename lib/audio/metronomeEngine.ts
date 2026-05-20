// Native metronome engine backed by react-native-audio-api (Web Audio API
// for React Native). Ported from learn-fast-notes/lib/metronome/engine.ts.
//
// The web counterpart (lib/audio/useMetronome.web.ts) talks to the
// browser's AudioContext directly without an engine class because the
// browser already provides one. On native, we wrap the lookahead-
// scheduled oscillator/buffer logic in this class so the hook stays
// thin and the React lifecycle owns disposal.

import { NativeModules } from 'react-native';

import { TOKEN_QUARTER_FRACTIONS, type RhythmToken } from '@/lib/strategies/rhythmPatterns';

export type Subdivision = 1 | 2 | 3;

// Lazy reference to react-native-audio-api so a missing native module
// degrades gracefully instead of crashing at import time.
type RnAudioBuffer = {
  length: number;
  sampleRate: number;
  duration: number;
  getChannelData: (channel: number) => Float32Array;
};

type AudioContextCtor = new () => {
  currentTime: number;
  sampleRate: number;
  state: 'running' | 'suspended' | 'closed';
  destination: unknown;
  createOscillator: () => {
    frequency: { value: number };
    type: string;
    connect: (n: unknown) => void;
    start: (when?: number) => void;
    stop: (when?: number) => void;
  };
  createGain: () => {
    gain: {
      value: number;
      setValueAtTime: (v: number, when: number) => void;
      linearRampToValueAtTime: (v: number, when: number) => void;
      exponentialRampToValueAtTime: (v: number, when: number) => void;
    };
    connect: (n: unknown) => void;
  };
  createBuffer: (channels: number, length: number, sampleRate: number) => RnAudioBuffer;
  createBufferSource: () =>
    | {
        buffer: RnAudioBuffer | null;
        connect: (n: unknown) => void;
        start: (when?: number) => void;
      }
    | Promise<{
        buffer: RnAudioBuffer | null;
        connect: (n: unknown) => void;
        start: (when?: number) => void;
      }>;
  resume: () => Promise<void>;
  close: () => Promise<void>;
};

type RnAudioContext = InstanceType<AudioContextCtor>;
type RnGainNode = ReturnType<RnAudioContext['createGain']>;

let audioApi: { AudioContext: AudioContextCtor } | null = null;
let audioApiTried = false;

// Heuristic: react-native-audio-api registers its TurboModule under one of
// these names. If none exist on the NativeModules registry, the native side
// isn't linked into this dev client and we must NOT touch the JS module at
// all — loading it would fire an uncaught ErrorUtils report that LogBox
// catches even when we try/catch around require().
function isNativeModulePresent(): boolean {
  const mods = NativeModules as unknown as Record<string, unknown>;
  return !!(mods.AudioAPIModule || mods.RNAudioAPIModule || mods.AudioAPI);
}

function loadAudioApi(): { AudioContext: AudioContextCtor } | null {
  if (audioApi || audioApiTried) return audioApi;
  audioApiTried = true;
  if (!isNativeModulePresent()) {
    audioApi = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audioApi = require('react-native-audio-api');
  } catch {
    audioApi = null;
    return null;
  }
  // Configure the iOS audio session for playback. Without this, the
  // AudioContext schedules clicks but the session sits in an inactive
  // category and nothing reaches the speaker until another app
  // (YouTube, etc.) activates the session. defaultToSpeaker routes to
  // the device speaker rather than the earpiece; mixWithOthers lets
  // music keep playing in parallel.
  try {
    const am = (audioApi as { AudioManager?: {
      setAudioSessionOptions: (o: {
        iosCategory?: 'record' | 'ambient' | 'playback' | 'multiRoute' | 'soloAmbient' | 'playAndRecord';
        iosOptions?: string[];
        iosMode?: string;
      }) => void;
      setAudioSessionActivity: (enabled: boolean) => Promise<boolean>;
    } }).AudioManager;
    if (am) {
      am.setAudioSessionOptions({
        iosCategory: 'playback',
        iosOptions: ['defaultToSpeaker', 'mixWithOthers'],
      });
      void am.setAudioSessionActivity(true);
    }
  } catch {
    // Non-fatal: session may not be configurable on this platform/version.
    // The metronome will still try to play; behavior matches pre-config state.
  }
  return audioApi;
}

// Tuning (matches the user's prototype)
const BEAT_FREQ = 2400;
const SUB_FREQ = 1400;
const BEAT_GAIN = 0.9;
const SUB_GAIN = 0.5;
const ATTACK_S = 0.003;
const CLICK_LEN_S = 0.075;

// Lookahead scheduler knobs
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.25;

/**
 * Metronome backed by react-native-audio-api using lookahead-scheduled
 * oscillator bursts. A loose setTimeout loop checks every LOOKAHEAD_MS
 * and queues any clicks that fall inside the next SCHEDULE_AHEAD_S
 * window using sample-accurate `oscillator.start(when)` / `stop(when)`
 * times. Even if JS timers are late by tens of ms, the audio events
 * were already scheduled with exact hardware timing — no drift, no gaps.
 */
export class MetronomeEngine {
  private ctx: RnAudioContext | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextNoteTime = 0;
  private subCount = 0;
  private unavailable = false;

  // Pre-rendered click buffers. Built once per AudioContext. Each tick
  // creates a BufferSource pointing at the correct buffer and calls
  // start(when). No envelope automation per tick, no oscillator
  // lifecycle churn, no opportunity for startup transients.
  private accentBuffer: RnAudioBuffer | null = null;
  private subBuffer: RnAudioBuffer | null = null;

  // rhythm loop state
  private rhythmTimer: ReturnType<typeof setTimeout> | null = null;
  private rhythmTokens: RhythmToken[] | null = null;
  private rhythmBeatDenom = 4;
  private rhythmNextStart = 0;
  // Rhythm clicks route through this dedicated gain node so
  // stopRhythmLoop can mute anything already scheduled in the
  // ~250 ms lookahead window.
  private rhythmGate: RnGainNode | null = null;

  /** Same pattern for pitch-sequence playback so Play can toggle to Stop. */
  private pitchGate: RnGainNode | null = null;

  private _bpm = 80;
  private _subdivision: Subdivision = 1;
  private _volume = 0.5;
  private running = false;

  get bpm() {
    return this._bpm;
  }
  get subdivision() {
    return this._subdivision;
  }
  get volume() {
    return this._volume;
  }
  get isRunning() {
    return this.running;
  }

  setBpm(bpm: number) {
    this._bpm = Math.max(20, Math.min(400, Math.round(bpm)));
  }

  setSubdivision(s: Subdivision) {
    if (s === this._subdivision) return;
    this._subdivision = s;
    this.subCount = 0;
    if (this.running) {
      this.nextNoteTime = (this.ctx?.currentTime ?? 0) + 0.05;
    }
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
  }

  start() {
    this.running = true;
    if (this.unavailable) return;
    this.ensureCtx();
    if (!this.ctx) return;
    try {
      this.subCount = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    } catch {
      this.unavailable = true;
      this.ctx = null;
      return;
    }
    this.tick();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** One-shot pitch with a short triangle-wave envelope. */
  playPitch(frequencyHz: number, durationSec = 0.55) {
    if (this.unavailable || frequencyHz <= 0) return;
    this.ensureCtx();
    if (!this.ctx) return;
    let when: number;
    try {
      when = this.ctx.currentTime + 0.005;
    } catch {
      this.unavailable = true;
      this.ctx = null;
      return;
    }
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = frequencyHz;
      osc.type = 'triangle';
      const peak = 0.32;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peak, when + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, when + durationSec - 0.05);
      gain.gain.linearRampToValueAtTime(0, when + durationSec);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(when);
      osc.stop(when + durationSec + 0.01);
    } catch {
      this.ctx = null;
    }
  }

  get isPlayingPitchSequence() {
    return this.pitchGate !== null;
  }

  /**
   * Pitch sequence with per-note durations. Routed through a master gate
   * so stopPitchSequence can mute anything still scheduled in the
   * lookahead window. Returns total scheduled seconds.
   */
  playPitchRhythm(freqs: number[], durations: number[]): number {
    if (this.unavailable || freqs.length === 0) return 0;
    this.stopPitchSequence();
    this.ensureCtx();
    if (!this.ctx) return 0;
    let base: number;
    try {
      base = this.ctx.currentTime + 0.05;
      const gate = this.ctx.createGain();
      gate.gain.value = 1;
      gate.connect(this.ctx.destination);
      this.pitchGate = gate;
    } catch {
      this.unavailable = true;
      this.ctx = null;
      return 0;
    }
    const dest = this.pitchGate;
    let offset = 0;
    for (let i = 0; i < freqs.length; i++) {
      const dur = durations[i] ?? 0.3;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = freqs[i];
        osc.type = 'triangle';
        const when = base + offset;
        const peak = 0.3;
        const audibleDur = Math.min(dur * 0.95, Math.max(0.08, dur - 0.03));
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(peak, when + 0.008);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          when + Math.max(audibleDur - 0.04, 0.02),
        );
        gain.gain.linearRampToValueAtTime(0, when + audibleDur);
        osc.connect(gain);
        gain.connect(dest ?? this.ctx.destination);
        osc.start(when);
        osc.stop(when + audibleDur + 0.01);
      } catch {
        this.ctx = null;
        return offset;
      }
      offset += dur;
    }
    return offset;
  }

  /** Even-spaced pitch sequence. Returns total scheduled seconds. */
  playPitchSequence(freqs: number[], secondsPerNote: number): number {
    if (this.unavailable || freqs.length === 0) return 0;
    this.stopPitchSequence();
    this.ensureCtx();
    if (!this.ctx) return 0;
    let base: number;
    try {
      base = this.ctx.currentTime + 0.05;
      const gate = this.ctx.createGain();
      gate.gain.value = 1;
      gate.connect(this.ctx.destination);
      this.pitchGate = gate;
    } catch {
      this.unavailable = true;
      this.ctx = null;
      return 0;
    }
    const dest = this.pitchGate;
    for (let i = 0; i < freqs.length; i++) {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = freqs[i];
        osc.type = 'triangle';
        const when = base + i * secondsPerNote;
        const peak = 0.3;
        const dur = Math.min(secondsPerNote * 0.95, 0.6);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(peak, when + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, when + dur - 0.05);
        gain.gain.linearRampToValueAtTime(0, when + dur);
        osc.connect(gain);
        gain.connect(dest ?? this.ctx.destination);
        osc.start(when);
        osc.stop(when + dur + 0.01);
      } catch {
        this.ctx = null;
        return i * secondsPerNote;
      }
    }
    return freqs.length * secondsPerNote;
  }

  get isRhythmLooping() {
    return this.rhythmTokens !== null;
  }

  /**
   * Loop a rhythm pattern at the current BPM via the lookahead scheduler.
   * Safe to call while the metronome loop is also running — both share the
   * same context. All rhythm clicks route through `rhythmGate` so stopping
   * mutes anything scheduled in the ~250 ms lookahead window.
   */
  startRhythmLoop(tokens: RhythmToken[], beatDenominator = 4) {
    if (this.unavailable || tokens.length === 0) return;
    this.stopRhythmLoop();
    this.ensureCtx();
    if (!this.ctx) return;
    try {
      const gate = this.ctx.createGain();
      gate.gain.value = 1;
      gate.connect(this.ctx.destination);
      this.rhythmGate = gate;
      this.rhythmNextStart = this.ctx.currentTime + 0.08;
    } catch {
      this.unavailable = true;
      this.ctx = null;
      return;
    }
    this.rhythmTokens = tokens;
    this.rhythmBeatDenom = beatDenominator;
    this.rhythmTick();
  }

  stopRhythmLoop() {
    this.rhythmTokens = null;
    if (this.rhythmTimer) {
      clearTimeout(this.rhythmTimer);
      this.rhythmTimer = null;
    }
    const gate = this.rhythmGate;
    this.rhythmGate = null;
    if (gate && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        gate.gain.setValueAtTime(gate.gain.value, now);
        gate.gain.linearRampToValueAtTime(0, now + 0.02);
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          (gate as unknown as { disconnect?: () => void }).disconnect?.();
        } catch {
          // ignore
        }
      }, 80);
    }
  }

  private rhythmTick = () => {
    if (!this.rhythmTokens || !this.ctx) return;
    let now: number;
    try {
      now = this.ctx.currentTime;
    } catch {
      this.ctx = null;
      return;
    }
    const horizon = now + SCHEDULE_AHEAD_S;
    while (this.rhythmNextStart < horizon) {
      const cycleLen = this.scheduleCycle(
        this.rhythmTokens,
        this.rhythmNextStart,
        this.rhythmBeatDenom,
      );
      if (cycleLen <= 0) {
        this.stopRhythmLoop();
        return;
      }
      this.rhythmNextStart += cycleLen;
    }
    this.rhythmTimer = setTimeout(this.rhythmTick, LOOKAHEAD_MS);
  };

  private scheduleCycle(
    tokens: RhythmToken[],
    startAt: number,
    beatDenominator = 4,
  ): number {
    if (!this.ctx) return 0;
    // Tokens measure durations in quarter-note beats. When the time
    // signature's denominator isn't 4, interpret BPM as "beats of the
    // denominator per minute" — e.g. in 3/8, bpm is the tempo of an
    // eighth, so a quarter note lasts (60/bpm) * (denominator/4).
    const secondsPerQuarter = (60 / this._bpm) * (beatDenominator / 4);
    let cursor = 0;
    const destination = this.rhythmGate ?? null;
    for (let i = 0; i < tokens.length; i++) {
      const beats = TOKEN_QUARTER_FRACTIONS[tokens[i]] ?? 1;
      const at = startAt + cursor * secondsPerQuarter;
      const ok = this.scheduleClick(at, i === 0, destination);
      if (!ok) {
        this.ctx = null;
        return 0;
      }
      cursor += beats;
    }
    return cursor * secondsPerQuarter;
  }

  stopPitchSequence() {
    const gate = this.pitchGate;
    this.pitchGate = null;
    if (gate && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        gate.gain.setValueAtTime(gate.gain.value, now);
        gate.gain.linearRampToValueAtTime(0, now + 0.02);
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          (gate as unknown as { disconnect?: () => void }).disconnect?.();
        } catch {
          // ignore
        }
      }, 80);
    }
  }

  dispose() {
    this.stop();
    this.stopRhythmLoop();
    this.stopPitchSequence();
    try {
      void this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private ensureCtx() {
    if (this.unavailable) return;
    if (!this.ctx || this.ctx.state === 'closed') {
      const api = loadAudioApi();
      if (!api || !api.AudioContext) {
        this.unavailable = true;
        this.ctx = null;
        return;
      }
      try {
        this.ctx = new api.AudioContext();
        this.accentBuffer = null;
        this.subBuffer = null;
      } catch {
        this.unavailable = true;
        this.ctx = null;
        return;
      }
    }
    try {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
    } catch {
      this.unavailable = true;
      this.ctx = null;
    }
    if (this.ctx && (!this.accentBuffer || !this.subBuffer)) {
      try {
        this.accentBuffer = this.buildClickBuffer(BEAT_FREQ, BEAT_GAIN);
        this.subBuffer = this.buildClickBuffer(SUB_FREQ, SUB_GAIN);
      } catch {
        this.accentBuffer = null;
        this.subBuffer = null;
      }
    }
  }

  private buildClickBuffer(freqHz: number, peak: number): RnAudioBuffer | null {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate || 44100;
    const length = Math.max(1, Math.ceil(CLICK_LEN_S * sampleRate));
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    const attackSamples = Math.max(1, Math.floor(ATTACK_S * sampleRate));
    // Exponential decay tuned so the signal is ~0.001 of peak by the
    // end of CLICK_LEN_S. tau = decaySamples / ln(1000).
    const decaySamples = length - attackSamples;
    const tau = decaySamples / Math.log(1000);
    const twoPiF = 2 * Math.PI * freqHz;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let env: number;
      if (i < attackSamples) {
        env = i / attackSamples;
      } else {
        env = Math.exp(-(i - attackSamples) / tau);
      }
      data[i] = peak * env * Math.sin(twoPiF * t);
    }
    // Force last sample to exact zero so the buffer end has no residual.
    data[length - 1] = 0;
    return buffer;
  }

  private tick = () => {
    if (!this.running || !this.ctx) return;
    let now: number;
    try {
      now = this.ctx.currentTime;
    } catch {
      this.ctx = null;
      return;
    }
    const interval = 60 / this._bpm / this._subdivision;
    const horizon = now + SCHEDULE_AHEAD_S;

    while (this.nextNoteTime < horizon) {
      const isDownbeat = this.subCount % this._subdivision === 0;
      const ok = this.scheduleClick(this.nextNoteTime, isDownbeat);
      if (!ok) {
        // Native side threw — give up silently instead of looping errors.
        this.ctx = null;
        return;
      }
      this.nextNoteTime += interval;
      this.subCount += 1;
    }

    this.timer = setTimeout(this.tick, LOOKAHEAD_MS);
  };

  private scheduleClick(
    when: number,
    isDownbeat: boolean,
    destination: unknown = null,
  ): boolean {
    if (!this.ctx) return false;
    const buffer = isDownbeat ? this.accentBuffer : this.subBuffer;
    if (!buffer) return false;
    try {
      const srcResult = this.ctx.createBufferSource();
      const startSource = (source: {
        buffer: RnAudioBuffer | null;
        connect: (n: unknown) => void;
        start: (w?: number) => void;
      }) => {
        try {
          source.buffer = buffer;
          if (this._volume >= 0.999) {
            // Skip the extra gain node when volume is full-scale.
            source.connect(destination ?? this.ctx!.destination);
          } else {
            const gain = this.ctx!.createGain();
            gain.gain.value = this._volume;
            source.connect(gain);
            gain.connect(destination ?? this.ctx!.destination);
          }
          source.start(when);
        } catch {
          // ignore individual tick failures
        }
      };
      if (srcResult && typeof (srcResult as Promise<unknown>).then === 'function') {
        void (srcResult as Promise<Parameters<typeof startSource>[0]>).then(startSource);
      } else {
        startSource(srcResult as Parameters<typeof startSource>[0]);
      }
      return true;
    } catch {
      return false;
    }
  }
}

