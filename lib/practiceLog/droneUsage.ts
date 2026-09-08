// Drone usage for the practice log. The metronome surfaces report the pitch
// whenever the drone is actually sounding (drone on + metronome running);
// logPractice stamps the last-sounded pitch into the row's data_json as
// `droneMidi`. Same module-state pattern as sessionClock.ts: one tracker per
// JS runtime is enough because only one practice screen is ever in front.
//
// PEEKED, not consumed — multi-passage strategies (Interleaved, Rep Rotator,
// ICU) write one row per passage in a burst at session end, and every row of
// the burst should carry the drone that ran during the session. The tracker
// resets when the next practice screen mounts (usePracticeClock), so a drone
// from an earlier session never bleeds into a later one.

let lastMidi: number | null = null;

export function resetDroneUse(): void {
  lastMidi = null;
}

export function reportDroneUse(midi: number): void {
  lastMidi = midi;
}

export function peekDroneUseMidi(): number | null {
  return lastMidi;
}
