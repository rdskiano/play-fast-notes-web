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
// + TutorialStep. HelpProvider is mounted on both platforms.
//
// Auto-open is "once ever, per id" — the first time a user lands on a
// screen whose TutorialStep is eligible (visible), its intro fires and a
// flag is persisted (`help.autoSeen.<id>`) via the cross-platform
// settings store (SQLite on native, Supabase on web — the same store the
// Click-Up coach uses). After that it never auto-fires again; the user
// reopens on demand with the ? button. An in-memory set additionally
// dedupes within a single session so the async flag read only runs once
// per id per launch.

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
import { getSetting, setSetting } from '@/lib/db/repos/settings';

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
  // Auto-open guard: fires the modal the first time EVER for a given id
  // (persisted across sessions), so a user who has already seen a
  // strategy's intro doesn't get it again. They can always reopen via
  // the ? button.
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
  // Per-session de-dupe set for auto-opens, so the persisted-flag read
  // below only runs once per id per app launch. The durable "seen ever"
  // record lives in the settings store (see openAuto).
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
    // Attempt at most once per id per session (guards the async read
    // below from re-running when useFocusEffect re-fires).
    if (autoOpenedRef.current.has(id)) return;
    autoOpenedRef.current.add(id);
    // Fire only the first time ever for this id. Persist immediately so
    // it never auto-fires again, on any device the user syncs to (web)
    // or this device (native).
    const key = `help.autoSeen.${id}`;
    getSetting(key)
      .then((seen) => {
        if (seen === '1') return;
        setIsOpen(true);
        setSetting(key, '1').catch(() => {
          // Couldn't persist — worst case it auto-fires once more next
          // session. Not worth surfacing.
        });
      })
      .catch(() => {
        // Read failed (no DB yet on first native launch, or a network
        // blip on web before sign-in). Fail open: help the user now.
        setIsOpen(true);
      });
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
