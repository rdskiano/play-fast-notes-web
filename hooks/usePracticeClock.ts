import { useEffect } from 'react';

import { markPracticeStart } from '@/lib/practiceLog/sessionClock';

// Marks the silent practice clock when a practice screen mounts, so
// logPractice can stamp durationMs into the row it saves. Call once at the
// top of every screen that (directly or via a session hook) calls
// logPractice. See lib/practiceLog/sessionClock.ts for the semantics.
export function usePracticeClock(): void {
  useEffect(() => {
    markPracticeStart();
  }, []);
}
