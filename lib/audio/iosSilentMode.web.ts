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
// Battery (F30, 2026-09-02): the loop must NOT play forever. A 4-hour practice
// session is mostly silent reading; keeping the iPad decoding "media" the whole
// time keeps its audio hardware awake all session. So the loop now runs only
// while a caller holds a retain (sustained playback: metronome running, rhythm
// loop, exercise playback) or within a grace window after the last sound
// activity (covers one-shot sounds like piano-key taps). Re-claiming later
// happens from inside the next tap that starts sound (unlockIosSilentMode is
// already on every sound path), and the brief 'interrupted' state the re-claim
// causes is healed by the metronome's existing statechange/tap retries.
//
// Web-only: imported from `.web.ts` audio modules only; must never reach the
// native bundle (native handles its audio session in metronomeEngine.ts).

let el: HTMLAudioElement | null = null;
let listenersInstalled = false;
let refCount = 0;
let lastActivityMs = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

// How long after the last sound activity (with no retains held) the silent
// loop keeps playing. Long enough that stop/start churn within a practice
// stretch doesn't re-interrupt the audio session on every restart.
const IDLE_PAUSE_MS = 60_000;

function shouldBePlaying(): boolean {
  return refCount > 0 || Date.now() - lastActivityMs < IDLE_PAUSE_MS;
}

function scheduleIdleCheck(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (!el || shouldBePlaying()) return;
    if (!el.paused) el.pause();
  }, IDLE_PAUSE_MS + 1_000);
}

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

// Temporary diagnostics seam (?audiodebug=1 overlay in useMetronome.web.ts).
let debugHook: ((msg: string) => void) | null = null;
export function setIosSilentModeDebugHook(fn: (msg: string) => void): void {
  debugHook = fn;
}
export function iosSilentModeDebugStatus(): string {
  if (!el) return 'loop:none';
  return `loop:${el.paused ? 'PAUSED' : 'playing'} refs:${refCount}`;
}

// After the page has been backgrounded, the loop can come back CLAIMING to
// play (el.paused === false, play() resolves) while iOS has actually severed
// its media-channel claim — with the mute switch on, all Web Audio then stays
// silenced and no amount of "already playing, nothing to do" fixes it
// (Ralph's iPhone repro, 2026-09-02). So a background stint marks the loop
// dirty, and the next tryPlay does a hard pause→restart to re-assert the
// claim instead of trusting el.paused.
let needsKick = false;

function makeSilentEl(): HTMLAudioElement {
  const a = document.createElement('audio');
  a.src = silentWavDataUri();
  a.loop = true;
  a.preload = 'auto';
  a.setAttribute('playsinline', '');
  return a;
}

function tryPlay(): void {
  if (!el || document.visibilityState === 'hidden') return;
  // Idle-gated: taps and visibility returns must not resurrect the loop
  // after it paused itself for inactivity.
  if (!shouldBePlaying()) {
    debugHook?.('loop: gated (idle)');
    return;
  }
  if (needsKick) {
    // Pause+replay of the SAME element proved insufficient (2026-09-02):
    // after a background stint iOS can permanently deaden that element's
    // media session while play() still resolves. Discard it and claim the
    // channel with a brand-new element instead.
    try {
      el.pause();
      el.src = '';
    } catch {
      // ignore — we're abandoning this element regardless
    }
    el = makeSilentEl();
    el.play()
      .then(() => {
        needsKick = false;
        debugHook?.('loop: kicked (hard restart) ok');
      })
      .catch((e: unknown) =>
        // Keep needsKick set: the permanent tap listeners retry from the
        // user's next real gesture, where play() always sticks.
        debugHook?.(
          `loop: kick FAILED ${e instanceof Error ? e.name : String(e)}`,
        ),
      );
    return;
  }
  if (el.paused) {
    el.play()
      .then(() => debugHook?.('loop: play ok'))
      .catch((e: unknown) =>
        debugHook?.(
          `loop: play FAILED ${e instanceof Error ? e.name : String(e)}`,
        ),
      );
  }
}

/**
 * Hold the media channel open for the duration of sustained playback (a
 * running metronome, a looping rhythm, an exercise playing through). Pair
 * every retain with exactly one release. While any retain is held the silent
 * loop never idle-pauses, so the mute switch stays beaten mid-session.
 */
export function retainIosSilentMode(): void {
  if (typeof document === 'undefined' || !isIosFamily()) return;
  refCount += 1;
  lastActivityMs = Date.now();
  tryPlay();
}

export function releaseIosSilentMode(): void {
  if (typeof document === 'undefined' || !isIosFamily()) return;
  refCount = Math.max(0, refCount - 1);
  // Grace window counts from when the sound STOPPED, not when it started.
  lastActivityMs = Date.now();
  if (refCount === 0) scheduleIdleCheck();
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
  // Every sound path funnels through here at sound-start, so this timestamp
  // is the "something just played" heartbeat the idle pause checks against.
  lastActivityMs = Date.now();
  scheduleIdleCheck();
  if (!el) el = makeSilentEl();
  if (!listenersInstalled) {
    listenersInstalled = true;
    // Retry on any tap (covers sounds started outside a gesture, e.g. by a
    // countdown timer) and re-claim the media channel when the page returns
    // to the foreground; release it while hidden so other apps can play.
    document.addEventListener('touchend', tryPlay, true);
    document.addEventListener('click', tryPlay, true);
    document.addEventListener('visibilitychange', () => {
      if (!el) return;
      if (document.visibilityState === 'hidden') {
        el.pause();
        // Whatever iOS does to our audio session while hidden, don't trust
        // the element's state on return — force a hard restart (see needsKick).
        needsKick = true;
      } else {
        tryPlay();
      }
    });
  }
  tryPlay();
}
