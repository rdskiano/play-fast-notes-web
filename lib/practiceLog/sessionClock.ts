// Silent practice-session timing. Each practice screen marks the clock when
// it mounts; logPractice stamps the elapsed time into the row's data_json as
// `durationMs`. Nothing in the UI reads the value yet — it accumulates so a
// future "this session takes about N minutes" estimate has real data behind
// it. Platform-agnostic module state: one clock per JS runtime is enough
// because only one practice screen is ever in front.
//
// Multi-passage strategies (Interleaved, Rep Rotator, ICU) write one row per
// passage in a single burst at session end, so the duration is PEEKED, not
// consumed: every row of the burst carries the same whole-session duration,
// and the existing sessionPassages key identifies the batch. Analysis must
// therefore treat durationMs as session-level, never sum it across rows.

let startedAt: number | null = null;

// Anything longer than this means the screen sat abandoned (laptop lid shut
// overnight, forgotten tab) — record nothing rather than garbage.
const MAX_DURATION_MS = 6 * 60 * 60 * 1000;

export function markPracticeStart(): void {
  startedAt = Date.now();
}

export function peekPracticeDurationMs(): number | null {
  if (startedAt == null) return null;
  const ms = Date.now() - startedAt;
  if (ms < 1000 || ms > MAX_DURATION_MS) return null;
  return ms;
}
