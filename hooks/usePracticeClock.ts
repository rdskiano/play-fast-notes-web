import { useEffect } from 'react';

import { resetDroneUse } from '@/lib/practiceLog/droneUsage';
import { markPracticeStart } from '@/lib/practiceLog/sessionClock';
import { clearViewerSession } from '@/lib/practiceLog/viewerSession';

// Marks the silent practice clock when a practice screen mounts, so
// logPractice can stamp durationMs into the row it saves. Call once at the
// top of every screen that (directly or via a session hook) calls
// logPractice. See lib/practiceLog/sessionClock.ts for the semantics.
// Also zeroes the drone-use tracker (droneUsage.ts) so a drone from an
// earlier screen never gets stamped into this session's log rows.
export function usePracticeClock(): void {
  useEffect(() => {
    markPracticeStart();
    resetDroneUse();
    // Entering a guided practice screen supersedes any pending viewer
    // metronome session — the strategy's own logging takes over.
    clearViewerSession();
  }, []);
}
