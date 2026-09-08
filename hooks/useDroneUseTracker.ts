// Reports drone usage into lib/practiceLog/droneUsage.ts so logPractice can
// stamp the session's drone pitch into the practice log. "Used" means the
// drone was on while the metronome ran — that's when the pitched tone
// actually replaces the click on both platforms. Called by the two metronome
// hosts (PracticeToolsBar / PracticeToolsLayer) beside useDronePitchMemory,
// so every practice surface with a metronome is covered.

import { useEffect } from 'react';

import type { MetronomeApi } from '@/lib/audio/useMetronome';
import { reportDroneUse } from '@/lib/practiceLog/droneUsage';

export function useDroneUseTracker(metro: MetronomeApi): void {
  const { droneEnabled, running, droneMidi } = metro;
  useEffect(() => {
    if (droneEnabled && running) reportDroneUse(droneMidi);
  }, [droneEnabled, running, droneMidi]);
}
