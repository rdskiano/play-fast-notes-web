// TopLayer (web) — renders children into a portal at document.body so they sit
// above the ENTIRE app: per-screen stacking contexts (react-navigation's screen
// card, which carries a transform), and app-root floating chrome like the global
// help "i" button. A z-index inside the screen can't clear those; a body portal
// can. Pair the children with pointerEvents="box-none" + position:'fixed' so the
// layer covers the viewport for positioning but only its real content takes taps
// — everything behind it stays interactive.
//
// Native sibling (TopLayer.tsx) is a passthrough; native uses <Modal> instead.

// react-dom ships with react-native-web at runtime, but the project has no
// @types/react-dom; this import is type-only-untyped, not missing.
// @ts-expect-error no bundled types for react-dom here — createPortal is web-only.
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export function TopLayer({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(children, document.body);
}
