// ── Sampled instrument playback (native) ────────────────────────────────────
//
// Voices the same demo schedules the web sampler plays, through the metronome
// engine's triangle-wave synth — the Exercise Builder playback sound. The web
// sibling (sampler.web.ts) plays real GM soundfont samples via `smplr`, a
// browser-only library that must never reach the native bundle; here the synth
// keeps the strategy demos audible AND fully offline on iPad (chosen 2026-07-20
// after the Interlochen no-internet demo). Bundled real samples remain a
// possible upgrade.
//
// Contract mirrors sampler.web.ts exactly: playMelody stops anything already
// playing, `onEnd` fires only when the melody finishes on its own — a manual
// stopMelody() does NOT fire it.

import { MetronomeEngine } from './metronomeEngine';

export const SAMPLER_AVAILABLE = true;

export type SampleNote = { midi: number; time: number; duration: number };

// Private engine instance (each practice screen's useMetronome owns its own;
// this one exists only for demo melodies). Created lazily on first play.
let engine: MetronomeEngine | null = null;
function getEngine(): MetronomeEngine {
  if (!engine) engine = new MetronomeEngine();
  return engine;
}

let endTimer: ReturnType<typeof setTimeout> | null = null;
// Bumped on every play/stop so a stale end-timer can't fire onEnd for (or
// tear down) a melody that superseded it. Same guard idea as the web sampler.
let playToken = 0;

/** Synth needs no sample download — preload is a no-op. */
export function preloadInstrument(_gm: string): void {}

/** Synth is always ready (no load wait, so callers never show a spinner). */
export function isInstrumentReady(_gm: string): boolean {
  return true;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Play a melody schedule through the synth voice (the GM instrument name is
 * accepted for API parity and ignored). Stops anything already playing first.
 * `onEnd` fires when the last note finishes ringing.
 */
export async function playMelody(
  _gm: string,
  notes: SampleNote[],
  onEnd?: () => void,
): Promise<void> {
  stopMelody();
  const myToken = ++playToken;
  const totalSec = getEngine().playTimedPitches(
    notes.map((n) => ({ freq: midiToFreq(n.midi), time: n.time, duration: n.duration })),
  );
  if (totalSec <= 0) {
    // Audio unavailable or nothing playable — behave like the web sampler
    // with no instrument: report "finished" immediately.
    onEnd?.();
    return;
  }
  endTimer = setTimeout(
    () => {
      if (myToken !== playToken) return;
      endTimer = null;
      // Notes have already rung out; this just tears down the routing gate.
      // pitchOnEnd is never set by playTimedPitches, so no double callback.
      engine?.stopPitchSequence();
      onEnd?.();
    },
    Math.ceil(totalSec * 1000) + 200,
  );
}

/** Stop all demo playback immediately (does not fire onEnd — web parity). */
export function stopMelody(): void {
  playToken++;
  if (endTimer) {
    clearTimeout(endTimer);
    endTimer = null;
  }
  engine?.stopPitchSequence();
}
