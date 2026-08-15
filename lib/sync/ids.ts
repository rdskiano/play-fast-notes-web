// Client-minted, globally-unique sync id for practice_log rows. Matches the
// id style used across the app (`f_...`, `d_...`) and lands in the cloud's
// practice_log.client_id column, which has a unique index — the cross-device
// identity for a practice session. Platform-neutral (no native imports).
export function newPracticeSyncId(): string {
  return `lg_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}
