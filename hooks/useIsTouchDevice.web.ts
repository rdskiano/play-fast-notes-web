// True on touch devices (phone + tablet, e.g. iPad) — no hover, coarse
// pointer. False on laptop/desktop with a mouse or trackpad. Used to enable
// pinch-to-zoom on the practice score for touch devices while laptops keep
// the static framed view (you can't pinch a mouse). Mirrors the matchMedia
// check already used in usePenDetected.web / ToolDock.

import { useEffect, useState } from 'react';

const QUERY = '(hover: none) and (pointer: coarse)';

function detect(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState<boolean>(detect);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setTouch(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return touch;
}
