// Mounts the background sync loop (native). Runs shortly after launch, on
// every return to the foreground, and on a light timer while active. All
// invocations funnel into syncNow(), which self-guards against overlap and
// never throws — a dead-wifi practice room just means "try again later".
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncNow } from './engine';

const ACTIVE_INTERVAL_MS = 60_000;
const LAUNCH_DELAY_MS = 4_000; // let startup + first paint win the launch

export function useSyncEngine(): void {
  useEffect(() => {
    const kickoff = setTimeout(() => void syncNow(), LAUNCH_DELAY_MS);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void syncNow();
    }, ACTIVE_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
      sub.remove();
    };
  }, []);
}
