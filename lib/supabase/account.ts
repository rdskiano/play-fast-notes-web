// Account utilities.
//
// Two related operations:
//   - wipeUserData()   — "start over" without losing your login. Clears every
//                        user-scoped table row and storage file, but keeps the
//                        auth.users row so the email still signs in.
//   - deleteAccount()  — permanently removes the account itself, including the
//                        login/email. Required by Apple App Store guideline
//                        5.1.1(v) for any app that offers account creation.
//
// The schema FKs all use `references auth.users(id) on delete cascade`, so
// deleting the auth user (done server-side in the `delete-account` Edge
// Function, which holds the service-role key) cascades every row automatically.

import { signOut } from './auth';
import { supabase } from './client';

// User-scoped tables that the wipe should clear. Order matters where FKs
// constrain children; delete children first.
const TABLES = [
  'practice_log',
  'tempo_ladder_progress',
  'click_up_progress',
  'strategy_last_used',
  'exercises',
  'pieces',
  'documents',
  'folders',
  'settings',
];

// Storage buckets that scope objects under <userId>/<thing>.<ext>.
const BUCKETS = ['pieces', 'recordings'];

export async function wipeUserData(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  for (const t of TABLES) {
    // RLS already restricts deletes to the current user. The .eq filter
    // on user_id is redundant but explicit and defends against any future
    // table that forgets RLS.
    const { error } = await supabase.from(t).delete().eq('user_id', userId);
    if (error && !error.message.toLowerCase().includes('does not exist')) {
      // Surface non-missing-table errors but keep going.
      console.warn(`[wipeUserData] ${t}:`, error.message);
    }
  }

  for (const bucket of BUCKETS) {
    try {
      const { data: files } = await supabase.storage.from(bucket).list(userId);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        const { error } = await supabase.storage.from(bucket).remove(paths);
        if (error) console.warn(`[wipeUserData] ${bucket}:`, error.message);
      }
    } catch (e) {
      console.warn(`[wipeUserData] ${bucket} list failed:`, e);
    }
  }

  await signOut();
}

// Permanently delete the signed-in user's account: storage files, every
// user-scoped row (via the auth.users cascade), and the login itself. The
// privileged deletes run in the `delete-account` Edge Function — the service
// role key can't ship in the client. We sign out locally afterward so the now
// dead session is cleared and the user lands on the sign-in screen.
export async function deleteAccount(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error('Not signed in');

  const { error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });
  if (error) {
    throw new Error(`Account deletion failed: ${error.message}`);
  }

  // The account is gone server-side; clear the local session too. If sign-out
  // itself errors (e.g. the token is already invalid), that's fine — the
  // account is deleted regardless, so don't surface it as a failure.
  try {
    await signOut();
  } catch (e) {
    console.warn('[deleteAccount] post-delete sign-out failed (ignored):', e);
  }
}
