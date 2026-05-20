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
//   - Web mounts FeedbackButton; native doesn't (no Formspree on iPad).

import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Redirect, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { LogBox, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { FeedbackButton } from '@/components/FeedbackButton';
import {
  InterleavedStatusBar,
  InterleavedTimerProvider,
} from '@/components/InterleavedTimerContext';
import { PracticeTimerAlertModal } from '@/components/PracticeTimerAlertModal';
import { PracticeTimersProvider } from '@/components/PracticeTimersContext';
import { StitchHost } from '@/components/StitchHost';
import { StrategyColorsProvider } from '@/components/StrategyColorsContext';
import { useSession } from '@/lib/supabase/auth';
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

  if (!dbReady) return null;

  // Web auth gate. Native skips this — no sign-in required.
  if (IS_WEB) {
    if (session === undefined) return null;
    if (session === null) {
      const isPublic = pathname === '/sign-in' || pathname === '/reset-password';
      return (
        <ThemeProvider value={DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="reset-password" />
          </Stack>
          {!isPublic && <Redirect href="/sign-in" />}
          <StatusBar style="dark" />
        </ThemeProvider>
      );
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StrategyColorsProvider>
        <NativeWrapper>
          <PracticeTimersProvider>
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
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen
                  name="interleaved"
                  options={{ headerShown: false, title: 'Serial Practice' }}
                />
                <Stack.Screen name="import-seed" options={{ headerShown: false }} />
                <Stack.Screen name="import-supabase" options={{ headerShown: false }} />
              </Stack>
              {!IS_WEB && <InterleavedStatusBar />}
              <PracticeTimerAlertModal />
              {!IS_WEB && <StitchHost />}
              {IS_WEB && <FeedbackButton />}
              <StatusBar style="dark" />
            </ThemeProvider>
          </PracticeTimersProvider>
        </NativeWrapper>
      </StrategyColorsProvider>
    </GestureHandlerRootView>
  );
}
