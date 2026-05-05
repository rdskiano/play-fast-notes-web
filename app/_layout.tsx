import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Redirect, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { FeedbackButton } from '@/components/FeedbackButton';
import { PracticeTimerAlertModal } from '@/components/PracticeTimerAlertModal';
import { PracticeTimersProvider } from '@/components/PracticeTimersContext';
import { StrategyColorsProvider } from '@/components/StrategyColorsContext';
import { useSession } from '@/lib/supabase/auth';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const session = useSession();

  // Loading session — render nothing to avoid auth-gate flicker.
  if (session === undefined) return null;

  // Signed out — redirect to sign-in. Stack still mounts so the redirect
  // target (sign-in.tsx) renders.
  if (session === null) {
    return (
      <ThemeProvider value={DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="sign-in" />
        </Stack>
        <Redirect href="/sign-in" />
        <StatusBar style="dark" />
      </ThemeProvider>
    );
  }

  // Signed in — full app stack. New screens get registered here as they get ported.
  return (
    <ThemeProvider value={DefaultTheme}>
      <StrategyColorsProvider>
        <PracticeTimersProvider>
          <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
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
          <Stack.Screen name="passage/[id]/index" options={{ headerShown: false }} />
          <Stack.Screen
            name="passage/[id]/tempo-ladder"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="passage/[id]/crop"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="passage/[id]/history" />
          <Stack.Screen
            name="passage/[id]/click-up"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="passage/[id]/rhythmic"
            options={{ headerShown: false }}
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
            options={{ headerShown: false }}
          />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="library-log" options={{ headerShown: false }} />
          <Stack.Screen name="folder-log" options={{ headerShown: false }} />
          <Stack.Screen name="import-seed" options={{ headerShown: false }} />
          <Stack.Screen name="interleaved" options={{ headerShown: false }} />
        </Stack>
        <PracticeTimerAlertModal />
        <FeedbackButton />
        </PracticeTimersProvider>
      </StrategyColorsProvider>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
