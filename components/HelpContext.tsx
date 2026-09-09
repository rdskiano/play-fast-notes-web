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
// NO MORE AUTO-OPENING MODALS (Ralph, 2026-09-09). Watching first-time
// users showed the popups were pure interruption: dismissed unread,
// forgotten by the time the question actually came up. `openAuto` now
// fires a NUDGE instead — the ? button pulses with a small "New here?"
// tag the first time ever a user lands on a screen whose TutorialStep is
// eligible (visible). The nudge is "once ever, per id": the same
// `help.autoSeen.<id>` flag that used to gate the popup now gates the
// nudge, persisted via the cross-platform settings store (SQLite on
// native, Supabase on web). The content itself is only ever shown when
// the user asks, via the ? button. An in-memory set additionally dedupes
// within a single session so the async flag read only runs once per id
// per launch.

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
  // True while the modal is open (manually opened, or forced via the
  // ?tutorial= QA override).
  isOpen: boolean;
  // True while the ? button should pulse ("you haven't met this screen's
  // guide yet"). Set by openAuto, cleared on open or screen change.
  nudge: boolean;
  // Open the modal showing `active` content (or placeholder if null).
  openManually: () => void;
  // First-visit guard: the first time EVER a given id is eligible
  // (persisted across sessions), light up the ? button's nudge. Never
  // opens the modal itself — the user opens it via the ? button.
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
  nudge: false,
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
  const [nudge, setNudge] = useState(false);
  // Per-session de-dupe set for auto-opens, so the persisted-flag read
  // below only runs once per id per app launch. The durable "seen ever"
  // record lives in the settings store (see openAuto).
  const autoOpenedRef = useRef<Set<string>>(new Set());

  const register = useCallback((content: HelpContent) => {
    registryRef.current = [...registryRef.current, content];
    setActive(content);
    // A new screen's registration clears any nudge left over from the
    // previous screen — the pulse always refers to the screen you're on.
    setNudge(false);
    return () => {
      registryRef.current = registryRef.current.filter(
        (c) => c.id !== content.id,
      );
      const next =
        registryRef.current[registryRef.current.length - 1] ?? null;
      setActive(next);
      if (next === null) setNudge(false);
    };
  }, []);

  const openManually = useCallback(() => {
    setNudge(false);
    setIsOpen(true);
  }, []);

  const openAuto = useCallback((id: string) => {
    // Attempt at most once per id per session (guards the async read
    // below from re-running when useFocusEffect re-fires).
    if (autoOpenedRef.current.has(id)) return;
    autoOpenedRef.current.add(id);
    // Nudge only the first time ever for this id. Persist immediately so
    // it never fires again, on any device the user syncs to (web) or
    // this device (native). NOTE: this no longer opens the modal — it
    // pulses the ? button (see the file header for the 2026-09-09 why).
    const key = `help.autoSeen.${id}`;
    getSetting(key)
      .then((seen) => {
        if (seen === '1') return;
        setNudge(true);
        setSetting(key, '1').catch(() => {
          // Couldn't persist — worst case it nudges once more next
          // session. Not worth surfacing.
        });
      })
      .catch(() => {
        // Read failed (no DB yet on first native launch, or a network
        // blip on web before sign-in). A stray nudge is harmless.
        setNudge(true);
      });
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo<HelpCtxValue>(
    () => ({ register, active, isOpen, nudge, openManually, openAuto, close }),
    [register, active, isOpen, nudge, openManually, openAuto, close],
  );

  return <HelpCtx.Provider value={value}>{children}</HelpCtx.Provider>;
}

export function useHelpContext(): HelpCtxValue {
  return useContext(HelpCtx);
}
