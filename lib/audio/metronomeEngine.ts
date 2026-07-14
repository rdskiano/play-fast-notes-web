// Native metronome engine backed by react-native-audio-api (Web Audio API
// for React Native). Ported from learn-fast-notes/lib/metronome/engine.ts.
//
// The web counterpart (lib/audio/useMetronome.web.ts) talks to the
// browser's AudioContext directly without an engine class because the
// browser already provides one. On native, we wrap the lookahead-
// scheduled oscillator/buffer logic in this class so the hook stays
// thin and the React lifecycle owns disposal.

import { TOKEN_QUARTER_FRACTIONS, type RhythmToken } from '@/lib/strategies/rhythmPatterns';
import { getGroove, STEPS_PER_QUARTER, type Groove } from './grooves';

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

// An AudioParam — value plus the scheduling methods the synth voices use.
// react-native-audio-api exposes these on oscillator.frequency, gain.gain,
// and filter.frequency/Q just like the browser; the older type only declared
// `value` because the click path never ramped frequency.
type RnAudioParam = {
  value: number;
  setValueAtTime: (v: number, when: number) => void;
  linearRampToValueAtTime: (v: number, when: number) => void;
  exponentialRampToValueAtTime: (v: number, when: number) => void;
};

type RnBufferSource = {
  buffer: RnAudioBuffer | null;
  connect: (n: unknown) => void;
  start: (when?: number) => void;
  stop?: (when?: number) => void;
};

type AudioContextCtor = new () => {
  currentTime: number;
  sampleRate: number;
  state: 'running' | 'suspended' | 'closed';
  destination: unknown;
  createOscillator: () => {
    frequency: RnAudioParam;
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
  createBiquadFilter: () => {
    type: string;
    frequency: RnAudioParam;
    Q: RnAudioParam;
    connect: (n: unknown) => void;
  };
  createBuffer: (channels: number, length: number, sampleRate: number) => RnAudioBuffer;
  createBufferSource: () => RnBufferSource | Promise<RnBufferSource>;
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

// Tuning. The everyday click (NORMAL) is now the bright, clear tone that used
// to be the accent (2400 Hz / 0.9) — Ralph preferred it and the old duller
// 1850/0.72 normal made the click "drop" the moment the panel set its default
// all-normal 4/4 pattern. The true accent is pushed higher/louder so a tapped
// downbeat still stands out above the everyday click. SUB (subdivisions) sits
// a clear step below the beat.
const BEAT_FREQ = 3200;
const NORMAL_FREQ = 2400;
const SUB_FREQ = 1850;
const BEAT_GAIN = 0.95;
const NORMAL_GAIN = 0.9;
const SUB_GAIN = 0.6;
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

  // Groove ("Rhythms") state — a drum-machine pattern that replaces the plain
  // click. Lookahead-scheduled on the same clock as the click, so tempo
  // changes retempo it live. When a groove is active the click is suppressed
  // (see tick) and these synth voices play instead. Mirrors the web engine in
  // useMetronome.web.ts. All hits route through grooveGate so stopping mutes
  // anything already scheduled in the lookahead window.
  private groove: Groove | null = null;
  private grooveStep = 0;
  private grooveNextStart = 0;
  private grooveTimer: ReturnType<typeof setTimeout> | null = null;
  private grooveGate: RnGainNode | null = null;
  // One shared 1-second white-noise buffer feeds the snare/hat/clap voices.
  private noiseBuffer: RnAudioBuffer | null = null;

  // Pitch-rhythm playback state. Lookahead-scheduled like the rhythm
  // loop so BPM changes during playback retempo the remaining notes live.
  private pitchFreqs: number[] | null = null;
  private pitchTokens: RhythmToken[] | null = null;
  private pitchBeatDenom = 4;
  private pitchIdx = 0;
  private pitchNextStart = 0;
  // Fixed beat-grid origin of the current pitch sequence (stays put while
  // pitchNextStart advances). Lets a metronome STARTED mid-playback phase-align
  // its clicks onto the exercise's beats. See computeMetronomeStartTime.
  private pitchGridStart = 0;
  private pitchTimer: ReturnType<typeof setTimeout> | null = null;
  private pitchOnEnd: (() => void) | null = null;

  private _bpm = 80;
  private _subdivision: Subdivision = 1;
  // Matches the useMetronome hook's default (middle of the 5-step control).
  private _volume = 0.6;
  private running = false;

  // One entry per beat of the measure. The default is a single NORMAL beat —
  // every beat sounds identical (meterless), using the same everyday click
  // the MetronomePanel's default all-'normal' pattern produces. It must stay
  // 'normal', not 'accent': practice flows start the metronome before the
  // panel ever mounts, and if the defaults disagree the click audibly
  // changes the moment the user opens the panel (a long-standing complaint).
  // The accent tone only appears when the user marks a beat dot ">".
  private _beatPattern: BeatState[] = ['normal'];

  // Drone-click mode: when on, each tick sounds a sustained pitched tone
  // instead of the percussive click. _droneSustain (0..1) scales the tone
  // length from a short pitched blip up to a gapless continuous drone.
  private _droneEnabled = false;
  private _droneFreq = 440;
  private _droneSustain = 0.6;

  // "Gaps" — random beat-dropper. A fraction (0..0.8) of beats are silenced
  // at random (beat 1 included) so the player keeps time on their own. The
  // per-beat roll is decided at the beat's first tick and held in
  // _beatDropped across its subdivision ticks so the whole beat goes silent.
  private _dropChance = 0;
  private _beatDropped = false;

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

  setDropChance(frac: number) {
    this._dropChance = Math.max(0, Math.min(0.8, frac));
    if (this._dropChance === 0) this._beatDropped = false;
  }

  start() {
    this.running = true;
    if (this.unavailable) return;
    this.ensureCtx();
    if (!this.ctx) return;
    try {
      this.subCount = 0;
      // If an exercise / rhythm loop is already playing, drop the first click
      // (a downbeat, since subCount is 0) onto its grid so the click lines up
      // with the playback — the "start playback first, then the metronome"
      // direction. Otherwise just start now.
      this.nextNoteTime = this.computeMetronomeStartTime();
    } catch {
      this.unavailable = true;
      this.ctx = null;
      return;
    }
    this.tick();
    // If a groove is selected, run it alongside (the click is suppressed in
    // tick while a groove is active).
    if (this.groove) this.startGrooveLoop();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.stopGrooveLoop();
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
   * Lookahead-scheduled pitch sequence — walks `freqs` beat-by-beat,
   * wrapping `tokens` modulo their length. Each token's duration is
   * computed from the current BPM against `beatDenominator`
   * (conventional "BPM = denominator-units per minute" interpretation).
   * Re-reading BPM each tick means a BPM change during playback retempos
   * the remaining notes live. `onEnd` fires once the last note rings out
   * (or when stopPitchSequence cuts it short).
   */
  playPitchRhythm(
    freqs: number[],
    tokens: RhythmToken[],
    beatDenominator: number,
    onEnd?: () => void,
  ): void {
    if (this.unavailable || freqs.length === 0 || tokens.length === 0) {
      onEnd?.();
      return;
    }
    this.stopPitchSequence();
    this.ensureCtx();
    if (!this.ctx) {
      onEnd?.();
      return;
    }
    try {
      const gate = this.ctx.createGain();
      gate.gain.value = 1;
      gate.connect(this.ctx.destination);
      this.pitchGate = gate;
      this.pitchNextStart = this.ctx.currentTime + 0.08;
    } catch {
      this.unavailable = true;
      this.ctx = null;
      onEnd?.();
      return;
    }
    this.pitchFreqs = freqs.slice();
    this.pitchTokens = tokens.slice();
    this.pitchBeatDenom = beatDenominator;
    this.pitchIdx = 0;
    this.pitchOnEnd = onEnd ?? null;
    // Align first pitch with the next metronome downbeat if it's running,
    // so the exercise lines up with the click track audibly.
    this.pitchNextStart = this.computeAlignedStart();
    this.pitchGridStart = this.pitchNextStart;
    this.pitchTick();
  }

  // Start time for playback (pitch sequence OR rhythm loop) that aligns it to
  // the metronome's next downbeat when the metronome is running — the
  // "metronome first, then playback" direction. Falls back to ~now when the
  // metronome is stopped.
  private computeAlignedStart(): number {
    if (!this.ctx) return 0;
    const defaultStart = this.ctx.currentTime + 0.08;
    if (!this.running) return defaultStart;
    const sub = this._subdivision;
    const beats = this._beatPattern.length;
    if (sub <= 0 || beats <= 0) return defaultStart;
    const ticksPerMeasure = beats * sub;
    const tickSec = 60 / this._bpm / sub;
    // subCount is the count of ticks already scheduled, i.e. the index of
    // the next tick is subCount % ticksPerMeasure.
    const idx = ((this.subCount % ticksPerMeasure) + ticksPerMeasure) %
      ticksPerMeasure;
    const ticksTilDownbeat = idx === 0 ? 0 : ticksPerMeasure - idx;
    let downbeat = this.nextNoteTime + ticksTilDownbeat * tickSec;
    while (downbeat < this.ctx.currentTime + 0.05) {
      downbeat += ticksPerMeasure * tickSec;
    }
    return downbeat;
  }

  // Start time for the metronome's first click (a downbeat — start() resets
  // subCount to 0) that aligns it to already-running playback — the "playback
  // first, then metronome" direction. Pitch sequence: phase-lock the click onto
  // the exercise's beat grid (origin = pitchGridStart, one beat = 60/bpm, the
  // BPM convention that also drives computeAlignedStart). Rhythm loop: land on
  // the loop's next cycle downbeat. Falls back to ~now when nothing's playing.
  private computeMetronomeStartTime(): number {
    if (!this.ctx) return 0;
    const earliest = this.ctx.currentTime + 0.05;

    if (this.pitchTokens && this.pitchGate) {
      const secondsPerBeat = 60 / this._bpm;
      if (secondsPerBeat > 0) {
        const origin = this.pitchGridStart;
        const k = Math.ceil((earliest - origin) / secondsPerBeat);
        const t = origin + k * secondsPerBeat;
        return t < earliest ? t + secondsPerBeat : t;
      }
    }

    if (this.rhythmTokens && this.rhythmGate) {
      const secondsPerQuarter = (60 / this._bpm) * (this.rhythmBeatDenom / 4);
      let cycleSec = 0;
      for (const tok of this.rhythmTokens) {
        cycleSec += (TOKEN_QUARTER_FRACTIONS[tok] ?? 1) * secondsPerQuarter;
      }
      if (cycleSec > 0) {
        // rhythmNextStart is the next cycle (downbeat) to be scheduled; walk it
        // back to the soonest downbeat that's still schedulable.
        let t = this.rhythmNextStart;
        while (t - cycleSec >= earliest) t -= cycleSec;
        while (t < earliest) t += cycleSec;
        return t;
      }
    }

    return earliest;
  }

  private pitchTick = () => {
    const freqs = this.pitchFreqs;
    const tokens = this.pitchTokens;
    const gate = this.pitchGate;
    if (!this.ctx || !freqs || !tokens || !gate) return;
    let now: number;
    try {
      now = this.ctx.currentTime;
    } catch {
      this.ctx = null;
      return;
    }
    if (this.pitchNextStart < now - 0.5) {
      this.pitchNextStart = now + 0.05;
    }
    // BPM = denominator-units per minute (conventional). Same formula as
    // scheduleCycle below; mirror it so the rhythm-loop and pitch-loop
    // tempos line up across all time signatures.
    const secondsPerQuarter = (60 / this._bpm) * (this.pitchBeatDenom / 4);
    const horizon = now + SCHEDULE_AHEAD_S;
    while (this.pitchIdx < freqs.length && this.pitchNextStart < horizon) {
      const i = this.pitchIdx;
      const token = tokens[i % tokens.length];
      const dur = TOKEN_QUARTER_FRACTIONS[token] * secondsPerQuarter;
      const when = this.pitchNextStart;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        // Pin initial gain to 0 (default is 1.0) so the note's start can't be
        // evaluated at full gain for a fraction of a block → no tick/pop on iOS.
        // See the matching note in playPitchSequence.
        gain.gain.value = 0;
        osc.frequency.value = freqs[i];
        osc.type = 'triangle';
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
        gain.connect(gate);
        osc.start(when);
        osc.stop(when + audibleDur + 0.01);
      } catch {
        this.ctx = null;
        return;
      }
      this.pitchNextStart += dur;
      this.pitchIdx = i + 1;
    }
    if (this.pitchIdx >= freqs.length) {
      // All notes scheduled — fire onEnd once the last one rings out.
      const remainingSec = Math.max(0, this.pitchNextStart - now);
      const onEnd = this.pitchOnEnd;
      this.pitchTimer = setTimeout(
        () => {
          if (onEnd) onEnd();
          // Clear refs only after firing so a fast restart doesn't race.
          if (this.pitchOnEnd === onEnd) this.pitchOnEnd = null;
        },
        Math.ceil(remainingSec * 1000) + 120,
      );
      return;
    }
    this.pitchTimer = setTimeout(this.pitchTick, LOOKAHEAD_MS);
  };

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
        // A GainNode defaults to 1.0. Until the fade-in below takes effect at
        // `when`, that leaves the gain at full — and on iOS the block that
        // contains the oscillator's start can be evaluated at that full gain for
        // a fraction of a block, producing an audible tick/pop right as the note
        // begins (intermittent because `when` drifts against the block grid).
        // Pinning the initial value to 0 removes the pre-note full-gain window.
        gain.gain.value = 0;
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
      // Start the loop on the metronome's next downbeat when it's running, so
      // the loop locks to the click — the "metronome first, then loop" direction.
      this.rhythmNextStart = this.computeAlignedStart();
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
    if (this.pitchTimer) {
      clearTimeout(this.pitchTimer);
      this.pitchTimer = null;
    }
    this.pitchFreqs = null;
    this.pitchTokens = null;
    this.pitchIdx = 0;
    const onEnd = this.pitchOnEnd;
    this.pitchOnEnd = null;
    const gate = this.pitchGate;
    this.pitchGate = null;
    if (onEnd) onEnd();
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

  // ── Grooves (Rhythms) ───────────────────────────────────────────────────

  get activeGroove(): string | null {
    return this.groove?.id ?? null;
  }

  /**
   * Select a drum groove (or null for "just the click"). Setting a groove
   * while running starts the drum loop and suppresses the plain click;
   * clearing it tears the loop down and the click resumes. Setting one while
   * stopped just records the choice — the loop starts on the next start().
   */
  setGroove(id: string | null) {
    this.groove = getGroove(id);
    if (!this.running) return;
    if (this.groove) this.startGrooveLoop();
    else this.stopGrooveLoop();
  }

  private startGrooveLoop() {
    if (this.unavailable || !this.groove) return;
    this.ensureCtx();
    if (!this.ctx) return;
    // Already looping — the running tick re-reads this.groove each pass, so a
    // groove swap is picked up without restarting the loop.
    if (this.grooveTimer) return;
    try {
      const gate = this.ctx.createGain();
      gate.gain.value = 1;
      gate.connect(this.ctx.destination);
      this.grooveGate = gate;
      this.grooveNextStart = this.ctx.currentTime + 0.08;
      this.grooveStep = 0;
    } catch {
      this.unavailable = true;
      this.ctx = null;
      return;
    }
    this.grooveTick();
  }

  private stopGrooveLoop() {
    if (this.grooveTimer) {
      clearTimeout(this.grooveTimer);
      this.grooveTimer = null;
    }
    const gate = this.grooveGate;
    this.grooveGate = null;
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

  private grooveTick = () => {
    const ctx = this.ctx;
    const groove = this.groove;
    const gate = this.grooveGate;
    if (!ctx || !groove || !gate) return;
    let now: number;
    try {
      now = ctx.currentTime;
    } catch {
      this.ctx = null;
      return;
    }
    // Fell far behind (app backgrounded etc.) — resync rather than burst-fire.
    if (this.grooveNextStart < now - 0.5) {
      this.grooveNextStart = now + 0.08;
      this.grooveStep = 0;
    }
    const horizon = now + SCHEDULE_AHEAD_S;
    while (this.grooveNextStart < horizon) {
      // Step length read each pass off the live BPM, so the tempo dial
      // retempos the groove in place. STEPS_PER_QUARTER sixteenth-steps/beat.
      const stepSec = 60 / this._bpm / STEPS_PER_QUARTER;
      const step = this.grooveStep;
      const when = this.grooveNextStart;
      for (const h of groove.hits) {
        if (h.step !== step) continue;
        const vel = h.vel ?? 1;
        switch (h.voice) {
          case 'kick':
            this.drumKick(when, vel);
            break;
          case 'snare':
            this.drumSnare(when, vel);
            break;
          case 'hat':
            this.drumHat(when, vel, false);
            break;
          case 'openHat':
            this.drumHat(when, vel, true);
            break;
          case 'clap':
            this.drumClap(when, vel);
            break;
          case 'maracas':
            this.drumMaracas(when, vel);
            break;
          case 'conga':
            this.drumConga(when, vel);
            break;
          case 'block':
            this.drumBlock(when, vel);
            break;
        }
      }
      this.grooveStep = (step + 1) % groove.steps;
      this.grooveNextStart += stepSec;
    }
    this.grooveTimer = setTimeout(this.grooveTick, LOOKAHEAD_MS);
  };

  // Drum synth voices — ported from the web engine (useMetronome.web.ts).
  // All route through grooveGate so stopGrooveLoop can mute in-flight hits.

  private drumKick(when: number, vel: number) {
    const ctx = this.ctx;
    const gate = this.grooveGate;
    if (!ctx || !gate) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, when);
      osc.frequency.exponentialRampToValueAtTime(50, when + 0.12);
      const peak = Math.max(0.0002, vel * this._volume * 1.4);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      osc.connect(g);
      g.connect(gate);
      osc.start(when);
      osc.stop(when + 0.2);
    } catch {
      // ignore individual hit failures
    }
  }

  private drumSnare(when: number, vel: number) {
    const vol = this._volume;
    // Noise body (highpass) + a short pitched tone body.
    this.playNoiseVoice(when, 'highpass', 1500, 0, Math.max(0.0002, vel * vol * 0.9), 0.18);
    const ctx = this.ctx;
    const gate = this.grooveGate;
    if (!ctx || !gate) return;
    try {
      const osc = ctx.createOscillator();
      const tg = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 180;
      const tpeak = Math.max(0.0002, vel * vol * 0.5);
      tg.gain.setValueAtTime(tpeak, when);
      tg.gain.exponentialRampToValueAtTime(0.0001, when + 0.1);
      osc.connect(tg);
      tg.connect(gate);
      osc.start(when);
      osc.stop(when + 0.12);
    } catch {
      // ignore
    }
  }

  private drumHat(when: number, vel: number, open: boolean) {
    const dur = open ? 0.3 : 0.05;
    this.playNoiseVoice(when, 'highpass', 7000, 0, Math.max(0.0002, vel * this._volume * 0.6), dur);
  }

  private drumClap(when: number, vel: number) {
    this.playNoiseVoice(when, 'bandpass', 1200, 1.2, Math.max(0.0002, vel * this._volume * 0.8), 0.12);
  }

  // Latin percussion voices.

  // Maracas — a short, bright shaker. Higher and tighter than a hi-hat.
  private drumMaracas(when: number, vel: number) {
    // Soft attack + longer tail = a "shh" shake rather than a sharp tick.
    this.playNoiseVoice(when, 'highpass', 7000, 0, Math.max(0.0002, vel * this._volume * 0.5), 0.09, 0.006);
  }

  // Conga — a pitched membrane hit (triangle with a downward pitch bend) plus a
  // short band-passed noise transient for the skin slap.
  private drumConga(when: number, vel: number) {
    const ctx = this.ctx;
    const gate = this.grooveGate;
    if (ctx && gate) {
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        // Round sine body + a quick pitch SNAP (not a slow slide) + short decay
        // — an open-tone conga rather than a rubbery "pew."
        osc.type = 'sine';
        osc.frequency.setValueAtTime(235, when);
        osc.frequency.exponentialRampToValueAtTime(190, when + 0.02);
        const peak = Math.max(0.0002, vel * this._volume * 1.0);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(peak, when + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
        osc.connect(g);
        g.connect(gate);
        osc.start(when);
        osc.stop(when + 0.18);
      } catch {
        // ignore
      }
    }
    // Crisp high-passed finger slap, not a low thud.
    this.playNoiseVoice(when, 'highpass', 2500, 0, Math.max(0.0002, vel * this._volume * 0.25), 0.02);
  }

  // Woodblock — a sharp pitched tick: a quick triangle at ~1 kHz plus a softer
  // higher partial for the "tock."
  private drumBlock(when: number, vel: number) {
    const ctx = this.ctx;
    const gate = this.grooveGate;
    if (!ctx || !gate) return;
    const peak = Math.max(0.0002, vel * this._volume * 0.9);
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 1000;
      g.gain.setValueAtTime(peak, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
      osc.connect(g);
      g.connect(gate);
      osc.start(when);
      osc.stop(when + 0.06);
    } catch {
      // ignore
    }
    try {
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.value = 1600;
      g2.gain.setValueAtTime(peak * 0.5, when);
      g2.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
      osc2.connect(g2);
      g2.connect(gate);
      osc2.start(when);
      osc2.stop(when + 0.04);
    } catch {
      // ignore
    }
  }

  // Filtered burst of the shared noise buffer → grooveGate. Handles
  // createBufferSource returning either a node or a Promise (same as the
  // click path — react-native-audio-api can be async on a release build).
  private playNoiseVoice(
    when: number,
    filterType: 'highpass' | 'bandpass',
    filterFreq: number,
    q: number,
    peak: number,
    dur: number,
    attack = 0,
  ) {
    const ctx = this.ctx;
    const gate = this.grooveGate;
    const noise = this.noiseBuffer;
    if (!ctx || !gate || !noise) return;
    try {
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = filterFreq;
      if (q > 0) filter.Q.value = q;
      const g = ctx.createGain();
      const p = Math.max(0.0002, peak);
      // attack > 0 ramps in (softer onset); otherwise the peak hits instantly.
      if (attack > 0) {
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(p, when + attack);
      } else {
        g.gain.setValueAtTime(p, when);
      }
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      filter.connect(g);
      g.connect(gate);
      const srcResult = ctx.createBufferSource();
      const go = (src: RnBufferSource) => {
        try {
          src.buffer = noise;
          src.connect(filter);
          src.start(when);
          src.stop?.(when + dur + 0.02);
        } catch {
          // ignore
        }
      };
      if (srcResult && typeof (srcResult as Promise<unknown>).then === 'function') {
        void (srcResult as Promise<RnBufferSource>).then(go);
      } else {
        go(srcResult as RnBufferSource);
      }
    } catch {
      // ignore
    }
  }

  dispose() {
    this.stop();
    this.stopRhythmLoop();
    this.stopPitchSequence();
    this.stopGrooveLoop();
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
        this.noiseBuffer = null;
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
    if (this.ctx && !this.noiseBuffer) {
      try {
        this.noiseBuffer = this.buildNoiseBuffer();
      } catch {
        this.noiseBuffer = null;
      }
    }
  }

  // One second of uniform white noise [-1, 1], shared by the snare/hat/clap
  // voices. Built once per AudioContext alongside the click buffers.
  private buildNoiseBuffer(): RnAudioBuffer | null {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate || 44100;
    const length = Math.max(1, Math.floor(sampleRate));
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
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
      // Gaps: roll once at the beat's first tick; hold it across the beat's
      // subdivisions so a dropped beat is fully silent. Beat 1 isn't spared.
      if (isBeatStart) {
        this._beatDropped =
          this._dropChance > 0 && Math.random() < this._dropChance;
      }
      // A groove replaces the click entirely — keep advancing the beat clock
      // (so pitch playback can still sync to the downbeat) but stay silent.
      if (beatState !== 'mute' && !this.groove && !this._beatDropped) {
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

