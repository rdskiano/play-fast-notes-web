// The free plan's "swap this one in" operation (lock-don't-lose, user-chosen
// keepers). Given the passage the user wants to unlock and the free-slot
// passage they picked to bench, rewrite kept_at marks so the free set is
// exactly the three they now want.
//
// The subtlety: a user who never swapped has NO kept_at marks — their free
// three come from the oldest-first fallback. If we only marked the new keeper,
// the benched passage could slide right back into a free slot via that
// fallback. So the first swap MATERIALIZES the surviving free passages as
// explicit keepers too; after any swap the free set is fully user-chosen
// (exactly FREE_PASSAGE_LIMIT kept_at marks, or fewer if the library is small).
//
// Platform-resolved repo import: SQLite on iOS (the UPDATE trigger queues the
// rows for sync), Supabase on web.

import { setPassageKept } from '@/lib/db/repos/passages';

export async function swapKeep(args: {
  /** The locked passage being swapped IN (becomes free). */
  keepId: string;
  /** The currently-free passage being benched (becomes locked). */
  benchId: string;
  /** The free slots as computeLocks ranked them, in slot order. */
  currentFreeIds: string[];
}): Promise<void> {
  const { keepId, benchId, currentFreeIds } = args;
  const base = Date.now();
  // Survivors keep their slot order; the swapped-in passage takes the last
  // slot. kept_at values only need a stable relative order, not exact times.
  const survivors = currentFreeIds.filter((id) => id !== benchId && id !== keepId);
  for (let i = 0; i < survivors.length; i++) {
    await setPassageKept(survivors[i], base + i);
  }
  await setPassageKept(benchId, null);
  await setPassageKept(keepId, base + survivors.length);
}
