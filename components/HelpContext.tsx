// HelpContext — single source of truth for the in-app help system.
//
// Screens register their help content via <TutorialStep>, which mounts
// a hook that calls `register({ id, title, body, image })`. The global
// <HelpButton> calls `openManually()` to surface that content on
// demand. <TutorialStep> can also call `openAuto(id)` to fire the
// modal the first time per session for true first-timers (gated by
// the parent's `visible` prop — usually a user-state check like
// `practiceLogCount === 0`).
//
// One modal at a time. <HelpProvider> renders the single global
// <HelpModal>; auto-fire and manual open both flow through the same
// `isOpen` state, so they can't stack.
//
// Cross-platform. Web and native both have a real HelpButton + HelpModal
// + TutorialStep now (auto-opens are deduped in memory per session, so no
// persistent store is needed). HelpProvider is mounted on both platforms.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { TutorialStepImage } from '@/components/TutorialStep';

export type HelpContent = {
  id: string;
  title: string;
  body: string;
  image?: TutorialStepImage;
};

type HelpCtxValue = {
  // Register content for the current screen. Returns an unregister
  // callback; mount/unmount via useEffect.
  register: (content: HelpContent) => () => void;
  // The most-recently-registered content, or null if none. Drives
  // what the modal shows when opened.
  active: HelpContent | null;
  // True while the modal is open (either auto-fired or manually opened).
  isOpen: boolean;
  // Open the modal showing `active` content (or placeholder if null).
  openManually: () => void;
  // Auto-open guard: only fires the modal the first time per app
  // session for a given id, so a user who closed the auto-fire doesn't
  // see it re-pop every time they navigate back to the same screen.
  // They can always reopen via the ? button.
  openAuto: (id: string) => void;
  close: () => void;
};

// Fallback for components used outside the provider — they become
// no-ops rather than throwing. This keeps things robust during the
// migration and lets unit tests render components in isolation.
const NOOP_CTX: HelpCtxValue = {
  register: () => () => {},
  active: null,
  isOpen: false,
  openManually: () => {},
  openAuto: () => {},
  close: () => {},
};

const HelpCtx = createContext<HelpCtxValue>(NOOP_CTX);

export function HelpProvider({ children }: { children: ReactNode }) {
  // We keep a stack of registered content so that if two screens mount
  // <TutorialStep> at once (e.g. during a route transition), the
  // most-recent one becomes "active" and unregistering it falls back
  // to the previous. In practice we always have 0 or 1.
  const registryRef = useRef<HelpContent[]>([]);
  const [active, setActive] = useState<HelpContent | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  // Per-session de-dupe set for auto-opens. Resets on app reload.
  const autoOpenedRef = useRef<Set<string>>(new Set());

  const register = useCallback((content: HelpContent) => {
    registryRef.current = [...registryRef.current, content];
    setActive(content);
    return () => {
      registryRef.current = registryRef.current.filter(
        (c) => c.id !== content.id,
      );
      const next =
        registryRef.current[registryRef.current.length - 1] ?? null;
      setActive(next);
    };
  }, []);

  const openManually = useCallback(() => {
    setIsOpen(true);
  }, []);

  const openAuto = useCallback((id: string) => {
    if (autoOpenedRef.current.has(id)) return;
    autoOpenedRef.current.add(id);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo<HelpCtxValue>(
    () => ({ register, active, isOpen, openManually, openAuto, close }),
    [register, active, isOpen, openManually, openAuto, close],
  );

  return <HelpCtx.Provider value={value}>{children}</HelpCtx.Provider>;
}

export function useHelpContext(): HelpCtxValue {
  return useContext(HelpCtx);
}
