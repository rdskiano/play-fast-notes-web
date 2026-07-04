// Unified root layout (web + iOS).
//
// expo-router 6 doesn't honor `.web.tsx` for layout files — it sees both
// `_layout.tsx` and `_layout.web.tsx` and bundles both into the web build,
// which breaks if one of them transitively imports a native-only module
// (e.g. expo-sqlite). So this file is the ONE layout for both platforms.
//
// Platform divergence:
//   - Web requires Supabase sign-in (auth gate). Native does not (offline-
//     first via local SQLite; signing in is optional, only needed to use
//     /import-supabase).
//   - Native runs SQLite migrations + seed on startup. Web's data layer is
//     Supabase, no migrations. The startupMigrate() call resolves to a
//     no-op on web via Metro's .web.ts resolution (lib/startup/migrate.web.ts).
//   - Native mounts InterleavedTimerProvider; web doesn't need it (no
//     background-audio timer there). Rendered conditionally below.
//   - The in-app help system (HelpProvider / HelpModal / HelpButton /
//     TutorialStep) runs on BOTH platforms now. Auto-opens are deduped
//     in memory per session, so no persistent store is needed — see
//     components/HelpContext.

import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Redirect, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { LogBox, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CheckoutResultModal } from '@/components/CheckoutResultModal';
import { HelpButton } from '@/components/HelpButton';
import { FeedbackButton } from '@/components/FeedbackButton';
import { HelpModal } from '@/components/HelpModal';
import { HelpProvider } from '@/components/HelpContext';
import { InstallPrompt } from '@/components/InstallPrompt';
import {
  InterleavedStatusBar,
  InterleavedTimerProvider,
} from '@/components/InterleavedTimerContext';
import { PracticeTimerAlertModal } from '@/components/PracticeTimerAlertModal';
import { PracticeTimersProvider } from '@/components/PracticeTimersContext';
import { StitchHost } from '@/components/StitchHost';
import { StrategyColorsProvider } from '@/components/StrategyColorsContext';
import { TourProvider } from '@/components/tour/TourContext';
import { useSession } from '@/lib/supabase/auth';
import { registerServiceWorker } from '@/lib/sw/registerServiceWorker';
import { startupMigrate } from '@/lib/startup/migrate';

LogBox.ignoreLogs([/Failed to install react-native-audio-api/]);

const IS_WEB = Platform.OS === 'web';

export const unstable_settings = {
  anchor: '(tabs)',
};

function NativeWrapper({ children }: { children: ReactNode }) {
  // InterleavedTimerProvider depends on react-native-audio-api hooks for
  // metronome state — fine on iOS, no useful behavior on web. Wrap only on
  // native so web doesn't pay the runtime cost.
  if (IS_WEB) return <>{children}</>;
  return <InterleavedTimerProvider>{children}</InterleavedTimerProvider>;
}

export default function RootLayout() {
  const session = useSession();
  const pathname = usePathname();
  const [dbReady, setDbReady] = useState(IS_WEB);

  useEffect(() => {
    if (IS_WEB) return;
    startupMigrate()
      .catch((e) => console.warn('[startup] migrations failed', e))
      .finally(() => setDbReady(true));
  }, []);

  // Register the Supabase-storage cache service worker once on boot. Native
  // resolves to a no-op via the .ts/.web.ts split, so this is safe unguarded.
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  if (!dbReady) return null;

  // Web auth gate. Native skips this — no sign-in required.
  if (IS_WEB) {
    if (session === undefined) return null;
    if (session === null) {
      // Value-first funnel: a stranger's landing page is the Bumblebee taste
      // (/onboarding), NOT a sign-in wall. Onboarding is fully client-side, so
      // it runs with no account; it only asks for email at the handoff. /sign-in
      // + /reset-password stay reachable for returning users (the welcome screen
      // links to sign-in). Everything else falls back to the onboarding landing.
      const isPublic =
        pathname === '/sign-in' ||
        pathname === '/reset-password' ||
        pathname === '/onboarding';
      return (
        <ThemeProvider value={DefaultTheme}>
          <SafeAreaProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="sign-in" />
              <Stack.Screen name="reset-password" />
            </Stack>
            {/* Logged-out default = sign-in (existing users). New visitors
                self-select into the value-first funnel via "Get started" on the
                sign-in screen; their account is created at the funnel's end. */}
            {!isPublic && <Redirect href="/sign-in" />}
            {/* Install prompt lives here too so a friend opening the link on
                their phone still gets coached into Add-to-Home-Screen. */}
            <InstallPrompt />
            <StatusBar style="dark" />
          </SafeAreaProvider>
        </ThemeProvider>
      );
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* SafeAreaProvider feeds `useSafeAreaInsets()` real values from
          the device's safe-area insets. On iOS native it reads the
          notch / status bar. On web it reads CSS `env(safe-area-inset-*)`
          — which the iPhone PWA exposes because we set
          `viewport-fit=cover` in app/+html.tsx. Without this provider
          mounted, every header that calls `useSafeAreaInsets()` (e.g.
          SessionTopBar) got `{top: 0}` and rendered behind the iPhone
          status bar's "4:48" / wifi icons. */}
      <SafeAreaProvider>
        <StrategyColorsProvider>
          <NativeWrapper>
            <PracticeTimersProvider>
              <HelpProvider>
              <TourProvider>
              <ThemeProvider value={DefaultTheme}>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="sign-in" options={{ headerShown: false }} />
                <Stack.Screen name="reset-password" options={{ headerShown: false }} />
                <Stack.Screen
                  name="upload"
                  options={{ presentation: 'modal', title: 'Add a passage' }}
                />
                <Stack.Screen
                  name="multi-page"
                  options={{ presentation: 'modal', title: 'Two-page passage' }}
                />
                <Stack.Screen
                  name="document-upload"
                  options={{ presentation: 'modal', title: 'Add a full part' }}
                />
                <Stack.Screen name="document/[id]" options={{ headerShown: false }} />
                <Stack.Screen
                  name="passage/[id]/index"
                  options={IS_WEB ? { headerShown: false } : { title: 'Passage' }}
                />
                <Stack.Screen
                  name="passage/[id]/tempo-ladder"
                  options={IS_WEB ? { headerShown: false } : { title: 'Tempo Ladder' }}
                />
                <Stack.Screen
                  name="passage/[id]/click-up"
                  options={IS_WEB ? { headerShown: false } : { title: 'Interleaved Click-Up' }}
                />
                <Stack.Screen
                  name="passage/[id]/micro-chaining"
                  options={IS_WEB ? { headerShown: false } : { title: 'Micro-Chaining' }}
                />
                <Stack.Screen
                  name="passage/[id]/macro-chaining"
                  options={IS_WEB ? { headerShown: false } : { title: 'Macro-Chaining' }}
                />
                <Stack.Screen
                  name="passage/[id]/rhythmic"
                  options={IS_WEB ? { headerShown: false } : { title: 'Rhythmic Variation' }}
                />
                <Stack.Screen
                  name="passage/[id]/chunking"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="passage/[id]/rhythm-list"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="passage/[id]/rhythm-builder"
                  options={IS_WEB ? { headerShown: false } : { title: 'Exercise Builder' }}
                />
                <Stack.Screen
                  name="passage/[id]/crop"
                  options={IS_WEB ? { headerShown: false } : { title: 'Crop' }}
                />
                <Stack.Screen
                  name="passage/[id]/history"
                  options={IS_WEB ? {} : { title: 'Practice History' }}
                />
                <Stack.Screen
                  name="passage/[id]/self-led/[key]"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="passage/[id]/self-led/recording"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="folder-log"
                  options={IS_WEB ? { headerShown: false } : { title: 'Practice Log' }}
                />
                <Stack.Screen name="library-log" options={{ headerShown: false }} />
                <Stack.Screen name="document-log" options={{ headerShown: false }} />
                <Stack.Screen name="account" options={{ headerShown: false }} />
                <Stack.Screen name="community" options={{ headerShown: false }} />
                <Stack.Screen name="community/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="imslp" options={{ headerShown: false }} />
                <Stack.Screen
                  name="interleaved"
                  options={{ headerShown: false, title: 'Serial Practice' }}
                />
                <Stack.Screen name="tools/index" options={{ headerShown: false }} />
                <Stack.Screen name="tools/metronome" options={{ headerShown: false }} />
                <Stack.Screen name="import-seed" options={{ headerShown: false }} />
                <Stack.Screen name="import-supabase" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              </Stack>
                {!IS_WEB && <InterleavedStatusBar />}
                <PracticeTimerAlertModal />
                {!IS_WEB && <StitchHost />}
                {/* Help system: HelpModal is the single global modal
                    that both auto-fires (from <TutorialStep>) and
                    manual opens (from <HelpButton>) share. The button
                    is fixed bottom-right on every screen. Live on both
                    web and native — see components/HelpContext. */}
                <HelpModal />
                <HelpButton />
                {/* Feedback: round bottom-LEFT button (mirrors HelpButton's
                    bottom-right). Web-only + self-hides on practice screens —
                    see components/FeedbackButton. */}
                <FeedbackButton />
                {/* Phone-only Add-to-Home-Screen coach. On the iPad app
                    the component resolves to a no-op via .tsx / .web.tsx
                    Metro split, so this line is safe to render on both
                    platforms. */}
                <InstallPrompt />
                {/* Post-Stripe confirmation (?checkout=success / already /
                    cancelled) — the "did my payment work?" answer. Web-only
                    via the .tsx / .web.tsx split. */}
                <CheckoutResultModal />
                <StatusBar style="dark" />
              </ThemeProvider>
              </TourProvider>
              </HelpProvider>
            </PracticeTimersProvider>
          </NativeWrapper>
        </StrategyColorsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
