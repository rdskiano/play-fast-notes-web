// Account utilities for the testing phase.
//
// Self-service "wipe my data" for testers who want to start over without
// asking for help. Removes everything they own that the schema scopes to
// auth.uid(): rows in user-scoped tables, plus files in the per-user
// folders of the pieces and recordings storage buckets. The auth.users
// row itself is left in place — fully removing the email requires a
// service-role admin call which can only run server-side, so for now
// "fully delete my account" is a manual step (email rdskiano@gmail.com).
//
// The schema FKs all use `references auth.users(id) on delete cascade`,
// so once a future delete-account Edge Function lands the cascade will
// take care of every row automatically.

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
