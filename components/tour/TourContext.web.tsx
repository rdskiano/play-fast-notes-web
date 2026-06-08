// TourContext (web) — the guided spotlight tour.
//
// On the first visit to a screen that registers a tour (via
// useScreenTour), the page dims and a bright spotlight walks the user
// through the screen's controls one at a time, each with a short card
// (Back / Skip / Next + progress dots). "Seen it" is persisted per
// screen in the settings store (the same store the Click-Up coach uses),
// so it auto-runs only once. Afterwards a small ⓘ dot sits on each
// control; tapping one replays the tour from that step. The ? help
// button also replays the tour when one is registered for the screen.
//
// Implementation notes:
//   - Controls are tagged with `data-tour="<id>"` via tourTag() (see
//     types.ts) — no wrappers, no layout changes. The overlay finds them
//     with document.querySelector and measures with getBoundingClientRect.
//   - This whole file is web-only (.web.tsx). Native gets the no-op stub
//     in TourContext.tsx, so shared screens import these names safely.
//   - Rendered with raw DOM/CSS (the box-shadow "hole" spotlight trick)
//     because that's far simpler than RN primitives for a full-screen
//     mask, and we're on web by definition here.

import { useFocusEffect } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { Image, View } from 'react-native';

import { getSetting, setSetting } from '@/lib/db/repos/settings';

import type { TourStep } from './types';

type ScreenTour = { screenId: string; steps: TourStep[] };

type TourCtxValue = {
  // The tour registered by the currently-focused screen (null = none).
  screen: ScreenTour | null;
  // Index of the step being shown, or null when nothing is showing.
  activeIndex: number | null;
  // true = showing a single step (from an ⓘ dot), no walkthrough nav.
  single: boolean;
  // Run the full walkthrough from a step (auto-run / ? button replay).
  start: (fromIndex?: number) => void;
  // Show just one step on its own (ⓘ dots) — closes on "Got it".
  showStep: (index: number) => void;
  next: () => void;
  back: () => void;
  stop: () => void;
  registerScreen: (s: ScreenTour | null) => void;
};

const NOOP: TourCtxValue = {
  screen: null,
  activeIndex: null,
  single: false,
  start: () => {},
  showStep: () => {},
  next: () => {},
  back: () => {},
  stop: () => {},
  registerScreen: () => {},
};

const Ctx = createContext<TourCtxValue>(NOOP);

// Tour visuals are a deliberately dark "coaching" layer so they read as an
// overlay on top of the app, never as part of the (light) UI itself.
const ACCENT = '#2dd4bf'; // bright teal — ties the card to the spotlight ring
const CARD_BG = '#1e293b'; // slate-800
const CARD_TITLE = '#f8fafc';
const CARD_BODY = '#cbd5e1';
const CARD_MUTED = '#94a3b8';

export function TourProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<ScreenTour | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [single, setSingle] = useState(false);

  // Ref mirror of `screen` so next() can read the step count without
  // taking `screen` as a dep (keeps the callback identity stable).
  const screenRef = useRef<ScreenTour | null>(null);
  screenRef.current = screen;

  const registerScreen = useCallback((s: ScreenTour | null) => {
    setScreen(s);
    // Focusing/leaving a screen ends any run; the auto-run effect in
    // useScreenTour will (re)start it if it's never been seen.
    setActiveIndex(null);
    setSingle(false);
  }, []);

  const start = useCallback((fromIndex = 0) => {
    setSingle(false);
    setActiveIndex(fromIndex);
  }, []);
  const showStep = useCallback((index: number) => {
    setSingle(true);
    setActiveIndex(index);
  }, []);
  const stop = useCallback(() => {
    setActiveIndex(null);
    setSingle(false);
  }, []);
  const next = useCallback(() => {
    setActiveIndex((i) => {
      if (i === null) return i;
      const total = screenRef.current?.steps.length ?? 0;
      return i + 1 >= total ? null : i + 1; // past the end → finish
    });
  }, []);
  const back = useCallback(() => {
    setActiveIndex((i) => (i === null || i <= 0 ? i : i - 1));
  }, []);

  const value = useMemo<TourCtxValue>(
    () => ({ screen, activeIndex, single, start, showStep, next, back, stop, registerScreen }),
    [screen, activeIndex, single, start, showStep, next, back, stop, registerScreen],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <TourOverlay />
      <TourDots />
    </Ctx.Provider>
  );
}

export function useTour(): TourCtxValue {
  return useContext(Ctx);
}

// Screens call this to register their tour and auto-run it the first
// time ever. Pass `null` (or an empty array) when the tour shouldn't be
// active — e.g. on a phase of the screen that has no tour. Keep `steps`
// a stable reference (a module-level const) so registration doesn't
// re-fire every render.
export function useScreenTour(screenId: string, steps: TourStep[] | null): void {
  const { registerScreen, start } = useTour();

  useFocusEffect(
    useCallback(() => {
      if (steps && steps.length) registerScreen({ screenId, steps });
      else registerScreen(null);
      return () => registerScreen(null);
    }, [registerScreen, screenId, steps]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!steps || !steps.length) return;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      // QA / cross-device override: append ?tour=1 (or ?tour=<screenId>) to
      // the URL to force the walkthrough, bypassing the once-ever flag. Handy
      // for re-testing on a phone/iPad where your account has already seen it.
      if (isTourForced(screenId)) {
        timer = setTimeout(() => {
          if (!cancelled) start(0);
        }, 400);
        return () => {
          cancelled = true;
          if (timer) clearTimeout(timer);
        };
      }
      const key = `tour.seen.${screenId}`;
      getSetting(key)
        .then((seen) => {
          if (cancelled || seen === '1') return;
          // Let layout/fonts settle so the first target measures correctly.
          timer = setTimeout(() => {
            if (cancelled) return;
            start(0);
            setSetting(key, '1').catch(() => {
              // Couldn't persist — worst case it runs once more next visit.
            });
          }, 400);
        })
        .catch(() => {
          // Settings read failed (network blip before sign-in). Skip the
          // auto-run; the ? button / ⓘ dots still offer it on demand.
        });
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }, [screenId, steps, start]),
  );
}

// ?tour=1 (or ?tour=true) forces every screen's tour; ?tour=<screenId>
// forces a specific one. Used to re-test the walkthrough on any device.
function isTourForced(screenId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = new URLSearchParams(window.location.search).get('tour');
    if (!v) return false;
    return v === '1' || v === 'true' || v === screenId;
  } catch {
    return false;
  }
}

type Rect = { top: number; left: number; width: number; height: number };

function measureTarget(target: string): Rect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// Render a step body with **bold** segments. Newlines are preserved by the
// container's whiteSpace: pre-wrap.
function renderRich(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} style={{ color: CARD_TITLE, fontWeight: 800 }}>
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

// The dim + spotlight + step card shown while a tour is running.
function TourOverlay() {
  const { screen, activeIndex, single, next, back, stop } = useTour();
  const step =
    activeIndex !== null && screen ? screen.steps[activeIndex] ?? null : null;
  const total = screen?.steps.length ?? 0;
  const [rect, setRect] = useState<Rect | null>(null);
  // User-dragged offset of the card from its auto-placed position. Resets
  // on each step so every step starts anchored to its control.
  const [drag, setDrag] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dragStart = useRef<{ x: number; y: number; dx: number; dy: number } | null>(
    null,
  );

  useEffect(() => {
    setDrag({ dx: 0, dy: 0 });
  }, [activeIndex]);

  const onCardPointerDown = (e: { target: EventTarget | null; clientX: number; clientY: number }) => {
    // Don't start a drag when pressing a button — let clicks through.
    if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
    dragStart.current = { x: e.clientX, y: e.clientY, dx: drag.dx, dy: drag.dy };
    const onMove = (ev: PointerEvent) => {
      const s = dragStart.current;
      if (!s) return;
      setDrag({ dx: s.dx + (ev.clientX - s.x), dy: s.dy + (ev.clientY - s.y) });
    };
    const onUp = () => {
      dragStart.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      // Target not on screen (hidden in the current mode) — skip ahead.
      const t = setTimeout(() => next(), 60);
      return () => clearTimeout(t);
    }
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const measure = () => setRect(measureTarget(step.target));
    measure();
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      cancelAnimationFrame(raf);
    };
  }, [step, next]);

  if (activeIndex === null || !step || !rect) return null;

  const pad = 6;
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === total - 1;

  // Cap to the viewport so the card never overflows a narrow phone screen.
  const cardW = Math.min(320, window.innerWidth - 24);
  const estCardH = 210;
  const gap = 14;
  const below = rect.top + rect.height + gap + estCardH < window.innerHeight;
  const cardTop = below
    ? rect.top + rect.height + gap
    : Math.max(12, rect.top - estCardH - gap);
  const cardLeft = Math.max(
    12,
    Math.min(rect.left, window.innerWidth - cardW - 12),
  );

  return (
    <>
      {/* Full-screen click blocker so the page can't be interacted with
          mid-tour. The spotlight hole paints the dim on top of it. */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      {/* Spotlight: a transparent rounded rect over the target, with a
          huge box-shadow spread dimming everything around it. */}
      <div
        style={{
          position: 'fixed',
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          borderRadius: 12,
          boxShadow: `0 0 0 9999px rgba(15, 23, 42, 0.74), 0 0 0 3px ${ACCENT}`,
          zIndex: 9999,
          pointerEvents: 'none',
          transition:
            'top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease',
        }}
      />
      {/* Step card — a dark coaching panel, distinct from the light app UI.
          Draggable so it can be nudged off any control it's covering. */}
      <div
        onPointerDown={onCardPointerDown}
        style={{
          position: 'fixed',
          top: cardTop + drag.dy,
          left: cardLeft + drag.dx,
          width: cardW,
          background: CARD_BG,
          border: `1px solid ${ACCENT}55`,
          borderRadius: 14,
          padding: 18,
          zIndex: 10000,
          boxShadow: '0 14px 44px rgba(0, 0, 0, 0.5)',
          // Never run off-screen: cap to the space below the card's top and
          // scroll long content (e.g. a multi-paragraph step with an image).
          maxHeight: Math.max(160, window.innerHeight - cardTop - 12),
          overflowY: 'auto',
          cursor: 'move',
          userSelect: 'none',
        }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: ACCENT,
              textTransform: 'uppercase',
            }}>
            {single ? 'Quick tip' : `Step ${activeIndex + 1} of ${total}`}
          </span>
          <span
            title="Drag to move"
            style={{ fontSize: 13, color: CARD_MUTED, letterSpacing: 1 }}>
            ⠿ drag
          </span>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: CARD_TITLE,
            marginBottom: 8,
          }}>
          {step.title}
        </div>
        <div
          style={{
            fontSize: 14.5,
            lineHeight: 1.5,
            color: CARD_BODY,
            whiteSpace: 'pre-wrap',
            marginBottom: 16,
          }}>
          {renderRich(step.body)}
        </div>
        {step.image && (
          <div style={{ marginBottom: 16 }}>
            {/* RN <Image> resolves the asset cross-platform. aspectRatio
                on RN-Web Image is unreliable, so a View carries it and the
                Image fills it (same pattern as HelpModal). */}
            <View
              style={{
                width: '100%',
                aspectRatio: step.image.aspectRatio,
                borderRadius: 8,
                overflow: 'hidden',
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: ACCENT + '55',
              }}>
              <Image
                source={step.image.source}
                resizeMode="contain"
                style={{ width: '100%', height: '100%' }}
                accessibilityLabel={step.image.caption ?? 'Example'}
              />
            </View>
            {step.image.caption && (
              <div
                style={{
                  fontSize: 12,
                  color: CARD_MUTED,
                  textAlign: 'center',
                  marginTop: 6,
                }}>
                {step.image.caption}
              </div>
            )}
          </div>
        )}
        {single ? (
          // Opened from an ⓘ dot — just explain this one step, then close.
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={stop} style={primaryBtn}>
              Got it
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 5, flex: 1 }}>
              {screen!.steps.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 99,
                    background: i === activeIndex ? ACCENT : '#475569',
                  }}
                />
              ))}
            </div>
            {!isFirst && (
              <button onClick={back} style={ghostBtn}>
                Back
              </button>
            )}
            <button onClick={stop} style={ghostBtn}>
              Skip
            </button>
            <button onClick={next} style={primaryBtn}>
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// Small ⓘ dots pinned to each control once the tour has been seen.
// Tapping one replays the tour from that step. Hidden while a tour runs.
function TourDots() {
  const { screen, activeIndex, showStep } = useTour();
  const running = activeIndex !== null;
  const [spots, setSpots] = useState<({ top: number; left: number } | null)[]>(
    [],
  );
  // Dots fade out while the page is scrolling and fade back in — already
  // repositioned — once it settles. They never chase a moving target, so
  // there's no jitter.
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    if (!screen || running) {
      setSpots([]);
      return;
    }
    const measure = () =>
      setSpots(
        screen.steps.map((s) => {
          if (s.hideDot) return null; // self-explanatory control — no ⓘ
          const r = measureTarget(s.target);
          if (!r) return null;
          // Sit flush just above a top corner — clears the control's border
          // without floating too far above it. dotAnchor picks the corner
          // (wide controls read better left-anchored); dotOffset nudges.
          const baseLeft =
            (s.dotAnchor ?? 'right') === 'left'
              ? r.left
              : r.left + r.width - 20;
          // Keep the dot on-screen even when its control is wider than (or
          // overflows) the viewport, which would otherwise push a
          // right-anchored dot off the right edge.
          const left = Math.max(
            2,
            Math.min(baseLeft + (s.dotOffset?.x ?? 0), window.innerWidth - 22),
          );
          return {
            top: Math.max(2, r.top - 18 + (s.dotOffset?.y ?? 0)),
            left,
          };
        }),
      );
    measure();

    // While scrolling: hide the dots. When scrolling stops (no scroll event
    // for ~160ms): re-measure and show them again at the new spot.
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      setScrolling(true);
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        measure();
        setScrolling(false);
      }, 160);
    };
    // Resize just re-measures (layout reflow, not a fast-moving target).
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    // Poll occasionally too — controls can shift as data loads / fonts swap.
    const poll = setInterval(measure, 1200);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      clearInterval(poll);
      if (settle) clearTimeout(settle);
    };
  }, [screen, running]);

  if (!screen || running) return null;

  return (
    <>
      {spots.map((p, i) =>
        p ? (
          <button
            key={i}
            onClick={() => showStep(i)}
            title={`${screen.steps[i].title} — show me`}
            style={{
              position: 'fixed',
              top: p.top,
              left: p.left,
              width: 18,
              height: 18,
              borderRadius: 99,
              background: ACCENT,
              color: '#fff',
              border: '2px solid #fff',
              fontSize: 11,
              fontWeight: 800,
              fontStyle: 'italic',
              lineHeight: '14px',
              padding: 0,
              cursor: 'pointer',
              zIndex: 9000,
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
              opacity: scrolling ? 0 : 1,
              pointerEvents: scrolling ? 'none' : 'auto',
              transition: 'opacity 130ms ease',
            }}>
            i
          </button>
        ) : null,
      )}
    </>
  );
}

const ghostBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: CARD_MUTED,
  fontSize: 14,
  fontWeight: 600,
  padding: '8px 10px',
  cursor: 'pointer',
  borderRadius: 8,
};

const primaryBtn: CSSProperties = {
  background: ACCENT,
  border: 'none',
  color: '#06302b', // dark teal text on the bright-teal button
  fontSize: 14,
  fontWeight: 800,
  padding: '8px 16px',
  cursor: 'pointer',
  borderRadius: 8,
};
