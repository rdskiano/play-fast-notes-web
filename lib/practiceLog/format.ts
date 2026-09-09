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

import { noteName } from '@/lib/audio/noteNames';

export type PracticeLogLike = {
  strategy: string;
  data_json?: string | null;
};

export const STRATEGY_LABELS: Record<string, string> = {
  tempo_ladder: 'Tempo Ladder',
  click_up: 'Interleaved Click-Up',
  rhythmic: 'Rhythmic Variation',
  interleaved: 'Serial',
  icu2: 'Interleaved Click-Up 2',
  chunking: 'Chunking',
  micro_chaining: 'Micro-Chaining',
  macro_chaining: 'Macro-Chaining',
  add_a_note: 'Add a Note',
  pitch: 'Pitch',
  phrasing: 'Phrasing',
  recording: 'Recording',
  freeform: 'Freeform',
  evaluation: 'Evaluation',
};

// The display name for an entry's strategy. Interleaved is special: a
// random-order session is the renamed "Rep Rotator"; older fixed-order
// sessions stay "Serial". (The STRATEGY_LABELS['interleaved'] value is only a
// fallback that this branch never reaches.)
//
// 'freeform' is special too (Ralph, 2026-09-09: the raw word "Freeform" in
// the log described nothing). Three different flows share the strategy key,
// told apart by an `entryKind` stamp in data_json:
//   - 'metronome' — the after-metronome offer ("Would you like to log
//     anything?"): unguided practice with the click on whatever the row is
//     attached to. Labeled "Metronome practice".
//   - 'note' — the "Add an entry" journal paragraph. Labeled "Practice note".
//   - unstamped — rows from before 2026-09-09 and the old Self-Led
//     "Freeform / Other" option keep the historical "Freeform" label.
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
  if (entry.strategy === 'freeform') {
    try {
      if (entry.data_json) {
        const data = JSON.parse(entry.data_json);
        if (data?.entryKind === 'metronome') return 'Metronome practice';
        if (data?.entryKind === 'note') return 'Practice note';
      }
    } catch {
      // ignore — fall through to default
    }
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
    const main = strategyDetail(entry.strategy, data, compact);
    // Drone stamped by logPractice (droneMidi) rides every strategy's line,
    // including ones with no branch above — a chunking session with a drone
    // still shows "drone on A4".
    const drone =
      typeof data.droneMidi === 'number'
        ? compact
          ? `drone ${noteName(data.droneMidi)}`
          : `drone on ${noteName(data.droneMidi)}`
        : null;
    if (main && drone) return `${main} · ${drone}`;
    return main ?? drone;
  } catch {
    // ignore
  }
  return null;
}

// The per-strategy portion of the detail line (everything except the drone
// suffix). Strategies without a branch return null.
function strategyDetail(
  strategy: string,
  data: Record<string, any>,
  compact: boolean,
): string | null {
  if (strategy === 'tempo_ladder') {
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

  if (strategy === 'evaluation') {
    // First-practice measurements: {goal, probeClean, tempo?, clean?, misses?}.
    if (data.probeClean) {
      return compact
        ? `${data.goal} ✓`
        : `probed at ${data.goal} BPM — clean, performance-ready`;
    }
    const parts: string[] = [];
    if (data.clean) parts.push(compact ? `clean ${data.clean}` : `clean at ${data.clean} BPM`);
    if (data.goal) parts.push(`goal ${data.goal}`);
    return parts.length ? parts.join(' · ') : null;
  }

  if (strategy === 'click_up') {
    if (compact) {
      // Direction rides the compact chip too — the document and library
      // logs showed a bare "Interleaved Click-Up" while only the passage
      // view said "forward, then back" (Ralph's verification pass).
      const dir =
        typeof data.passes === 'number' && data.passes > 1
          ? data.passes === 2
            ? 'forward, then back'
            : `${data.passes} passes`
          : data.direction === 'backward'
            ? 'backward'
            : null;
      const step =
        data.step != null && data.totalSteps
          ? `${data.step + 1}/${data.totalSteps}`
          : null;
      if (step && dir) return `${step} · ${dir}`;
      return step ?? dir;
    }
    const parts: string[] = [];
    if (data.step != null && data.totalSteps)
      parts.push(`step ${data.step + 1}/${data.totalSteps}`);
    if (data.tempo) parts.push(`${data.tempo} BPM`);
    // Direction (beta): a forward-then-reverse sitting logs passes: 2;
    // a single backward climb logs direction: 'backward'. Spell the
    // common case out in player language — a bare "2 passes" made its
    // own author guess what it meant a day later (D72).
    if (typeof data.passes === 'number' && data.passes > 1) {
      parts.push(
        data.passes === 2
          ? 'forward, then back'
          : `${data.passes} passes, alternating direction`,
      );
    } else if (data.direction === 'backward') {
      parts.push('backward');
    }
    return parts.join(' · ');
  }

  if (strategy === 'interleaved') {
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

  if (strategy === 'icu2') {
    // {goal, start, reached, atTempo, sessionPassages?, mode?, climbBy?}
    if (compact) {
      if (typeof data.reached !== 'number') return null;
      return data.atTempo ? `${data.reached} BPM ✓` : `saved at ${data.reached}`;
    }
    const parts: string[] = [];
    if (data.mode === 'together') parts.push('step together');
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
    if (typeof data.goal === 'number') parts.push(`goal ${data.goal}`);
    if (typeof data.reached === 'number') {
      parts.push(data.atTempo ? `reached ${data.reached} ✓` : `saved at ${data.reached}`);
    }
    return parts.length ? parts.join(' · ') : null;
  }

  if (strategy === 'recording' && typeof data.duration_seconds === 'number') {
    const m = Math.floor(data.duration_seconds / 60);
    const s = Math.floor(data.duration_seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // After-metronome entries carry the session clock's duration stamp — the
  // one place durationMs is rendered, because here the row IS the whole
  // sitting (no other rows to double-count against).
  if (
    strategy === 'freeform' &&
    data.entryKind === 'metronome' &&
    typeof data.durationMs === 'number' &&
    data.durationMs > 0
  ) {
    const mins = Math.round(data.durationMs / 60000);
    if (compact) return mins < 1 ? 'under a minute' : `${mins} min`;
    return mins < 1
      ? 'under a minute with the metronome'
      : `${mins} min with the metronome`;
  }
  return null;
}
