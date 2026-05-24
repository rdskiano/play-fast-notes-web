// Web: the pencil tool stays hidden until the user's surface proves it has a
// stylus, i.e. fires a PointerEvent with `pointerType === 'pen'`. Apple Pencil
// in iPad Safari, Surface Pen, and Android stylus tablets all fire this; a
// mouse or fingertip does not. Once detected the result persists in
// localStorage so the tab doesn't disappear on reload.
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pfn:pen-detected';

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Manual override for testing: `?pencil=1` (sticky once set) forces the
    // pencil tab on. Useful when the Apple Pencil isn't firing a
    // `pointerType: 'pen'` event for some reason, or to test the drawing
    // experience before figuring out the detection.
    const params = new URLSearchParams(window.location.search);
    if (params.get('pencil') === '1') {
      window.localStorage.setItem(STORAGE_KEY, 'true');
      return true;
    }
    if (params.get('pencil') === '0') {
      window.localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
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
