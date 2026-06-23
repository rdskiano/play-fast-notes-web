// Landing page for the password-reset email link.
//
// Supabase's resetPasswordForEmail puts a recovery token in the URL hash
// when the user clicks the link in the email; the supabase-js client
// auto-detects the hash on page load, swaps it for a temporary recovery
// session, and emits an onAuthStateChange event with type === 'PASSWORD_RECOVERY'.
//
// We watch for that event so the user does not get bounced back to /sign-in
// before they can pick a new password. Once they submit, supabase.auth.updateUser
// finalises the credentials and the same auth listener carries them into the app.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Lift, Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { setNewPassword } from '@/lib/supabase/auth';
import { supabase } from '@/lib/supabase/client';

const MIN_PASSWORD = 6;

type Phase =
  | { kind: 'waiting' }
  | { kind: 'ready' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'expired' };

export default function ResetPasswordScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [phase, setPhase] = useState<Phase>({ kind: 'waiting' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    let mounted = true;

    // The supabase client needs a tick to parse the URL hash and emit the
    // PASSWORD_RECOVERY event. If we already have a session by the time we
    // mount, we are good to go.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) setPhase({ kind: 'ready' });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setPhase({ kind: 'ready' });
      }
    });

    // Fallback: if we are still waiting after 6 seconds, the link is probably
    // expired or the user opened the page directly.
    const timeout = setTimeout(() => {
      if (mounted && phase.kind === 'waiting') {
        setPhase({ kind: 'expired' });
      }
    }, 6000);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passwordOk = password.length >= MIN_PASSWORD;
  const matches = password === confirm;
  const canSubmit =
    phase.kind === 'ready' && passwordOk && matches && password.length > 0;

  async function onSubmit() {
    if (!canSubmit) return;
    setPhase({ kind: 'submitting' });
    try {
      await setNewPassword(password);
      router.replace('/library');
    } catch (e) {
      setPhase({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.card}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          accessibilityIgnoresInvertColors
        />
        <ThemedText type="title" style={styles.title}>
          Reset your password
        </ThemedText>

        {phase.kind === 'waiting' && (
          <ThemedText style={styles.body}>
            Verifying the reset link…
          </ThemedText>
        )}

        {phase.kind === 'expired' && (
          <>
            <ThemedText style={styles.body}>
              This reset link is invalid or has expired. Head back to sign-in
              and request a new one.
            </ThemedText>
            <Button
              label="Back to sign-in"
              onPress={() => router.replace('/sign-in')}
              fullWidth
              style={styles.primaryBtn}
            />
          </>
        )}

        {(phase.kind === 'ready' ||
          phase.kind === 'submitting' ||
          phase.kind === 'error') && (
          <>
            <ThemedText style={styles.body}>
              Pick a new password — at least {MIN_PASSWORD} characters.
            </ThemedText>

            <View style={styles.inputWrap}>
              <MaterialIcons name="lock-outline" size={20} color={Palette.textMuted} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
                placeholderTextColor={C.icon}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={[styles.input, { color: C.text }]}
                editable={phase.kind !== 'submitting'}
              />
            </View>

            <View style={styles.inputWrap}>
              <MaterialIcons name="lock-outline" size={20} color={Palette.textMuted} />
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirm new password"
                placeholderTextColor={C.icon}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={[styles.input, { color: C.text }]}
                editable={phase.kind !== 'submitting'}
                onSubmitEditing={onSubmit}
              />
            </View>

            {!matches && confirm.length > 0 && (
              <ThemedText style={[styles.error, { color: Palette.danger }]}>
                Passwords do not match.
              </ThemedText>
            )}

            <Button
              label={
                phase.kind === 'submitting' ? 'Saving…' : 'Save new password'
              }
              onPress={onSubmit}
              disabled={!canSubmit}
              fullWidth
              style={styles.primaryBtn}
            />

            {phase.kind === 'error' && (
              <ThemedText style={[styles.error, { color: Palette.danger }]}>
                {phase.message}
              </ThemedText>
            )}
          </>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    gap: Spacing.lg,
  },
  // App-icon mark above the title — 84px, 24px radius, soft lift (matches sign-in).
  logo: {
    width: 84,
    height: 84,
    borderRadius: 24,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
    ...Lift,
  },
  title: { textAlign: 'center' },
  body: {
    textAlign: 'center',
    color: Palette.textSecondary,
    fontSize: Type.size.md,
    lineHeight: 20,
  },
  // White field with a hairline border + leading icon. The TextInput sits
  // inside flex:1 and carries no border of its own.
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: Type.size.lg,
  },
  // Soft lift under the primary action, matching sign-in.
  primaryBtn: {
    borderRadius: Radii.xl,
    ...Lift,
  },
  error: {
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
});
