// The trail-driven coach — one suggestion, read from the practice history.
//
// This replaces the questionnaire in engine.ts as the coach's face. The
// August practice-log sessions (COACH_SIGNAL_LOG.md) showed the questionnaire
// is memoryless: the same self-report answers on day one and day two produced
// the same advice, but the right answer had changed — and the thing that
// changed was the TRAIL (five blocked ladder stints, progress banked), which
// the app already had. So the coach now reads the trail and says one thing.
//
// Deliberately small: only rules validated by observed practice are here.
//   1. Never practiced → route to the first-practice evaluation instead of
//      guessing (marking stays cheap; measurement fires on first practice).
//   2. At goal tempo → Rep Rotator (maintenance — the perform end of the arc).
//   3. Two-plus ladder sessions, no Interleaved Click-Up yet → suggest ICU
//      ("the notes are in — cement them with interference"). This is D15/D17:
//      the user's own day-two move, made a rule.
//   4. Anything else → pick up where you left off (the last tool, with its
//      resume numbers when we have them). Honest, never wrong, never pushy.
//
// Deliberately NOT here yet: Rhythmic Variation suggestions (they need the
// one-time rhythm question first — build it when this rule earns its way in),
// the ~70% ladder→ICU threshold, and the long-passage exception. Those are
// pedagogy calls still awaiting real-use votes.

import type { PracticeLogEntry } from '@/lib/db/repos/practiceLog';
import { STRATEGY_TO_TOOL, type ToolKey } from './engine';

// Full tool names for the card. (engine.ts's TOOL_NAME says "ICU"; the chip
// spec from mock-up night says buttons use the exact tool name, so the card
// keeps its own map.)
export const CARD_TOOL_NAME: Record<ToolKey, string> = {
  ladder: 'Tempo Ladder',
  icu: 'Interleaved Click-Up',
  rep: 'Rep Rotator',
  rv: 'Rhythmic Variation',
  micro: 'Micro-Chaining',
  macro: 'Macro-Chaining',
};

export type LadderSnapshot = { current: number; goal: number } | null;

export type CoachCard =
  | { kind: 'evaluate' }
  | { kind: 'tool'; tool: ToolKey; title: string; why: string };

const COUNT_WORD = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
function countWord(n: number): string {
  return COUNT_WORD[n] ?? String(n);
}

export function suggestFromTrail(
  entries: PracticeLogEntry[],
  ladder: LadderSnapshot,
): CoachCard {
  const counts: Record<ToolKey, number> = { ladder: 0, icu: 0, rep: 0, rv: 0, micro: 0, macro: 0 };
  let lastTool: ToolKey | null = null;
  // Repo returns entries sorted most-recent first.
  for (const e of entries) {
    const tool = STRATEGY_TO_TOOL[e.strategy];
    if (!tool) continue;
    counts[tool] += 1;
    if (lastTool === null) lastTool = tool;
  }
  const total = counts.ladder + counts.icu + counts.rep + counts.rv + counts.micro + counts.macro;

  // 1. No trail at all (an 'evaluation' entry alone still counts as a trail —
  //    the measurements exist, so the coach can speak to what they showed).
  const evaluation = entries.find((e) => e.strategy === 'evaluation');
  if (total === 0 && !evaluation) return { kind: 'evaluate' };
  if (total === 0 && evaluation) {
    let evalData: Record<string, unknown> | null = null;
    try {
      evalData = evaluation.data_json ? JSON.parse(evaluation.data_json) : null;
    } catch {
      evalData = null;
    }
    if (evalData?.probeClean === true) {
      // The probe at goal was clean — nothing to build. Maintenance only.
      const goal = typeof evalData.goal === 'number' ? ` at ${evalData.goal}` : '';
      return {
        kind: 'tool',
        tool: 'rep',
        title: CARD_TOOL_NAME.rep,
        why: `Your first try${goal} was clean — there's nothing to build here. When you want to keep it fresh, run it cold, rotated in with your other spots.`,
      };
    }
    // Measured but no tool session yet — point back at the ladder the
    // evaluation set up.
    return {
      kind: 'tool',
      tool: 'ladder',
      title: CARD_TOOL_NAME.ladder,
      why: ladder
        ? `Your measurements are in — the ladder is set up and waiting, heading for ${ladder.goal}.`
        : 'Your measurements are in — the ladder is set up from them and waiting.',
    };
  }

  // 2. At goal → maintenance.
  if (ladder && ladder.goal > 0 && ladder.current >= ladder.goal) {
    return {
      kind: 'tool',
      tool: 'rep',
      title: CARD_TOOL_NAME.rep,
      why: `You've had this at ${ladder.goal} — the hard part's done. Keep it performance-ready by running it cold, rotated in with your other spots.`,
    };
  }

  // 3. Blocked ladder work with no interference yet → cement with ICU.
  if (counts.ladder >= 2 && counts.icu === 0) {
    const stints = `${countWord(counts.ladder).toLowerCase()} steady ladder ${counts.ladder === 1 ? 'stint' : 'stints'}`;
    return {
      kind: 'tool',
      tool: 'icu',
      title: CARD_TOOL_NAME.icu,
      why: ladder
        ? `${countWord(counts.ladder)} steady ladder stints banked you at ${ladder.current} — the notes are in. Time to cement them with some interference: varied tempos, varied starting points.`
        : `You've put in ${stints} — the notes are going in. Time to cement them with some interference: varied tempos, varied starting points.`,
    };
  }

  // 4. Pick up where you left off.
  const tool = lastTool ?? 'ladder';
  let why: string;
  if (tool === 'ladder' && ladder) {
    why = `Last time you were climbing — you're at ${ladder.current}, heading for ${ladder.goal}. Pick the ladder back up where it left off.`;
  } else if (tool === 'icu') {
    why = 'Interleaved Click-Up is what got this solid last time — another pass keeps tightening it.';
  } else {
    why = `You worked this with ${CARD_TOOL_NAME[tool]} last time — picking it back up is a solid plan for today.`;
  }
  return { kind: 'tool', tool, title: CARD_TOOL_NAME[tool], why };
}
