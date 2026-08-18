import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Lift } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ONBOARDING_FUNNEL_ENABLED } from '@/constants/onboardingFunnel';
import {
  continueWithPassword,
  requestPasswordReset,
  resendConfirmationEmail,
  signInOnly,
  signUpWithProfile,
} from '@/lib/supabase/auth';
import { setSetting } from '@/lib/db/repos/settings';
import { bucketById, ONBOARDING_INSTRUMENTS } from '@/lib/onboarding/bumblebee';
import { takePendingHandoff } from '@/lib/onboarding/pendingHandoff';
import { seedBumblebeePiece } from '@/lib/onboarding/seedBumblebee';
import { ONBOARDING_INSTRUMENT_KEY } from '@/lib/onboarding/strategyDemos';
import { logOnboardingStep } from '@/lib/onboarding/telemetry';
import { suggestEmailCorrection } from '@/lib/validation/emailTypo';

const MIN_PASSWORD = 6;

// The setup screen's instrument picker lists instruments in orchestral score
// order (winds top to bottom, brass, keyboard/fretted, strings) rather than by
// transposition group. Any instrument added to ONBOARDING_INSTRUMENTS but
// missing here falls to the end of the list instead of disappearing.
const INSTRUMENT_SCORE_ORDER = [
  'Flute',
  'Oboe',
  'Clarinet',
  'Alto saxophone',
  'Tenor saxophone',
  'Baritone saxophone',
  'Bassoon',
  'French horn',
  'Trumpet',
  'Trombone',
  'Tuba',
  'Piano',
  'Guitar',
  'Violin',
  'Viola',
  'Cello',
];

const INSTRUMENT_PLACEHOLDER = 'Choose your instrument…';

function scoreOrderedInstruments() {
  return [...ONBOARDING_INSTRUMENTS].sort((a, b) => {
    const ai = INSTRUMENT_SCORE_ORDER.indexOf(a.name);
    const bi = INSTRUMENT_SCORE_ORDER.indexOf(b.name);
    return (ai === -1 ? INSTRUMENT_SCORE_ORDER.length : ai) -
      (bi === -1 ? INSTRUMENT_SCORE_ORDER.length : bi);
  });
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

export default function SignInScreen() {
  const router = useRouter();
  // Three modes:
  //  - default (no param): login for an existing user.
  //  - ?new=1: arriving from the END of the value-first funnel to create the
  //    account the funnel promised (the pending-handoff path).
  //  - direct signup: a visitor who already knows they want in creates an
  //    account right here, with just an instrument pick, and lands in an empty
  //    library. Entered via the "skip the tour" link below (or ?signup=1 for
  //    direct links). On native this is the ONLY signup path, since the funnel
  //    is web-shaped.
  const params = useLocalSearchParams<{ new?: string; signup?: string }>();
  const isFunnelSignup = ONBOARDING_FUNNEL_ENABLED && params.new === '1';
  const [directSignup, setDirectSignup] = useState(params.signup === '1');
  const isSignup = isFunnelSignup || directSignup;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [instrument, setInstrument] = useState<string | null>(null);
  const [instrumentPickerOpen, setInstrumentPickerOpen] = useState(false);
  // Set (to the signup email) after account creation when Supabase requires
  // the confirmation link before there's a session. Replaces the form with a
  // "check your email" card.
  const [awaitingConfirm, setAwaitingConfirm] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
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
  const canSubmit =
    emailOk &&
    passwordOk &&
    status.kind !== 'submitting' &&
    (!directSignup || (instrument !== null && name.trim().length > 0));

  async function onSubmit() {
    if (!canSubmit) return;
    setStatus({ kind: 'submitting' });
    try {
      if (directSignup) {
        // The setup form: create the account with name + instrument riding
        // along as account metadata (they must survive the confirmation gap).
        const result = await signUpWithProfile(email, password, {
          name,
          instrument: instrument!,
        });
        if (result.kind === 'confirm-email') {
          // No session until they click the link — show the check-email card.
          setStatus({ kind: 'idle' });
          setAwaitingConfirm(email.trim());
          void logOnboardingStep('signed_up', {
            intent: 'direct',
            instrument,
            confirm: 'pending',
          });
          return;
        }
        // Signed in immediately (confirmation off). Write the settings now and
        // mark onboarding seen so the library shows its first-passage hero.
        try {
          await setSetting(ONBOARDING_INSTRUMENT_KEY, instrument!);
          await setSetting('onboarding.seen', 'true');
        } catch {
          // best-effort — never block landing
        }
        void logOnboardingStep('signed_up', { intent: 'direct', instrument });
        router.replace('/library');
        return;
      }

      await (isFunnelSignup ? continueWithPassword : signInOnly)(email, password);
      // Successful sign-in/up. If the user came from the value-first onboarding
      // (did the Bumblebee taste, then tapped a handoff that needed an account),
      // finish the job: seed the sample into their new library and mark
      // onboarding seen so the library doesn't redirect them back into it. Then
      // land them where they intended — the upload flow or their library.
      // (Read even on plain logins so a stale handoff from an abandoned funnel
      // run can't fire on some later login.)
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

  async function onResendConfirmation() {
    if (!awaitingConfirm || resendState !== 'idle') return;
    setResendState('sending');
    try {
      await resendConfirmationEmail(awaitingConfirm);
      setResendState('sent');
    } catch {
      setResendState('idle');
    }
  }

  // After account creation with email confirmation on: there is no session
  // until they click the link, so the form gives way to this card.
  if (awaitingConfirm) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.logo}
              accessibilityIgnoresInvertColors
            />
            <ThemedText type="title" style={styles.title}>
              Check your email
            </ThemedText>
            <ThemedText style={styles.body}>
              We sent a confirmation link to {awaitingConfirm}. Tap the link to
              finish creating your account, then come back here and sign in.
            </ThemedText>
            <ThemedText style={[styles.body, styles.bodySecondary]}>
              No email after a minute or two? Check your spam folder.
            </ThemedText>
            <Button
              label={
                resendState === 'sending'
                  ? 'Sending…'
                  : resendState === 'sent'
                    ? 'Sent again. Check your inbox'
                    : 'Send the email again'
              }
              variant="outline"
              onPress={onResendConfirmation}
              disabled={resendState !== 'idle'}
              fullWidth
            />
            <Button
              label="Back to sign in"
              onPress={() => {
                setAwaitingConfirm(null);
                setDirectSignup(false);
                setResendState('idle');
                setPassword('');
              }}
              fullWidth
            />
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
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
            {directSignup
              ? 'Your email is only how we save your music and progress, so everything is here when you come back.'
              : "Your email is only how we save your music and progress — Flight of the Bumblebee, your parts, your practice — so they're here when you come back."}
          </ThemedText>
        )}

        {directSignup && (
          <View style={styles.inputWrap}>
            <MaterialIcons name="person-outline" size={20} color={Palette.textMuted} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={C.icon}
              autoCapitalize="words"
              autoCorrect={false}
              style={[styles.input, { color: C.text }]}
              editable={status.kind !== 'submitting'}
            />
          </View>
        )}

        {directSignup && (
          <View style={styles.instrumentSection}>
            <ThemedText style={styles.instrumentLabel}>What do you play?</ThemedText>
            <ThemedText style={[styles.body, styles.bodySecondary, styles.instrumentHint]}>
              Exercises and demos will show up in your clef and key.
            </ThemedText>
            <Pressable
              onPress={() => setInstrumentPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose your instrument"
              style={[
                styles.instrumentField,
                { borderColor: Palette.border, backgroundColor: Palette.card },
              ]}>
              <MaterialIcons name="music-note" size={20} color={Palette.textMuted} />
              <ThemedText
                style={[
                  styles.instrumentRowText,
                  styles.instrumentFieldText,
                  { color: instrument ? Palette.textSecondary : Palette.textMuted },
                ]}>
                {instrument ?? INSTRUMENT_PLACEHOLDER}
              </ThemedText>
              <MaterialIcons name="arrow-drop-down" size={24} color={Palette.textMuted} />
            </Pressable>
            <ActionSheet
              visible={instrumentPickerOpen}
              title="What do you play?"
              items={scoreOrderedInstruments().map((it) => ({
                label: it.name,
                primary: it.name === instrument,
                onPress: () => {
                  setInstrument(it.name);
                  setInstrumentPickerOpen(false);
                },
              }))}
              onCancel={() => setInstrumentPickerOpen(false)}
            />
          </View>
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
          // A quiet way back to login if they realize they already have an
          // account.
          <Pressable
            onPress={() => {
              if (directSignup) {
                setDirectSignup(false);
              } else {
                router.replace('/sign-in' as never);
              }
            }}
            hitSlop={6}
            style={styles.tourBtn}>
            <ThemedText style={[styles.tourText, { color: Palette.textSecondary }]}>
              Already have an account?{' '}
              <ThemedText style={[styles.tourText, { color: C.tint }]}>Sign in</ThemedText>
            </ThemedText>
          </Pressable>
        ) : (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <ThemedText style={styles.dividerText}>new here?</ThemedText>
              <View style={styles.dividerLine} />
            </View>
            {ONBOARDING_FUNNEL_ENABLED && Platform.OS === 'web' ? (
              // Funnel era (boxed off — see constants/onboardingFunnel.ts):
              // cold visitors self-select into the value-first tour, and
              // people who already know the app skip straight to an account.
              <>
                <Button
                  label="Get started →"
                  variant="outline"
                  onPress={() => router.push('/onboarding' as never)}
                  fullWidth
                />
                <Pressable
                  onPress={() => setDirectSignup(true)}
                  hitSlop={6}
                  style={styles.tourBtn}>
                  <ThemedText style={[styles.tourText, { color: Palette.textSecondary }]}>
                    Know the app already?{' '}
                    <ThemedText style={[styles.tourText, { color: C.tint }]}>
                      Skip the tour and create an account
                    </ThemedText>
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              // The setup form is the one way in for new users, everywhere.
              <Button
                label="Create an account"
                variant="outline"
                onPress={() => setDirectSignup(true)}
                fullWidth
              />
            )}
          </>
        )}
      </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // The card centers in the viewport when short (login) and scrolls when tall
  // (direct signup with the instrument picker open on a phone).
  scroll: {
    flex: 1,
    alignSelf: 'stretch',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    gap: Spacing.lg,
  },
  instrumentSection: {
    gap: Spacing.xs,
  },
  instrumentLabel: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    textAlign: 'center',
  },
  instrumentHint: {
    marginTop: 0,
    marginBottom: Spacing.xs,
  },
  // One-line field that opens the instrument ActionSheet.
  instrumentField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  instrumentFieldText: {
    flex: 1,
  },
  instrumentRowText: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
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
