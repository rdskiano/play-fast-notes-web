// ── iOS Silent Mode unmute (web) ─────────────────────────────────────────────
//
// On iPhone/iPad, Safari routes Web Audio (our metronome clicks, drones and
// sampled instruments) through the "sound effects" audio channel, which the
// hardware/Control-Center mute switch silences — even with the volume up.
// HTML <audio>/<video> elements route through the "media playback" channel,
// which the mute switch does NOT silence. (That's why users report "the
// metronome only works while I'm recording": an active microphone flips the
// whole session into a mode that ignores the switch.)
//
// The standard fix (same trick as unmute.js and most web metronomes): keep a
// silent, looping <audio> element playing. While it plays, iOS treats the
// page as a media player and Web Audio becomes audible in Silent Mode.
//
// Trade-off, by design: starting media playback interrupts audio from other
// apps (e.g. background Spotify) the first time a practice sound starts.
// That's inherent to claiming the media channel — every web metronome that
// beats the mute switch behaves this way.
//
// Web-only: imported from `.web.ts` audio modules only; must never reach the
// native bundle (native handles its audio session in metronomeEngine.ts).

let el: HTMLAudioElement | null = null;
let listenersInstalled = false;

function isIosFamily(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ masquerades as desktop Safari ("MacIntel") but has touch.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

// Build a half-second silent 16-bit mono WAV as a data URI at runtime, so we
// don't ship an opaque binary asset just to play nothing.
function silentWavDataUri(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate / 2;
  const dataSize = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  v.setUint32(40, dataSize, true);
  // Sample bytes are already zero — that IS the silence.
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(bin);
}

function tryPlay(): void {
  if (!el || document.visibilityState === 'hidden') return;
  if (el.paused) el.play().catch(() => undefined);
}

/**
 * Keep iOS Web Audio audible in Silent Mode. Call synchronously from the code
 * path that starts any Web Audio sound — ideally still inside the user's tap,
 * where autoplay rules allow play() to succeed. Safe to call repeatedly and
 * outside gestures: if play() is refused, permanent tap listeners retry it on
 * the user's next touch anywhere on the page. No-op off iOS.
 */
export function unlockIosSilentMode(): void {
  if (typeof document === 'undefined' || !isIosFamily()) return;
  if (!el) {
    el = document.createElement('audio');
    el.src = silentWavDataUri();
    el.loop = true;
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
  }
  if (!listenersInstalled) {
    listenersInstalled = true;
    // Retry on any tap (covers sounds started outside a gesture, e.g. by a
    // countdown timer) and re-claim the media channel when the page returns
    // to the foreground; release it while hidden so other apps can play.
    document.addEventListener('touchend', tryPlay, true);
    document.addEventListener('click', tryPlay, true);
    document.addEventListener('visibilitychange', () => {
      if (!el) return;
      if (document.visibilityState === 'hidden') el.pause();
      else tryPlay();
    });
  }
  tryPlay();
}
