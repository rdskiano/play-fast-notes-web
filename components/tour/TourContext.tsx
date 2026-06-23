// TourContext (native no-op) — the guided spotlight tour is a web-only
// feature for now; iPad keeps the existing help modal (TutorialStep +
// HelpModal). These stubs let shared screen code import useScreenTour /
// TourProvider / useTour unconditionally and have it do nothing on native.
//
// The real implementation is TourContext.web.tsx.

import type { ReactNode } from 'react';

import type { TourStep } from './types';

export function TourProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useScreenTour(
  _screenId: string,
  _steps: TourStep[] | null,
  _accent?: string,
): void {
  // No-op on native.
}

export function useTour() {
  return {
    screen: null as { screenId: string; steps: TourStep[] } | null,
    activeIndex: null as number | null,
    single: false,
    start: (_fromIndex?: number) => {},
    showStep: (_index: number) => {},
    next: () => {},
    back: () => {},
    stop: () => {},
    registerScreen: (_s: { screenId: string; steps: TourStep[] } | null) => {},
  };
}
