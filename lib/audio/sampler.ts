// Native stub for the web sampled-instrument player (`sampler.web.ts`).
//
// Onboarding's sampled playback is web-first; `smplr` is a browser-only library
// and must never reach the native bundle. On native, SAMPLER_AVAILABLE is false
// and the onboarding screen falls back to the metronome synth.

export const SAMPLER_AVAILABLE = false;

export type SampleNote = { midi: number; time: number; duration: number };

export function preloadInstrument(_gm: string): void {}

export function isInstrumentReady(_gm: string): boolean {
  return false;
}

export async function playMelody(
  _gm: string,
  _notes: SampleNote[],
  onEnd?: () => void,
): Promise<void> {
  onEnd?.();
}

export function stopMelody(): void {}
