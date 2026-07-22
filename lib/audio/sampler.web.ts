// ── Sampled instrument playback (web) ───────────────────────────────────────
//
// Plays real recorded instruments (flute, clarinet, cello, …) instead of the
// synthesized oscillator beep, via `smplr` + a free General-MIDI soundfont.
// Used by the value-first onboarding so a new user hears Flight of the Bumblebee
// — and every rhythm variation — in their OWN instrument's voice.
//
// Web-only on purpose: this imports `smplr` (a browser Web Audio library), so
// it must never reach the native bundle. The native sibling `sampler.ts` is a
// no-op stub; the onboarding screen falls back to the metronome synth there.
//
// Samples load lazily from a CDN on first use (a few hundred KB per instrument),
// then cache. `MusyngKite` is the higher-fidelity GM kit; swap to `FluidR3_GM`
// for smaller/faster loads if needed.

import { Soundfont } from 'smplr';

import { unlockIosSilentMode } from '@/lib/audio/iosSilentMode';

export const SAMPLER_AVAILABLE = true;

export type SampleNote = { midi: number; time: number; duration: number };

// FluidR3_GM is the drier, cleaner GM kit; MusyngKite is lusher/more ambient
// (its long recorded tails read as "reverb" at sixteenth-note speed).
const KIT = 'FluidR3_GM';

// Shorten each note's amplitude release so fast runs don't smear together —
// the release tail is the main source of the "washy/reverb" feel. Larger =
// more ring/legato; smaller = tighter/drier.
const NOTE_RELEASE = 0.18;

let ctx: AudioContext | null = null;
const cache = new Map<string, unknown>();
const loading = new Set<string>();
let current: { stop: () => void } | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;
// Bumped on every play/stop. A playMelody call captures the token AFTER its own
// stopMelody(); if the token changes during its `await getInstrument` (another
// play started, or stopMelody was called), it bails WITHOUT scheduling. Without
// this, tapping several variations while the samples are still loading lets them
// all schedule at once when the instrument resolves — 4 playing over each other.
let playToken = 0;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  // Keep sampled-instrument playback audible when the iPad/iPhone mute
  // switch is on — getCtx runs synchronously at the top of every play path,
  // still inside the user's tap.
  unlockIosSilentMode();
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// smplr's `start()` returns a per-note StopFn that BOTH cancels the note if it
// hasn't played yet (scheduler) and stops it if it has (voice). The
// instrument-level `stop()` only does the latter — it can't cancel notes still
// queued in the scheduler — so we must keep and call these per-note stops.
type StopFn = (time?: number) => void;

async function getInstrument(gm: string): Promise<{ start: (e: object) => StopFn; stop: () => void } | null> {
  const c = getCtx();
  if (!c) return null;
  // Anything-but-running, not just 'suspended': iOS also parks contexts in a
  // nonstandard 'interrupted' state (media-channel claim, Siri, calls) — same
  // class as the metronome's silent-first-start bug (useMetronome.web.ts).
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {
      // ignore — a later user gesture will resume it
    }
  }
  let inst = cache.get(gm) as { load: Promise<unknown>; start: (e: object) => StopFn; stop: () => void } | undefined;
  if (!inst) {
    const Ctor = Soundfont as unknown as new (
      context: AudioContext,
      opts: { instrument: string; kit: string },
    ) => typeof inst;
    inst = new Ctor(c, { instrument: gm, kit: KIT });
    cache.set(gm, inst);
  }
  loading.add(gm);
  try {
    await inst!.load;
  } finally {
    loading.delete(gm);
  }
  return inst!;
}

/** Warm an instrument's samples ahead of the first play (best-effort). */
export function preloadInstrument(gm: string): void {
  void getInstrument(gm).catch(() => undefined);
}

/** True once an instrument's samples are decoded and ready (no load wait). */
export function isInstrumentReady(gm: string): boolean {
  return cache.has(gm) && !loading.has(gm);
}

/**
 * Play a melody schedule through the given GM instrument. Stops anything
 * already playing first. `onEnd` fires when the last note finishes ringing.
 */
export async function playMelody(
  gm: string,
  notes: SampleNote[],
  onEnd?: () => void,
): Promise<void> {
  stopMelody();
  const myToken = ++playToken;
  const inst = await getInstrument(gm);
  // Superseded while we were loading (another play started, or stopMelody was
  // called) — bail without scheduling so we don't stack on top of the new one.
  if (myToken !== playToken) return;
  const c = getCtx();
  if (!inst || !c || notes.length === 0) {
    onEnd?.();
    return;
  }
  const t0 = c.currentTime + 0.15;
  let end = 0;
  const stops: StopFn[] = [];
  for (const n of notes) {
    stops.push(
      inst.start({
        note: n.midi,
        time: t0 + n.time,
        duration: n.duration,
        velocity: 96,
        ampRelease: NOTE_RELEASE,
      }),
    );
    end = Math.max(end, n.time + n.duration);
  }
  // Stop = cancel every note (scheduled-but-unplayed AND sounding). The
  // instrument-level stop() can't reach notes still queued in the scheduler.
  current = {
    stop: () => {
      for (const s of stops) {
        try {
          s();
        } catch {
          // ignore
        }
      }
    },
  };
  if (endTimer) clearTimeout(endTimer);
  endTimer = setTimeout(
    () => {
      current = null;
      onEnd?.();
    },
    Math.ceil((0.15 + end) * 1000) + 200,
  );
}

/** Stop all sampled playback immediately. */
export function stopMelody(): void {
  // Invalidate any in-flight playMelody still awaiting its instrument so it
  // won't schedule after we've stopped.
  playToken++;
  if (endTimer) {
    clearTimeout(endTimer);
    endTimer = null;
  }
  if (current) {
    try {
      current.stop();
    } catch {
      // ignore
    }
    current = null;
  }
}
