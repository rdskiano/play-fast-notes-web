import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

import { resetForSignOut } from '@/lib/sessions/serialPractice';

import { supabase } from './client';

/**
 * Sign in OR sign up with the same email/password. Tries sign-in first;
 * if no account exists, falls through to sign-up (which creates the account
 * and signs the user in immediately — assumes Supabase email confirmation
 * is disabled).
 *
 * Throws a friendly Error on failure (incorrect password, weak password, etc.).
 */
export async function continueWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const trimmedEmail = email.trim();

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });
  if (!signInError) return;

  // Sign-in failed — try creating an account with these credentials.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
  });
  if (!signUpError) {
    // Sign-up succeeded. If a session is set, we're signed in.
    if (signUpData.session) return;
    // No session = Supabase is requiring email confirmation. Tell the user.
    throw new Error(
      'Account created but email confirmation is required. Disable "Confirm email" in Supabase Auth -> Providers -> Email and try again.',
    );
  }

  // Both failed. Most common cause: account exists, password is wrong.
  const msg = (signUpError.message ?? '').toLowerCase();
  if (msg.includes('already') || msg.includes('registered')) {
    throw new Error(
      'That email already has an account. Either use the password you set last time, or delete this user in Supabase -> Authentication -> Users and sign up again.',
    );
  }
  throw signUpError;
}

/**
 * Sign in an EXISTING account ONLY — never creates one. The default sign-in
 * screen uses this; new users create their account via the setup form
 * (signUpWithProfile). Supabase doesn't reveal whether the failure was "no
 * account" vs "wrong password" (by design), so the error nudges toward both.
 */
export async function signInOnly(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    throw new Error(
      'We couldn’t sign you in. Double-check your email and password, or create an account below if you’re new.',
    );
  }
}

export type SignUpProfile = { name: string; instrument: string };
export type SignUpResult =
  /** Account created and signed in (email confirmation is off). */
  | { kind: 'signed-in' }
  /** Account created; Supabase sent a confirmation email and there is no
   *  session until the user clicks it. */
  | { kind: 'confirm-email' };

/**
 * Create an account from the setup form. Name + instrument ride along as auth
 * user metadata so they survive the email-confirmation gap (the user may even
 * confirm on a different device) — applySignupProfile() copies the instrument
 * into settings on the first signed-in load.
 *
 * Handles both Supabase configurations: with "Confirm email" off the user is
 * signed in immediately; with it on we report confirm-email so the screen can
 * show "check your inbox". Throws a friendly Error otherwise.
 */
export async function signUpWithProfile(
  email: string,
  password: string,
  profile: SignUpProfile,
): Promise<SignUpResult> {
  const trimmedEmail = email.trim();
  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: {
        full_name: profile.name.trim(),
        instrument: profile.instrument,
      },
    },
  });

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (msg.includes('already') || msg.includes('registered')) {
      // The email has an account. Maybe they forgot — try their password
      // before bouncing them, so an existing user who lands on the setup
      // form still gets in.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (!signInError) return { kind: 'signed-in' };
      throw new Error(
        'That email already has an account. Tap "Sign in" below and use the password you set before (or "Forgot password?" if it\'s lost).',
      );
    }
    throw error;
  }

  if (data.session) return { kind: 'signed-in' };

  // No session + no error. With email confirmation ON, Supabase also lands
  // here for an email that ALREADY has a confirmed account (it hides the
  // difference on purpose); such users get an empty identities list.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    throw new Error(
      'That email already has an account. Tap "Sign in" below and use the password you set before (or "Forgot password?" if it\'s lost).',
    );
  }
  return { kind: 'confirm-email' };
}

/** Re-send the signup confirmation email. */
export async function resendConfirmationEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Send a password-reset email. Supabase generates a one-time recovery link
 * that lands the user back on /reset-password with a recovery token in the
 * URL hash. The reset-password screen consumes that hash automatically and
 * lets the user set a new password.
 *
 * The redirectTo URL must be on the Supabase project's allow list:
 * Dashboard -> Authentication -> URL Configuration -> Redirect URLs.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const trimmedEmail = email.trim();
  // React Native defines a global `window` WITHOUT `location`, so a bare
  // typeof-window check passes and then `.origin` crashes. In the app, the
  // emailed link should open the WEB reset page — the app can't consume a
  // recovery URL anyway.
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://playfastnotes.com';
  const redirectTo = `${origin}/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
    redirectTo,
  });
  if (error) throw error;
}

/**
 * Apply a new password during a recovery session. The Supabase client picks
 * up the recovery token from the URL hash on /reset-password and creates a
 * temporary session; this call swaps in the new password and finalises the
 * sign-in.
 */
export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export type SessionState = Session | null | undefined;

/**
 * Returns the current Supabase session.
 * - `undefined` while loading the initial session
 * - `null` when the user is signed out
 * - `Session` when signed in
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<SessionState>(undefined);
  // Track the previous session so we only fire the sign-out cleanup on a
  // true transition (something → null), not on initial mount where session
  // starts as undefined.
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        prevUserIdRef.current = data.session?.user.id ?? null;
        setSession(data.session);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      const prev = prevUserIdRef.current;
      const next = s?.user.id ?? null;
      // Sign-out OR user switch: clear the Serial Practice singleton so
      // the next session doesn't inherit timers, listeners, or state from
      // the previous user. See resetForSignOut() docstring for details.
      if (prev && prev !== next) {
        resetForSignOut();
      }
      prevUserIdRef.current = next;
      setSession(s);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return session;
}
