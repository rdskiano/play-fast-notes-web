// Per-passage drone pitch memory (state-memory law, D68): the pitch the
// player chose for a passage is handed back the next time that passage's
// tools mount. Ralph picks the drone pitch from the passage's home note —
// a choice that should be made once per passage, ever.
//
// Storage: the cross-platform settings repo (Supabase row on web, SQLite
// on iOS), key `drone:midi:<targetId>`. Saves are debounced because the
// pitch stepper moves one semitone per tap.

import { useEffect, useRef } from 'react';

import type { MetronomeApi } from '@/lib/audio/useMetronome';
import { getSetting, setSetting } from '@/lib/db/repos/settings';
import { isToolsOnly } from '@/lib/strategies/toolsMode';

export function useDronePitchMemory(
  metro: MetronomeApi,
  targetId?: string | null,
) {
  const metroRef = useRef(metro);
  metroRef.current = metro;
  // The value we just restored — a droneMidi equal to it is an echo of the
  // restore, not a user choice, and must not be written back.
  const restoredRef = useRef<number | null>(null);
  const readyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const usable = !!targetId && !isToolsOnly(targetId);

  useEffect(() => {
    readyRef.current = false;
    restoredRef.current = null;
    if (!usable || !targetId) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await getSetting(`drone:midi:${targetId}`);
        const n = raw == null ? NaN : parseInt(raw, 10);
        if (!cancelled && Number.isFinite(n)) {
          restoredRef.current = n;
          metroRef.current.setDroneMidi(n);
        }
      } catch {
        // Memory is a convenience — never let it break the tools.
      }
      if (!cancelled) readyRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [usable, targetId]);

  const droneMidi = metro.droneMidi;
  useEffect(() => {
    if (!usable || !targetId || !readyRef.current) return;
    if (droneMidi === restoredRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      restoredRef.current = droneMidi;
      setSetting(`drone:midi:${targetId}`, String(droneMidi)).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [usable, targetId, droneMidi]);
}
