// Community social signals: private bookmarks + public upvotes for shared
// exercises. Talks to the web Supabase client (same as exercises.ts). All
// loads are best-effort — if the tables don't exist yet (migration not run),
// callers treat the result as empty so the screen still works.
//
// Tables (run db/community_social.sql in Supabase):
//   community_bookmarks(user_id, exercise_id)  — RLS owner-only (private)
//   community_votes(user_id, exercise_id)      — readable by all, owner writes

import { supabase } from '@/lib/supabase/client';

export async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** All vote rows → a per-exercise count map + the set the current user cast. */
export async function loadVotes(
  uid: string | null,
): Promise<{ counts: Record<string, number>; mine: Set<string> }> {
  const { data, error } = await supabase
    .from('community_votes')
    .select('exercise_id, user_id');
  if (error) throw error;
  const counts: Record<string, number> = {};
  const mine = new Set<string>();
  for (const r of (data ?? []) as { exercise_id: string; user_id: string }[]) {
    counts[r.exercise_id] = (counts[r.exercise_id] ?? 0) + 1;
    if (uid && r.user_id === uid) mine.add(r.exercise_id);
  }
  return { counts, mine };
}

/** The current user's bookmarked exercise ids (RLS returns only their own). */
export async function loadBookmarks(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('community_bookmarks')
    .select('exercise_id');
  if (error) throw error;
  return new Set(
    (data ?? []).map((r) => (r as { exercise_id: string }).exercise_id),
  );
}

export async function setBookmark(exerciseId: string, on: boolean): Promise<void> {
  if (on) {
    const { error } = await supabase
      .from('community_bookmarks')
      .insert({ exercise_id: exerciseId });
    // 23505 = unique violation (already bookmarked) — harmless.
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('community_bookmarks')
      .delete()
      .eq('exercise_id', exerciseId);
    if (error) throw error;
  }
}

export async function setVote(exerciseId: string, on: boolean): Promise<void> {
  if (on) {
    const { error } = await supabase
      .from('community_votes')
      .insert({ exercise_id: exerciseId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('community_votes')
      .delete()
      .eq('exercise_id', exerciseId);
    if (error) throw error;
  }
}
