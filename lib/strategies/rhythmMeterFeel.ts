// How a generated rhythm exercise is FELT, and therefore what one metronome
// click is worth. Lives outside rhythmPatterns.ts because that file is
// regenerated from the pattern CSV.
//
// The problem this solves: the playback engines take a "beat denominator"
// and compute secondsPerQuarter = (60/bpm) * (denom/4), i.e. the dial counts
// the time signature's BOTTOM NUMBER. The metronome panel, meanwhile, counts
// BEATS — and it already groups a compound /8 meter into dotted-quarter
// beats. So in 3/8 the same dial number meant two different speeds: the
// click heard one pulse per bar, playback heard eighths, a factor of 3 apart.
//
// Ralph's call 2026-08-28 — how each meter should be felt:
//   3/8 → dotted quarter (one beat per bar)
//   2/4 → quarter
//   5/8 → eighth
//   7/8 → eighth
// Feeding beatUnitsPerWhole() to playPitchRhythm instead of the denominator
// makes the dial mean THE BEAT everywhere, so the click and the exercise
// finally agree.

import { meterTempoFactor, parseBeatDenominator } from '@/lib/strategies/rhythmPatterns';

export type BeatFeel = 'quarter' | 'dottedQuarter' | 'eighth';

/**
 * The note one click represents, or null for meters we have no opinion about
 * (/16 and friends) — those keep the legacy denominator behaviour and are
 * left off the metronome panel entirely.
 *
 * Matches MetronomePanel's own meterKind(): a /8 meter whose numerator
 * divides by 3 is compound and beats in dotted quarters; any other /8 beats
 * in eighths.
 */
export function beatFeelFor(timeSig: string): BeatFeel | null {
  const parts = timeSig.split('/');
  const num = parseInt(parts[0] ?? '4', 10) || 4;
  const den = parseInt(parts[1] ?? '4', 10) || 4;
  if (den <= 4) return 'quarter';
  if (den === 8) return num % 3 === 0 ? 'dottedQuarter' : 'eighth';
  return null;
}

/**
 * How many of this meter's beat units fit in a whole note — the number the
 * playback schedulers want. They only ever divide it by 4 to get
 * seconds-per-quarter, so the dotted quarter's 8/3 is exact.
 */
export function beatUnitsPerWhole(timeSig: string): number {
  const feel = beatFeelFor(timeSig);
  if (feel === 'quarter') return 4;
  if (feel === 'eighth') return 8;
  if (feel === 'dottedQuarter') return 8 / 3;
  return parseBeatDenominator(timeSig);
}

/**
 * Dial number for a passage goal: `dial = goalTempo * meterDialFactor(sig)`.
 *
 * Same July calibration as before (RHYTHM_TEMPO_PLAN.md: quarter-meters at
 * the goal, eighth-meters at 1.5x the goal), just expressed in the meter's
 * BEAT rather than its denominator. A compound meter divides by 3 because
 * its beat holds three eighths. For a goal of 140 that reads:
 *   3/8 = 70 (dotted quarter)   2/4 = 140 (quarter)
 *   5/8 = 210 (eighth)          7/8 = 210 (eighth)
 * 3/8 and 5/8 are the identical eighth-note speed; only the beat differs.
 */
export function meterDialFactor(timeSig: string): number {
  const base = meterTempoFactor(timeSig);
  return beatFeelFor(timeSig) === 'dottedQuarter' ? base / 3 : base;
}

/**
 * Fixed STARTING dial tempo per meter, in that meter's felt beat.
 * Ralph's call 2026-09-03, replacing the goal-derived seed for rhythm
 * exercises ("I don't think this calculation from the practice tempo of
 * the passage is working" — a fixed, predictable start per meter, then the
 * player's own dial moves are what get remembered):
 *   3/8 → 70 (dotted quarter) · 2/4 → 120 (quarter) ·
 *   5/8 and 7/8 → 380 (eighth; the engine's setBpm ceiling is 600).
 * Meters not listed have no start opinion (legacy behaviour).
 */
export const METER_START_BPM: Record<string, number> = {
  '3/8': 70,
  '2/4': 120,
  '5/8': 380,
  '7/8': 380,
};

export function meterStartBpm(timeSig: string): number | null {
  return METER_START_BPM[timeSig] ?? null;
}
