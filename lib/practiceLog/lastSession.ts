// "Pick up where you left off" — the passage screen's last-session row.
//
// Given the newest practice-log rows for a passage, pick the most recent one
// that represents a real, relaunchable practice session and map it to the
// route that resumes it. "Resume" mostly means "open the strategy screen":
// every strategy already reloads its own saved per-passage config on entry
// (exercises.config_json, tempo_ladder_progress, click_up_progress), so no
// settings need to travel through the log row itself. The exceptions that DO
// ride the URL:
//   - rhythmic: the grouping is a route param, not stored config. Newer rows
//     log data.grouping (rhythmic.tsx, 2026-09-13); older rows fall back to
//     grouping 4, same default the coach uses. Builder sessions reopen their
//     built exercise via exerciseId.
//   - micro_chaining: the mode card is pre-selected via ?mode=, same as a
//     resurfaced reminder's "Try ⟨mode⟩ chaining" button.
//   - interleaved / icu2: multi-passage rotations can't be rebuilt from the
//     log (sessionPassages holds titles, not ids), so relaunch seeds a fresh
//     rotation with this passage — Ralph's explicit call (2026-09-13).
//
// NOT relaunchable (skipped when picking): evaluation (a coach measurement,
// not a drill), recording (a capture), freeform journal/metronome entries
// (entryKind 'note' / 'metronome'), and the retired pitch/phrasing self-led
// keys whose screens no longer exist.

export type LastSessionEntry = {
  strategy: string;
  practiced_at: number;
  data_json: string | null;
  exercise_id: string | null;
};

export type LastSessionLaunch = {
  pathname: string;
  params: Record<string, string>;
};

function parseData(entry: LastSessionEntry): Record<string, unknown> | null {
  if (!entry.data_json) return null;
  try {
    const d = JSON.parse(entry.data_json);
    return d && typeof d === 'object' && !Array.isArray(d)
      ? (d as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function launchForEntry(
  entry: LastSessionEntry,
  passageId: string,
): LastSessionLaunch | null {
  const data = parseData(entry);
  switch (entry.strategy) {
    case 'tempo_ladder':
      return { pathname: '/passage/[id]/tempo-ladder', params: { id: passageId } };
    case 'click_up':
      return { pathname: '/passage/[id]/click-up', params: { id: passageId } };
    case 'micro_chaining': {
      const mode = data?.mode;
      const params: Record<string, string> = { id: passageId };
      if (mode === 'forward' || mode === 'backward' || mode === 'problem') {
        params.mode = mode;
      }
      return { pathname: '/passage/[id]/micro-chaining', params };
    }
    case 'macro_chaining':
      return { pathname: '/passage/[id]/macro-chaining', params: { id: passageId } };
    case 'chunking':
      return { pathname: '/passage/[id]/chunking', params: { id: passageId } };
    case 'add_a_note':
      return {
        pathname: '/passage/[id]/self-led/[key]',
        params: { id: passageId, key: 'add_a_note' },
      };
    case 'rhythmic': {
      if (data?.builder === true && entry.exercise_id) {
        return {
          pathname: '/passage/[id]/rhythm-builder',
          params: { id: passageId, exerciseId: entry.exercise_id },
        };
      }
      const g = data?.grouping;
      const grouping =
        typeof g === 'number' && g >= 3 && g <= 8 ? String(g) : '4';
      return {
        pathname: '/passage/[id]/rhythmic',
        params: { id: passageId, grouping },
      };
    }
    case 'interleaved':
      return { pathname: '/interleaved', params: { seedPassageId: passageId } };
    case 'icu2':
      return { pathname: '/icu2', params: { seedPassageId: passageId } };
    case 'freeform': {
      // Journal notes and after-metronome offers aren't sessions to repeat;
      // only the old Self-Led "Freeform / Other" screen (unstamped) is.
      const kind = data?.entryKind;
      if (kind === 'note' || kind === 'metronome') return null;
      return {
        pathname: '/passage/[id]/self-led/[key]',
        params: { id: passageId, key: 'freeform' },
      };
    }
    default:
      // evaluation, recording, retired pitch/phrasing, unknown future keys.
      return null;
  }
}

// Newest entry that can actually be relaunched. `entries` must already be
// sorted newest-first (getRecentPracticeEntries guarantees it).
export function pickLastSession<T extends LastSessionEntry>(
  entries: T[],
  passageId: string,
): T | null {
  for (const e of entries) {
    if (launchForEntry(e, passageId)) return e;
  }
  return null;
}
