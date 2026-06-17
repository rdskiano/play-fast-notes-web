// Web Add-to-Home-Screen coaching prompt.
//
// The reality on mobile browsers in 2026: Safari and Chrome each
// reserve ~80 vertical pixels of chrome that the page cannot reclaim
// without a real install. Switching to dvh sizing (see app/+html.tsx)
// keeps the layout fitting the visible area, but the score area is
// still ~25% smaller than it would be in standalone PWA mode. The
// best UX is to coach friend-link visitors into installing — every
// session, until they explicitly opt out.
//
// Spec (Ralph, 2026-05-24): show on every app load on a phone-sized
// viewport, unless the user has checked "Don't show this again," is
// already running inside the installed PWA, or is on a larger device
// where the chrome doesn't actually crowd the score.
//
// The native sibling at ./InstallPrompt.tsx is a no-op — Metro
// resolves the .tsx for iOS/Android and this file for web.

import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

const SUPPRESS_KEY = 'pfn:install-prompt-suppressed';

type DetectedPlatform = 'ios' | 'android' | 'other';

function detectPlatform(): DetectedPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  // The MSStream check excludes legacy IE on Windows Phone, which used
  // to spoof "iPhone" in its UA. Vanishingly rare in 2026 but cheap.
  if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) {
    return 'ios';
  }
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari sets navigator.standalone when launched from the home
  // screen. Other browsers expose the same state via the standalone
  // display-mode media query (set by the manifest).
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  if (iosStandalone) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

function isSuppressed(): boolean {
  try {
    return window.localStorage?.getItem(SUPPRESS_KEY) === 'true';
  } catch {
    // Safari in some privacy modes throws on localStorage access. If we
    // can't read the flag, fail open and show the prompt — the user
    // can dismiss it manually.
    return false;
  }
}

export function InstallPrompt() {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [platform, setPlatform] = useState<DetectedPlatform>('other');

  useEffect(() => {
    // Defer one tick so RN-Web finishes its initial layout pass —
    // useWindowDimensions reads from window.innerWidth/Height which
    // briefly reports stale values during the first render under
    // expo-router's static export.
    const t = window.setTimeout(() => {
      if (isStandalone()) return;
      if (isSuppressed()) return;
      const isPhone = Math.min(width, height) < 600;
      if (!isPhone) return;
      setPlatform(detectPlatform());
      setOpen(true);
    }, 250);
    return () => window.clearTimeout(t);
    // The effect fires once per mount (per app session) — that's the
    // "every visit until they opt out" cadence Ralph asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    if (dontShowAgain) {
      try {
        window.localStorage?.setItem(SUPPRESS_KEY, 'true');
      } catch {
        // localStorage unavailable (private mode, etc.) — closing
        // still works, the user just sees the prompt next visit.
      }
    }
    setOpen(false);
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={close}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: C.background, borderColor: C.icon },
          ]}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            Best on a tablet or computer
          </ThemedText>
          <ThemedText style={[styles.body, { color: C.text }]}>
            Play Fast Notes is built for tablets and computers. It works
            on phone too, but you'll want to add it to your home screen
            first — that hides the browser bars so the score has room to
            breathe.
          </ThemedText>

          {platform === 'ios' ? (
            <View style={styles.steps}>
              <ThemedText style={[styles.step, { color: C.text }]}>
                1. Tap the Share button — the square with an arrow
                pointing up. It's in your browser's toolbar, at the top
                or bottom edge of the screen.
              </ThemedText>
              <ThemedText style={[styles.step, { color: C.text }]}>
                2. Scroll down and tap "Add to Home Screen."
              </ThemedText>
              <ThemedText style={[styles.step, { color: C.text }]}>
                3. Open Play Fast from the home screen instead of Safari.
              </ThemedText>
            </View>
          ) : platform === 'android' ? (
            <View style={styles.steps}>
              <ThemedText style={[styles.step, { color: C.text }]}>
                1. Tap the ⋮ menu in the top right of Chrome.
              </ThemedText>
              <ThemedText style={[styles.step, { color: C.text }]}>
                2. Tap "Install app" or "Add to Home screen."
              </ThemedText>
              <ThemedText style={[styles.step, { color: C.text }]}>
                3. Open Play Fast from the home screen instead of Chrome.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.steps}>
              <ThemedText style={[styles.step, { color: C.text }]}>
                Open your browser's menu and look for "Add to Home
                Screen" or "Install app." Then open Play Fast from your
                home screen for the full-screen view.
              </ThemedText>
            </View>
          )}

          <Pressable
            onPress={() => setDontShowAgain((v) => !v)}
            style={styles.checkRow}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowAgain }}>
            <View
              style={[
                styles.checkbox,
                { borderColor: C.icon },
                dontShowAgain && {
                  backgroundColor: C.tint,
                  borderColor: C.tint,
                },
              ]}>
              {dontShowAgain && (
                <ThemedText style={styles.checkmark}>✓</ThemedText>
              )}
            </View>
            <ThemedText style={[styles.checkLabel, { color: C.text }]}>
              Don't show this again
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={close}
            style={[styles.btn, { backgroundColor: C.tint }]}
            accessibilityRole="button">
            <ThemedText style={styles.btnText}>Close</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radii.xl,
    borderWidth: Borders.thin,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  body: {
    fontSize: Type.size.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  steps: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  step: {
    fontSize: Type.size.sm,
    lineHeight: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radii.sm,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
  checkLabel: {
    fontSize: Type.size.sm,
  },
  btn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    alignSelf: 'flex-end',
  },
  btnText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
});
