// Dictation-safe window — WEB no-op sibling.
//
// The crash this guards against is native-only: iOS tears the audio
// session away for the system mic while react-native-audio-api's render
// thread is live (see dictationGuard.ts). Browser dictation goes through
// the OS keyboard without touching the page's Web Audio context, and the
// web engine survives interruptions on its own — so the web build must not
// pay the wind-down/rebuild cost (and must not import the native engine).

export async function beginDictationSafeWindow(): Promise<void> {
  // no-op on web
}

export function endDictationSafeWindow(): void {
  // no-op on web
}
