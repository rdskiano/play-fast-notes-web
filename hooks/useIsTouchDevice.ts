// Native (iOS/Android) is always a touch device. Web sibling
// (useIsTouchDevice.web.ts) does the real matchMedia check.

export function useIsTouchDevice(): boolean {
  return true;
}
