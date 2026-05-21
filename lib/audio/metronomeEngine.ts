// Native metronome engine backed by react-native-audio-api (Web Audio API
// for React Native). Ported from learn-fast-notes/lib/metronome/engine.ts.
//
// The web counterpart (lib/audio/useMetronome.web.ts) talks to the
// browser's AudioContext directly without an engine class because the
// browser already provides one. On native, we wrap the lookahead-
// scheduled oscillator/buffer logic in this class so the hook stays
// thin and the React lifecycle owns disposal.

import { TOKEN_QUARTER_FRACTIONS, type RhythmToken } from '@/lib/strategies/rhythmPatterns';

// Clicks per beat: 1 (quarter), 2 (eighths), 3 (triplet), 4 (sixteenths).
export type Subdivision = 1 | 2 | 3 | 4;

// Per-beat sound within a measure. 'accent' = loud downbeat click,
// 'normal' = mid click, 'mute' = silent (the beat and its subdivisions are
// skipped). A metronome's beat pattern is an array of these, one per beat.
export type BeatState = 'accent' | 'normal' | 'mute';

type ClickKind = 'accent' | 'normal' | 'sub';

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

function loadAudioApi(): { AudioContext: AudioContextCtor } | null {
  if (audioApi || audioApiTried) return audioApi;
  audioApiTried = true;
  try {
    // react-native-audio-api is a hard dependency + Expo config plugin, so
    // it is compiled into every real build — require it directly. An earlier
    // NativeModules-name presence check was removed: it produced FALSE
    // NEGATIVES on release builds (the TurboModule is not exposed on the
    // legacy NativeModules registry the way it is in a debug build), which
    // silently disabled the metronome on the iPad while it worked in the
    // simulator.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audioApi = require('react-native-audio-api');
  } catch {
    audioApi = null;
    return null;
  }
  // Configure the iOS audio session for playback. Without this, the
  // AudioContext schedules clicks but the session sits in an inactive
  // category and nothing reaches the speaker.
  //
  // The iosOptions list must NOT include 'defaultToSpeaker': that option
  // is only legal with the 'playAndRecord' category. Pairing it with
  // 'playback' makes AVAudioSession.setActive(true) fail on a physical
  // device (SessionActivationError) — which leaves the AudioContext
  // stuck in 'suspended', so nothing plays. The Simulator silently
  // tolerates the bad option, which is why the bug was device-only.
  // mixWithOthers lets music keep playing in parallel.
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
        iosOptions: ['mixWithOthers'],
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
const NORMAL_FREQ = 1850;
const SUB_FREQ = 1400;
const BEAT_GAIN = 0.9;
const NORMAL_GAIN = 0.72;
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
  private normalBuffer: RnAudioBuffer | null = null;
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
  // Matches the useMetronome hook's default (middle of the 5-step control).
  private _volume = 0.6;
  private running = false;

  // One entry per beat of the measure. The default is a single accented
  // beat — i.e. every beat sounds identical (meterless), which is exactly
  // what every metronome consumer had before per-beat patterns existed.
  // The MetronomePanel overrides this via setBeatPattern; practice-flow
  // callers that never touch it keep the uniform click.
  private _beatPattern: BeatState[] = ['accent'];

  // Drone-click mode: when on, each tick sounds a sustained pitched tone
  // instead of the percussive click. _droneSustain (0..1) scales the tone
  // length from a short pitched blip up to a gapless continuous drone.
  private _droneEnabled = false;
  private _droneFreq = 440;
  private _droneSustain = 0.6;

  get bpm() {
    return this._bpm;
  }
  get subdivision() {
    return this._subdivision;
  }
  get beatPattern(): BeatState[] {
    return this._beatPattern.slice();
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

  /**
   * Replace the per-beat accent/normal/mute pattern. The array length is
   * the measure's beat count. A length change re-aligns beat 0; a
   * same-length edit (just changing a beat's state) is read live on the
   * next pass with no audible reset.
   */
  setBeatPattern(pattern: BeatState[]) {
    if (pattern.length === 0) return;
    const lengthChanged = pattern.length !== this._beatPattern.length;
    this._beatPattern = pattern.slice();
    if (lengthChanged) {
      this.subCount = 0;
      if (this.running) {
        this.nextNoteTime = (this.ctx?.currentTime ?? 0) + 0.05;
      }
    }
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
  }

  setDroneEnabled(enabled: boolean) {
    this._droneEnabled = enabled;
  }

  setDroneFreq(freqHz: number) {
    if (freqHz > 0) this._droneFreq = freqHz;
  }

  setDroneSustain(frac: number) {
    this._droneSustain = Math.max(0, Math.min(1, frac));
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
      const ok = this.scheduleClick(at, i === 0 ? 'accent' : 'sub', destination);
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
        this.normalBuffer = null;
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
    if (
      this.ctx &&
      (!this.accentBuffer || !this.normalBuffer || !this.subBuffer)
    ) {
      try {
        this.accentBuffer = this.buildClickBuffer(BEAT_FREQ, BEAT_GAIN);
        this.normalBuffer = this.buildClickBuffer(NORMAL_FREQ, NORMAL_GAIN);
        this.subBuffer = this.buildClickBuffer(SUB_FREQ, SUB_GAIN);
      } catch {
        this.accentBuffer = null;
        this.normalBuffer = null;
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
    const ticksPerMeasure = this._beatPattern.length * this._subdivision;

    while (this.nextNoteTime < horizon) {
      const tickInMeasure = this.subCount % ticksPerMeasure;
      const beatIndex = Math.floor(tickInMeasure / this._subdivision);
      const isBeatStart = tickInMeasure % this._subdivision === 0;
      const beatState = this._beatPattern[beatIndex] ?? 'normal';
      if (beatState !== 'mute') {
        const kind: ClickKind = isBeatStart
          ? beatState === 'accent'
            ? 'accent'
            : 'normal'
          : 'sub';
        const ok = this._droneEnabled
          ? this.scheduleDroneTone(this.nextNoteTime, kind)
          : this.scheduleClick(this.nextNoteTime, kind);
        if (!ok) {
          // Native side threw — give up silently instead of looping errors.
          this.ctx = null;
          return;
        }
      }
      this.nextNoteTime += interval;
      this.subCount += 1;
    }

    this.timer = setTimeout(this.tick, LOOKAHEAD_MS);
  };

  private scheduleClick(
    when: number,
    kind: ClickKind,
    destination: unknown = null,
  ): boolean {
    if (!this.ctx) return false;
    const buffer =
      kind === 'accent'
        ? this.accentBuffer
        : kind === 'normal'
          ? this.normalBuffer
          : this.subBuffer;
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
          // 2× gain headroom so the default volume (0.5) plays at the
          // click buffer's natural peak (which is what old vol=1.0 did),
          // and vol=1.0 doubles that. Beat/sub buffers have peaks of
          // 0.9 / 0.5; vol=1.0 lifts those to ~1.0 (saturating slightly
          // on the beat), which on iPad simulator + Mac speakers is
          // audibly comfortable.
          const gain = this.ctx!.createGain();
          gain.gain.value = Math.min(2, this._volume * 2);
          source.connect(gain);
          gain.connect(destination ?? this.ctx!.destination);
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

  // A pitched tone for drone-click mode. A fast attack gives each beat a
  // defined onset; the tone always ends before the next tick so the beat
  // stays clearly articulated. _droneSustain (0..1) is squared so the lower
  // slider steps stay short — it scales length from a short blip to most
  // of the beat.
  private scheduleDroneTone(when: number, kind: ClickKind): boolean {
    if (!this.ctx) return false;
    const tickSec = 60 / this._bpm / this._subdivision;
    const ATTACK = 0.004;
    const RELEASE = 0.045;
    const MIN_TONE = 0.06;
    const maxTone = Math.max(MIN_TONE, tickSec * 0.9);
    const sus = this._droneSustain * this._droneSustain;
    const toneLen = MIN_TONE + (maxTone - MIN_TONE) * sus;
    const tier = kind === 'accent' ? 1 : kind === 'normal' ? 0.72 : 0.5;
    const peak = Math.max(0.0002, Math.min(1, this._volume) * tier * 0.7);
    const releaseStart = when + Math.max(ATTACK, toneLen - RELEASE);
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = this._droneFreq;
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peak, when + ATTACK);
      gain.gain.setValueAtTime(peak, releaseStart);
      gain.gain.linearRampToValueAtTime(0.0001, when + toneLen);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(when);
      osc.stop(when + toneLen + 0.02);
      return true;
    } catch {
      return false;
    }
  }
}

