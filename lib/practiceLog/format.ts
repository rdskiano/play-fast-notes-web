// Single source of truth for rendering practice-log entries.
//
// Four screens display the log — per-passage History, the library-wide log,
// the per-document log, and the per-folder log. They used to each keep their
// own copy of these helpers, which drifted: a fix in one screen silently
// missed the other three (e.g. the Tempo Ladder mode / Rep Rotator rename).
// Everything that turns a log entry into a label or detail string lives here
// now, so a change lands everywhere at once.
//
// Two detail styles:
//   - full    (per-passage History): the whole story on its own line —
//             "Custom · My 9+1 · 80 BPM · goal 120 · 2 sets",
//             "Rep Rotator session · with Mozart, Brahms · 65 BPM · 5/5 reps".
//   - compact (the three log screens): a short chip that sits after the
//             strategy label — "Step · 100 BPM", "100 BPM ✓".

export type PracticeLogLike = {
  strategy: string;
  data_json?: string | null;
};

export const STRATEGY_LABELS: Record<string, string> = {
  tempo_ladder: 'Tempo Ladder',
  click_up: 'Interleaved Click-Up',
  rhythmic: 'Rhythmic Variation',
  interleaved: 'Serial',
  chunking: 'Chunking',
  micro_chaining: 'Micro-Chaining',
  macro_chaining: 'Macro-Chaining',
  add_a_note: 'Add a Note',
  pitch: 'Pitch',
  phrasing: 'Phrasing',
  recording: 'Recording',
  freeform: 'Freeform',
};

// The display name for an entry's strategy. Interleaved is special: a
// random-order session is the renamed "Rep Rotator"; older fixed-order
// sessions stay "Serial". (The STRATEGY_LABELS['interleaved'] value is only a
// fallback that this branch never reaches.)
export function strategyLabel(entry: PracticeLogLike): string {
  if (entry.strategy === 'interleaved') {
    try {
      if (entry.data_json) {
        const data = JSON.parse(entry.data_json);
        if (data?.order === 'random') return 'Rep Rotator';
      }
    } catch {
      // ignore — fall through to default
    }
    return 'Serial';
  }
  return STRATEGY_LABELS[entry.strategy] ?? entry.strategy;
}

// Tempo Ladder mode prefix: "Custom · <pattern name>" when a saved pattern
// drove the session, else the capitalized mode word ("Step" / "Cluster").
// Null when no mode was recorded (very old entries).
function tempoLadderMode(data: Record<string, unknown>): string | null {
  if (data.mode === 'custom' && typeof data.patternName === 'string' && data.patternName) {
    return `Custom · ${data.patternName}`;
  }
  if (typeof data.mode === 'string' && data.mode) {
    return data.mode.charAt(0).toUpperCase() + data.mode.slice(1);
  }
  return null;
}

export function formatPracticeDetail(
  entry: PracticeLogLike,
  opts: { compact?: boolean } = {},
): string | null {
  if (!entry.data_json) return null;
  const compact = opts.compact ?? false;
  try {
    const data = JSON.parse(entry.data_json);

    if (entry.strategy === 'tempo_ladder') {
      const mode = tempoLadderMode(data);
      if (compact) {
        if (!data.tempo) return null;
        return mode ? `${mode} · ${data.tempo} BPM` : `${data.tempo} BPM`;
      }
      const parts: string[] = [];
      if (mode) parts.push(mode);
      if (data.tempo) parts.push(`${data.tempo} BPM`);
      if (data.goalTempo) parts.push(`goal ${data.goalTempo}`);
      if (typeof data.completedSets === 'number' && data.completedSets > 0) {
        parts.push(`${data.completedSets} ${data.completedSets === 1 ? 'set' : 'sets'}`);
      }
      return parts.join(' · ');
    }

    if (entry.strategy === 'click_up') {
      if (compact) {
        if (data.step != null && data.totalSteps) return `${data.step + 1}/${data.totalSteps}`;
        return null;
      }
      const parts: string[] = [];
      if (data.step != null && data.totalSteps)
        parts.push(`step ${data.step + 1}/${data.totalSteps}`);
      if (data.tempo) parts.push(`${data.tempo} BPM`);
      return parts.join(' · ');
    }

    if (entry.strategy === 'interleaved') {
      if (compact) {
        const parts: string[] = [];
        if (typeof data.tempo === 'number') parts.push(`${data.tempo} BPM`);
        if (data.completed) parts.push('✓');
        return parts.length > 0 ? parts.join(' ') : null;
      }
      const parts: string[] = ['Rep Rotator session'];
      // List the OTHER passages in the rotation so the user reading this
      // passage's log knows it was part of a group session and which group.
      // Trim to the first 3 names so the line doesn't blow out on a long
      // rotation.
      if (Array.isArray(data.sessionPassages) && data.sessionPassages.length > 0) {
        const names = data.sessionPassages.filter(
          (n: unknown): n is string => typeof n === 'string' && n.length > 0,
        );
        if (names.length > 0) {
          const shown = names.slice(0, 3).join(', ');
          const more = names.length > 3 ? ` +${names.length - 3} more` : '';
          parts.push(`with ${shown}${more}`);
        }
      }
      if (typeof data.tempo === 'number') parts.push(`${data.tempo} BPM`);
      if (data.completed) parts.push('completed ✓');
      else if (data.streak != null && data.targetReps) {
        parts.push(`${data.streak}/${data.targetReps} reps`);
      }
      return parts.join(' · ');
    }

    if (entry.strategy === 'recording' && typeof data.duration_seconds === 'number') {
      const m = Math.floor(data.duration_seconds / 60);
      const s = Math.floor(data.duration_seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    }
  } catch {
    // ignore
  }
  return null;
}
