// Web: on tablets (touch device with screen >= 600 px on the short side —
// iPad, Surface, Android tablet) the pencil tool is on by default, because
// every modern tablet ships with stylus support and a friend-link visitor
// shouldn't have to discover that the tab even exists. On phones and
// laptops the tab stays hidden until the surface proves it has a stylus,
// i.e. fires a PointerEvent with `pointerType === 'pen'`. Once detected
// the result persists in localStorage so the tab doesn't disappear on
// reload. `?pencil=1` / `?pencil=0` are manual overrides.
import { useEffect, useState } from 'react';

// v2: the v1 key was sometimes set from the tablet auto-detect path and
// then persisted forever, which left laptop users (or anyone who'd once
// tripped the check) seeing the pencil tab they hadn't earned. v2 only
// writes on a real pointerType==='pen' event, so any stale v1 flags are
// effectively reset by ignoring the old key.
const STORAGE_KEY = 'pfn:pen-detected-v2';

function isTabletDefault(): boolean {
  // Tablet = touch-primary device with a tablet-sized screen. iPad Safari,
  // Surface in tablet mode, and Android tablets all match. iPhones and
  // small Android phones fail the size check; mouse-driven laptops fail
  // the hover/pointer check.
  if (typeof window === 'undefined') return false;
  const isTouch =
    window.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true;
  if (!isTouch) return false;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  return shortSide >= 600;
}

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Manual override for testing: `?pencil=1` (sticky once set) forces the
    // pencil tab on. `?pencil=0` clears the sticky flag.
    const params = new URLSearchParams(window.location.search);
    if (params.get('pencil') === '1') {
      window.localStorage.setItem(STORAGE_KEY, 'true');
      return true;
    }
    if (params.get('pencil') === '0') {
      window.localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    if (window.localStorage.getItem(STORAGE_KEY) === 'true') return true;
    // Tablet default — show the tab without waiting for a pen event.
    // Computed FRESH each visit (not persisted) so a laptop user can't
    // inherit a stuck "true" from a single tablet-shaped session.
    if (isTabletDefault()) return true;
    return false;
  } catch {
    return false;
  }
}

export function usePenDetected(): boolean {
  const [detected, setDetected] = useState<boolean>(readInitial);

  useEffect(() => {
    if (detected) return;
    if (typeof window === 'undefined') return;

    function onPointer(e: PointerEvent) {
      if (e.pointerType !== 'pen') return;
      try {
        window.localStorage.setItem(STORAGE_KEY, 'true');
      } catch {
        // localStorage can throw in private mode — fall back to session-only.
      }
      setDetected(true);
    }

    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('pointermove', onPointer, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('pointermove', onPointer, true);
    };
  }, [detected]);

  return detected;
}
