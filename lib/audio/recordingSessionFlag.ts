// Tiny coordination flag between the native Recorder and the metronome
// engine. While a recording is ACTIVE the audio session belongs to the
// recorder (playAndRecord); the metronome must not re-assert its playback
// category or the mic dies mid-take. Any other time, the metronome
// re-claims the session on start — playing a take back (expo-audio)
// reconfigures the session, and without the re-claim the metronome came
// back silent (Ralph, iPad app, 2026-09-03).
//
// Module-level on purpose: both parties live for the app session, and a
// context provider would drag audio wiring through the component tree.

let recordingActive = false;

export function setRecordingActive(on: boolean): void {
  recordingActive = on;
}

export function isRecordingActive(): boolean {
  return recordingActive;
}
