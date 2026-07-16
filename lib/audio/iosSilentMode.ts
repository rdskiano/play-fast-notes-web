// Native sibling of iosSilentMode.web.ts — no-op. The iOS app configures its
// audio session natively in lib/audio/metronomeEngine.ts; the Silent-Mode
// unmute trick is only needed for Web Audio in Safari.

export function unlockIosSilentMode(): void {
  // no-op on native
}
