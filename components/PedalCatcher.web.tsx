// Web foot-pedal capture. Bluetooth foot pedals (AirTurn, Donner, PageFlip,
// etc.) pair as keyboards and send keystrokes — usually arrow keys,
// PageUp/PageDown, or Space. There's no native module to hook on web, so
// we listen for `keydown` on `window` while pedal mode is active and treat
// any "advance-like" key as a press.
//
// Unlike the iOS sibling we don't show a "no pedal detected" warning:
// browsers don't expose paired-device status to JS, so we have no way to
// tell whether a pedal is connected. If the user taps PEDAL but nothing
// happens, the simplest debug is to confirm the pedal is paired in their
// device's Bluetooth settings.

import { useEffect, useRef } from 'react';

// Keys a typical Bluetooth foot pedal sends. Letters / numbers are
// intentionally excluded so the pedal mode doesn't intercept characters
// the user might type elsewhere on the page.
const PEDAL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'ArrowRight',
  'ArrowLeft',
  'PageDown',
  'PageUp',
  ' ', // Space
  'Spacebar', // legacy
  'Enter',
]);

export function PedalCatcher({
  active,
  onAdvance,
}: {
  active: boolean;
  onAdvance: () => void;
}) {
  const lastAdvanceRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    if (typeof window === 'undefined') return;

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!target || !(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    function onKey(e: KeyboardEvent) {
      // Don't steal keystrokes from real typing (e.g. the practice-log note
      // prompt, sign-in modals, the metronome BPM stepper if focused).
      if (isTypingTarget(e.target)) return;
      if (!PEDAL_KEYS.has(e.key)) return;
      // De-dupe key auto-repeat the same way the native sibling does. A
      // foot pedal held down briefly can otherwise fire dozens of events.
      const now = Date.now();
      if (now - lastAdvanceRef.current < 300) return;
      lastAdvanceRef.current = now;
      e.preventDefault();
      onAdvance();
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onAdvance]);

  return null;
}
