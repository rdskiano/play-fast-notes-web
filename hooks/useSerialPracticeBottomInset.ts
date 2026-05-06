// Returns the bottom inset (in CSS px) needed to clear the floating
// SerialPracticeTimerOverlay. Use it on any screen that has bottom-anchored
// controls (e.g. a Save button, Start button, action panel) that would
// otherwise be covered by the overlay during a Serial Practice session.
//
// Returns 0 when no session is active so screens render at their normal
// padding, and ~70 px (overlay bar height + small gap) when a session is
// running.

import { useSyncExternalStore } from 'react';

import {
  getSnapshot as getSerialSnapshot,
  isSerialPracticeActive,
  subscribe as subscribeSerial,
} from '@/lib/sessions/serialPractice';

const OVERLAY_HEIGHT_PX = 70;

export function useSerialPracticeBottomInset(): number {
  useSyncExternalStore(subscribeSerial, getSerialSnapshot, () => null);
  return isSerialPracticeActive() ? OVERLAY_HEIGHT_PX : 0;
}
