// Remembered pencil ink color. Ralph marks in orange so his annotations stay
// visible when he transfers them to the paper part in rehearsal — but the pen
// reset to default ink at the start of every annotate session. The choice is
// stored in settings and the pen now starts in it each session. Apple's
// PencilKit picker can still change the color mid-session but its selection
// can't be read back, so the in-app swatch row is the durable choice.
// null = no saved choice = each platform's historic default ink.

import { useCallback, useEffect, useState } from 'react';

import { getSetting, setSetting } from '@/lib/db/repos/settings';

export const INK_COLOR_KEY = 'pencil:inkColor';

// Black first (the historic default), Ralph's orange second. Deliberately no
// red — his standing "red provokes anxiety" rule for shipped surfaces.
export const INK_SWATCHES = [
  '#1a1a1a', // black
  '#f97316', // orange
  '#2563eb', // blue
  '#16a34a', // green
  '#9333ea', // purple
] as const;

export async function getInkColor(): Promise<string | null> {
  try {
    const v = await getSetting(INK_COLOR_KEY);
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export async function saveInkColor(hex: string): Promise<void> {
  try {
    await setSetting(INK_COLOR_KEY, hex);
  } catch {
    // Best-effort — the live pen is already recolored; worst case the choice
    // doesn't survive to the next session.
  }
}

/** The saved ink as state plus a picker that persists. One call per screen
 *  that hosts a pencil — the swatch row and the canvases share it. */
export function useInkColor(): [string | null, (hex: string) => void] {
  const [ink, setInk] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getInkColor().then((c) => {
      if (!cancelled && c) setInk(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const pick = useCallback((hex: string) => {
    setInk(hex);
    saveInkColor(hex);
  }, []);
  return [ink, pick];
}
