import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Redirect, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { PracticeTimerAlertModal } from '@/components/PracticeTimerAlertModal';
import { PracticeTimersProvider } from '@/components/PracticeTimersContext';
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
      <PracticeTimersProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen
            name="upload"
            options={{ presentation: 'modal', title: 'Add a piece' }}
          />
          <Stack.Screen name="piece/[id]/index" options={{ headerShown: false }} />
          <Stack.Screen
            name="piece/[id]/tempo-ladder"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="library-log" options={{ headerShown: false }} />
        </Stack>
        <PracticeTimerAlertModal />
      </PracticeTimersProvider>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
