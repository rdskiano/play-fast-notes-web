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
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/reset-password`
      : undefined;
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
