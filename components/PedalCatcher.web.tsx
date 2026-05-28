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
// the user might type elsewhere on the page. Two-pedal pedals send a
// "forward" key on the right pedal (PageDown / right / down / Space) and
// a "back" key on the left (PageUp / left / up). When `onBack` is wired,
// we route each set to its own action; when it isn't, every key advances
// (the historical behavior for Tempo Ladder / Interleaved).
const FORWARD_KEYS = new Set([
  'ArrowDown',
  'ArrowRight',
  'PageDown',
  ' ', // Space
  'Spacebar', // legacy
  'Enter',
]);
const BACK_KEYS = new Set([
  'ArrowUp',
  'ArrowLeft',
  'PageUp',
  'Backspace',
]);

export function PedalCatcher({
  active,
  onAdvance,
  onBack,
  secondaryKey,
  onSecondary,
}: {
  active: boolean;
  onAdvance: () => void;
  // Optional "go back a step" binding (Click-Up). When provided, BACK_KEYS
  // (left/up/pageup/backspace — the left pedal on a two-pedal foot switch)
  // fire `onBack` instead of `onAdvance`. When omitted, every pedal key
  // advances, matching the original behavior.
  onBack?: () => void;
  // Optional second binding for screens with two rep outcomes
  // (Tempo Ladder, Interleaved): Space = Clean (advance), X = Miss.
  // Compared case-insensitively. The advance keys (Space, Enter, arrows,
  // PageDown/PageUp) are unchanged — a foot pedal still works the same.
  secondaryKey?: string;
  onSecondary?: () => void;
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

      let action: (() => void) | null = null;
      if (
        secondaryKey &&
        onSecondary &&
        e.key.toLowerCase() === secondaryKey.toLowerCase()
      ) {
        action = onSecondary;
      } else if (onBack && BACK_KEYS.has(e.key)) {
        action = onBack;
      } else if (FORWARD_KEYS.has(e.key)) {
        action = onAdvance;
      } else if (!onBack && BACK_KEYS.has(e.key)) {
        // Back binding not requested → preserve the historical "any pedal
        // key advances" behavior so screens that haven't opted in (Tempo
        // Ladder, Interleaved) keep working with single-action pedals.
        action = onAdvance;
      }
      if (!action) return;

      // De-dupe key auto-repeat the same way the native sibling does. A
      // foot pedal held down briefly can otherwise fire dozens of events.
      const now = Date.now();
      if (now - lastAdvanceRef.current < 300) return;
      lastAdvanceRef.current = now;
      e.preventDefault();
      action();
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onAdvance, onBack, secondaryKey, onSecondary]);

  return null;
}
