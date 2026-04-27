import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

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
  const { error: signUpError } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
  });
  if (!signUpError) return;

  // Both failed. Most common cause: account exists, password is wrong.
  const msg = (signUpError.message ?? '').toLowerCase();
  if (msg.includes('already') || msg.includes('registered')) {
    throw new Error('That email already has an account. Check your password and try again.');
  }
  throw signUpError;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
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

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (mounted) setSession(s);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return session;
}
