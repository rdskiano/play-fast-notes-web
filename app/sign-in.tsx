import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  signInOnly,
} from '@/lib/supabase/auth';
import { setSetting } from '@/lib/db/repos/settings';
import { bucketById } from '@/lib/onboarding/bumblebee';
import { takePendingHandoff } from '@/lib/onboarding/pendingHandoff';
import { seedBumblebeePiece } from '@/lib/onboarding/seedBumblebee';
import { logOnboardingStep } from '@/lib/onboarding/telemetry';
import { suggestEmailCorrection } from '@/lib/validation/emailTypo';

const MIN_PASSWORD = 6;

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

export default function SignInScreen() {
  const router = useRouter();
  // ?new=1 = arriving from the end of the value-first funnel to CREATE an
  // account. Default (no param) = login only for an existing user — new visitors
  // are sent to /onboarding via "Get started", they don't sign up from here.
  const params = useLocalSearchParams<{ new?: string }>();
  const isSignup = params.new === '1';
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
  // A likely-mistyped domain (gmsil.com, gmail.con, …). Suggest, never force —
  // a bouncing address silently locks the user out of their account forever.
  const emailSuggestion = suggestEmailCorrection(email);
  const passwordOk = password.length >= MIN_PASSWORD;
  const canSubmit = emailOk && passwordOk && status.kind !== 'submitting';

  async function onSubmit() {
    if (!canSubmit) return;
    setStatus({ kind: 'submitting' });
    try {
      // Funnel completion creates the account; the default screen is login-only.
      await (isSignup ? continueWithPassword : signInOnly)(email, password);
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
          {isSignup
            ? 'Your first month is free — the whole app, no card, no subscription, nothing to cancel.'
            : 'Sign in with your email and password.'}
        </ThemedText>
        {isSignup && (
          <ThemedText style={[styles.body, styles.bodySecondary]}>
            Your email is only how we save your music and progress — Flight of
            the Bumblebee, your parts, your practice — so they're here when you
            come back.
          </ThemedText>
        )}

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

        {emailSuggestion && (
          <Pressable
            onPress={() => setEmail(emailSuggestion)}
            hitSlop={6}
            accessibilityRole="button"
            style={styles.suggestionBtn}>
            <MaterialIcons name="error-outline" size={16} color={Palette.danger} />
            <ThemedText style={[styles.suggestionText, { color: Palette.textSecondary }]}>
              Did you mean{' '}
              <ThemedText style={[styles.suggestionText, { color: C.tint }]}>
                {emailSuggestion}
              </ThemedText>
              ?
            </ThemedText>
          </Pressable>
        )}

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
          label={
            status.kind === 'submitting'
              ? isSignup
                ? 'Creating account…'
                : 'Signing in…'
              : isSignup
                ? 'Create account'
                : 'Sign in'
          }
          onPress={onSubmit}
          disabled={!canSubmit}
          fullWidth
          style={styles.continueBtn}
        />

        {status.kind === 'error' && (
          <ThemedText style={[styles.error, { color: Palette.danger }]}>{status.message}</ThemedText>
        )}

        {isSignup ? null : resetState.kind === 'hidden' ? (
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

        {isSignup ? (
          // Funnel completers: a quiet way back to login if they realize they
          // already have an account.
          <Pressable
            onPress={() => router.replace('/sign-in' as never)}
            hitSlop={6}
            style={styles.tourBtn}>
            <ThemedText style={[styles.tourText, { color: Palette.textSecondary }]}>
              Already have an account?{' '}
              <ThemedText style={[styles.tourText, { color: C.tint }]}>Sign in</ThemedText>
            </ThemedText>
          </Pressable>
        ) : (
          // New visitors self-select into the value-first funnel here.
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <ThemedText style={styles.dividerText}>new here?</ThemedText>
              <View style={styles.dividerLine} />
            </View>
            <Button
              label="Get started →"
              variant="outline"
              onPress={() => router.push('/onboarding' as never)}
              fullWidth
            />
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
  // Second reassurance line on the signup card — smaller, tucked under the
  // free-month line, above the email field.
  bodySecondary: {
    fontSize: Type.size.sm,
    lineHeight: 18,
    marginTop: -Spacing.md,
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
  // Inline "did you mean…?" nudge sits just beneath the email field, left-aligned
  // with the field's content. Tapping it accepts the correction.
  suggestionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    marginTop: -Spacing.sm,
  },
  suggestionText: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
  },
  forgotBtn: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
  },
  forgotText: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
  },
  tourBtn: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
  },
  tourText: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Palette.border },
  dividerText: {
    fontSize: Type.size.xs,
    color: Palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
