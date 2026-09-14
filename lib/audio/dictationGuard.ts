// Dictation-safe window for text prompts (NATIVE).
//
// Crash log PlayFast-2026-09-13-155416: tapping the keyboard's mic to
// DICTATE a practice-log note segfaulted on AURemoteIO::IOThread inside the
// AVAudioSourceNode render callback — iOS reconfigures the audio session
// for the system mic while the app's engines are still alive. The prompts
// only stop() the click, which leaves the engine's context rendering
// silence underneath; the session flip races the live render thread. Same
// use-after-free family as the recorder's start/stop crashes
// (2026-09-05), and the same rule applies: NEVER let the audio session
// change while an engine is rendering.
//
// Unlike the recorder we can't see dictation coming, so the window opens
// when a dictation-capable prompt APPEARS: wind every live engine all the
// way down (awaited suspend + close, the recorder's proven path) so the
// session is free for the system mic the whole time the prompt is up.
// When the prompt closes, a foreign-audio stamp bump makes the next engine
// start rebuild its context fresh under whatever session iOS left behind
// (dictation used or not — a rebuild is cheap and verified, 2026-09-03).

import { quiesceEnginesForSessionChange } from '@/lib/audio/metronomeEngine';
import { noteForeignAudioUse } from '@/lib/audio/recordingSessionFlag';

export async function beginDictationSafeWindow(): Promise<void> {
  // Discard the returned resume function on purpose: the prompts own their
  // own "was the click running?" state and restart through the normal
  // metronome API, which rebuilds the closed context from scratch.
  await quiesceEnginesForSessionChange();
}

export function endDictationSafeWindow(): void {
  noteForeignAudioUse();
}
