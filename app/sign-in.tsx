import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Lift } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  continueWithPassword,
  requestPasswordReset,
} from '@/lib/supabase/auth';
import { setSetting } from '@/lib/db/repos/settings';
import { bucketById } from '@/lib/onboarding/bumblebee';
import { takePendingHandoff } from '@/lib/onboarding/pendingHandoff';
import { seedBumblebeePiece } from '@/lib/onboarding/seedBumblebee';
import { logOnboardingStep } from '@/lib/onboarding/telemetry';

const MIN_PASSWORD = 6;

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

export default function SignInScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [resetState, setResetState] = useState<
    | { kind: 'hidden' }
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'sent' }
    | { kind: 'error'; message: string }
  >({ kind: 'hidden' });

  const emailOk = email.trim().length > 0 && email.includes('@');
  const passwordOk = password.length >= MIN_PASSWORD;
  const canSubmit = emailOk && passwordOk && status.kind !== 'submitting';

  async function onSubmit() {
    if (!canSubmit) return;
    setStatus({ kind: 'submitting' });
    try {
      await continueWithPassword(email, password);
      // Successful sign-in/up. If the user came from the value-first onboarding
      // (did the Bumblebee taste, then tapped a handoff that needed an account),
      // finish the job: seed the sample into their new library and mark
      // onboarding seen so the library doesn't redirect them back into it. Then
      // land them where they intended — the upload flow or their library.
      const pending = takePendingHandoff();
      if (pending) {
        try {
          await setSetting('onboarding.seen', 'true');
          await seedBumblebeePiece(bucketById(pending.bucketId));
        } catch {
          // best-effort — never block landing
        }
        // Funnel: the conversion. Same anon id as the pre-signup steps, so the
        // whole journey (landed → … → signed_up) stitches together.
        void logOnboardingStep('signed_up', { intent: pending.intent });
        router.replace(pending.intent === 'upload' ? '/upload?coach=1' : '/library');
      } else {
        // The auth listener in _layout sees the session, but the URL is still
        // /sign-in — push somewhere explicitly so the user lands on success.
        router.replace('/library');
      }
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function onSendReset() {
    if (!emailOk) {
      setResetState({ kind: 'error', message: 'Enter your email above first.' });
      return;
    }
    setResetState({ kind: 'sending' });
    try {
      await requestPasswordReset(email);
      setResetState({ kind: 'sent' });
    } catch (e) {
      setResetState({
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
          Play Fast Notes
        </ThemedText>
        <ThemedText style={styles.body}>
          Enter your email and a password. New emails create an account; existing
          emails sign in.
        </ThemedText>

        <View style={styles.inputWrap}>
          <MaterialIcons name="mail-outline" size={20} color={Palette.textMuted} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={C.icon}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[styles.input, { color: C.text }]}
            editable={status.kind !== 'submitting'}
          />
        </View>

        <View style={styles.inputWrap}>
          <MaterialIcons name="lock-outline" size={20} color={Palette.textMuted} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={`Password (${MIN_PASSWORD}+ characters)`}
            placeholderTextColor={C.icon}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={[styles.input, { color: C.text }]}
            editable={status.kind !== 'submitting'}
            onSubmitEditing={onSubmit}
          />
        </View>

        <Button
          label={status.kind === 'submitting' ? 'Signing in…' : 'Continue'}
          onPress={onSubmit}
          disabled={!canSubmit}
          fullWidth
          style={styles.continueBtn}
        />

        {status.kind === 'error' && (
          <ThemedText style={[styles.error, { color: Palette.danger }]}>{status.message}</ThemedText>
        )}

        {resetState.kind === 'hidden' ? (
          <Pressable
            onPress={() => setResetState({ kind: 'idle' })}
            hitSlop={6}
            style={styles.forgotBtn}>
            <ThemedText style={[styles.forgotText, { color: C.tint }]}>
              Forgot password?
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.resetCard}>
            {resetState.kind === 'sent' ? (
              <ThemedText style={[styles.resetMessage, { color: C.text }]}>
                Check your email for a reset link. You can close this tab.
              </ThemedText>
            ) : (
              <>
                <ThemedText style={[styles.resetMessage, { color: C.text }]}>
                  We will send a reset link to the email above. Make sure it is
                  the address you signed up with.
                </ThemedText>
                <Button
                  label={
                    resetState.kind === 'sending' ? 'Sending…' : 'Send reset link'
                  }
                  onPress={onSendReset}
                  disabled={resetState.kind === 'sending'}
                  variant="outline"
                  fullWidth
                />
                {resetState.kind === 'error' && (
                  <ThemedText style={[styles.error, { color: Palette.danger }]}>
                    {resetState.message}
                  </ThemedText>
                )}
                <Pressable
                  onPress={() => setResetState({ kind: 'hidden' })}
                  hitSlop={6}>
                  <ThemedText style={[styles.forgotText, { color: C.icon }]}>
                    Cancel
                  </ThemedText>
                </Pressable>
              </>
            )}
          </View>
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
  // App-icon mark above the title — 84px, 24px radius, soft lift (per spec).
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
    marginBottom: Spacing.sm,
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
  // Soft lift under the primary action, matching the prototype.
  continueBtn: {
    borderRadius: Radii.xl,
    ...Lift,
  },
  error: {
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
  forgotBtn: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
  },
  forgotText: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
  },
  resetCard: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  resetMessage: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    lineHeight: 18,
    opacity: 0.85,
  },
});
