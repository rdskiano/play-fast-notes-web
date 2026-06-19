// Per-piece practice coach — pure routing logic.
//
// The coach reads a piece's practice history, asks 1–2 fixed diagnostic
// questions, and routes to one of the six BUILT tools with a short, plain-
// language "why". Curated + deterministic — no LLM, no dialogue. See
// COACHING_MODE_PLAN.md for the full design.
//
// This module is UI-free and platform-free so it can be unit-tested and reused
// by app/passage/[id]/coach.tsx. The screen does the async fetching and passes
// already-loaded data in.

import type { PracticeLogEntry } from '@/lib/db/repos/practiceLog';

export type ToolKey = 'ladder' | 'icu' | 'rep' | 'rv' | 'micro' | 'macro';

export const TOOL_NAME: Record<ToolKey, string> = {
  ladder: 'Tempo Ladder',
  icu: 'ICU',
  rep: 'Rep Rotator',
  rv: 'Rhythm Variations',
  micro: 'Micro-chaining',
  macro: 'Macro-chaining',
};

// practice_log.strategy string → our tool key. (These are the values the
// strategy screens actually write: Rep Rotator still logs 'interleaved'.)
const STRATEGY_TO_TOOL: Record<string, ToolKey> = {
  tempo_ladder: 'ladder',
  click_up: 'icu',
  interleaved: 'rep',
  rhythmic: 'rv',
  micro_chaining: 'micro',
  macro_chaining: 'macro',
};

// Route segment under /passage/[id]/ for a guided launch. 'rep' is special
// (Rep Rotator lives at /interleaved, seeded with the passage) — handled by the
// screen, so it's not in this map.
export const TOOL_ROUTE: Record<Exclude<ToolKey, 'rep'>, string> = {
  ladder: 'tempo-ladder',
  icu: 'click-up',
  rv: 'rhythmic',
  micro: 'micro-chaining',
  macro: 'macro-chaining',
};

// ── The fixed question tree (verbatim wording) ──────────────────────────────

export type ChallengeKey = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

export const CHALLENGES: { key: ChallengeKey; label: string }[] = [
  { key: 'a', label: 'I can’t get it up to speed' },
  { key: 'b', label: 'It’s uneven or lumpy when I speed up' },
  { key: 'c', label: 'One spot keeps falling apart' },
  { key: 'd', label: 'I can play it, but not reliably' },
  { key: 'e', label: 'I’m having trouble coordinating things' },
  { key: 'f', label: 'I’m not sure — let me play it first' },
];

export type FollowOption = { value: string; label: string };

// Challenges with a follow-up question. 'e' (coordination) goes straight to a
// recommendation; the screen skips a follow-up for it.
export const FOLLOWUPS: Record<string, { q: string; options: FollowOption[] }> = {
  a: {
    q: 'When you push the tempo, does it feel like —',
    options: [
      { value: 'same', label: 'the same motion, just needs to be faster' },
      { value: 'diff', label: 'a different motion once it gets fast' },
    ],
  },
  b: {
    q: 'Is it lumpy all the way through, or just one stretch?',
    options: [
      { value: 'all', label: 'pretty much throughout' },
      { value: 'one', label: 'mainly one stretch' },
    ],
  },
  c: {
    q: 'Where in the passage is the rough spot?',
    options: [
      { value: 'beg', label: 'near the beginning' },
      { value: 'mid', label: 'in the middle' },
      { value: 'end', label: 'near the end' },
    ],
  },
  d: {
    q: 'Is it more that —',
    options: [
      { value: 'self', label: 'it’s shaky even on its own, day to day' },
      { value: 'perf', label: 'it’s fine alone, but falls apart when it counts' },
    ],
  },
  f: {
    q: 'Play it once at your goal tempo. What happened?',
    options: [
      { value: 'crash', label: 'I crashed at one spot' },
      { value: 'away', label: 'it ran away from me' },
      { value: 'mess', label: 'notes were there but messy and uneven' },
      { value: 'rand', label: 'it fell apart in random places' },
      { value: 'fine', label: 'honestly… it was fine' },
    ],
  },
};

// ⓕ "I'm not sure" outcomes re-route into the matching branch.
export const FOLLOW_REROUTE: Record<string, ChallengeKey | 'maint'> = {
  crash: 'c',
  away: 'a',
  mess: 'b',
  rand: 'd',
  fine: 'maint',
};

// ── The silent read ─────────────────────────────────────────────────────────

export type HistorySummary = {
  usage: Record<ToolKey, number>; // 0 = never, 1 = some, 2 = a lot
  lastTool: ToolKey | null; // most recent logged tool on this piece
  stalled: boolean; // tempo ladder not advancing across recent sessions
  triedCount: number; // how many distinct tools have been used
};

export function summarizeHistory(entries: PracticeLogEntry[]): HistorySummary {
  const counts: Record<ToolKey, number> = { ladder: 0, icu: 0, rep: 0, rv: 0, micro: 0, macro: 0 };
  let lastTool: ToolKey | null = null;
  const ladderTempos: number[] = []; // most-recent first

  // Repo returns entries sorted by practiced_at descending.
  for (const e of entries) {
    const tool = STRATEGY_TO_TOOL[e.strategy];
    if (!tool) continue;
    counts[tool] += 1;
    if (lastTool === null) lastTool = tool;
    if (tool === 'ladder' && e.data_json) {
      try {
        const d = JSON.parse(e.data_json) as { tempo?: unknown };
        if (typeof d.tempo === 'number') ladderTempos.push(d.tempo);
      } catch {
        // skip corrupt row
      }
    }
  }

  const usage: Record<ToolKey, number> = { ladder: 0, icu: 0, rep: 0, rv: 0, micro: 0, macro: 0 };
  (Object.keys(counts) as ToolKey[]).forEach((k) => {
    usage[k] = counts[k] >= 3 ? 2 : counts[k] >= 1 ? 1 : 0;
  });

  // Plateau: 3+ recent ladder sessions with no tempo gain (latest ≤ 3-ago).
  let stalled = false;
  if (ladderTempos.length >= 3 && ladderTempos[0] <= ladderTempos[2]) stalled = true;

  const triedCount = (Object.keys(counts) as ToolKey[]).filter((k) => counts[k] >= 1).length;
  return { usage, lastTool, stalled, triedCount };
}

// ── The recommendation ──────────────────────────────────────────────────────

export type Recommendation = {
  lead: string; // affirm what they've done + name the situation
  call: string; // the method sentence(s)
  startTool: ToolKey | null; // primary "Start <tool>" button (null = no built tool)
  escape?: string; // "Not quite? → …" line
};

const DONE_PHRASE: Record<ToolKey, (usage: number) => string> = {
  ladder: () => 'taken it up to speed with Tempo Ladder',
  icu: (u) => (u >= 2 ? 'worked it through with ICU' : 'started in on ICU'),
  rep: () => 'practiced performing it with Rep Rotator',
  rv: () => 'evened it out with Rhythm Variations',
  micro: () => 'isolated spots with Micro-chaining',
  macro: () => 'worked it in chunks with Macro-chaining',
};

function affirm(h: HistorySummary): string {
  const order: ToolKey[] = ['ladder', 'icu', 'rep', 'rv', 'micro', 'macro'];
  const done = order.filter((k) => h.usage[k] >= 1).map((k) => DONE_PHRASE[k](h.usage[k]));
  if (done.length === 0) return 'Since this one’s still new, let’s start at the foundation.';
  const list =
    done.length === 1 ? done[0] : done.slice(0, -1).join(', ') + ' and ' + done[done.length - 1];
  return 'You’ve already ' + list + '.';
}

function conn(h: HistorySummary, base: ToolKey, name: string, method: string): string {
  const used = h.usage[base] >= 1;
  return (used ? 'Pick ‘' + name + '’ back up — ' : 'This one’s called ' + name + ' — ') + method + '.';
}

export type CoachInput = {
  challenge: ChallengeKey;
  follow?: string; // the follow-up answer value (undefined for 'e')
  history: HistorySummary;
  dueWeeks: number | null; // weeks until due; null = no date set
  special?: 'maint';
};

export function recommend(input: CoachInput): Recommendation {
  const { challenge, follow, history: h, dueWeeks, special } = input;

  if (special === 'maint') {
    return {
      lead: 'Sounds like it’s basically there — nice.',
      call: conn(h, 'rep', 'Rep Rotator', 'cement it by running it cold, rotated in with your other pieces'),
      startTool: 'rep',
    };
  }

  // Floor: tried a lot of tools and stuck → rebuild in chunks, keep ICU going.
  if (h.triedCount >= 4 && h.stalled) {
    let call = conn(h, 'macro', 'Macro-chaining', 'break it back down and rebuild the hardest bit in chunks at tempo');
    if (h.usage.icu >= 1) call += ' Keep your ICU going right alongside it.';
    return {
      lead: 'You’ve put a lot into this one — so let’s change the angle.',
      call,
      startTool: 'macro',
    };
  }

  // ⓐ can't get up to speed
  if (challenge === 'a') {
    const situation = 'Since speed is the holdup,';
    if (follow === 'diff') {
      const call = conn(h, 'macro', 'Macro-chaining', 'break it into chunks and chain them at tempo, shrinking the gaps between');
      return { lead: `${affirm(h)} ${situation}`, call: dueTriage(call, 'macro', dueWeeks), startTool: 'macro' };
    }
    if (h.usage.ladder >= 2 || h.stalled) {
      return {
        lead: `${affirm(h)} ${situation}`,
        call: conn(h, 'icu', 'ICU', 'mix up the tempos and starting points so it breaks through the ceiling'),
        startTool: 'icu',
      };
    }
    const call = conn(h, 'ladder', 'Tempo Ladder', 'pick a tempo you can nail cleanly and climb from there');
    return { lead: `${affirm(h)} ${situation}`, call: dueTriage(call, 'ladder', dueWeeks), startTool: 'ladder' };
  }

  // ⓑ uneven / lumpy
  if (challenge === 'b') {
    const method =
      follow === 'one'
        ? 'run just that stretch through different rhythms until it evens out'
        : 'play it in shifting rhythm patterns until it comes out even';
    return {
      lead: `${affirm(h)} Since the rhythm’s getting away from you,`,
      call: conn(h, 'rv', 'Rhythm Variations', method),
      startTool: 'rv',
    };
  }

  // ⓒ one spot
  if (challenge === 'c') {
    const method =
      follow === 'beg'
        ? 'start at the front of the spot and add one note at a time'
        : follow === 'end'
          ? 'start at the end of the spot and work backward into it'
          : 'start right in the problem area and build outward in both directions';
    return {
      lead: `${affirm(h)} Since the trouble’s just in one spot, let’s zoom in.`,
      call: conn(h, 'micro', 'Micro-chaining', method),
      startTool: 'micro',
      escape:
        'Not quite? If that spot’s more uneven than fumbled, try Rhythm Variations on it instead.',
    };
  }

  // ⓓ not reliably — ICU ⇄ Rep Rotator rotation by recency
  if (challenge === 'd') {
    const lead = `${affirm(h)} Since it’s not always there yet,`;
    const didICU = h.usage.icu >= 1;
    const didRR = h.usage.rep >= 1;
    let call: string;
    let pick: ToolKey;
    if (!didICU && !didRR) {
      pick = 'icu';
      call =
        'Start with ICU — mix up the tempos and starting points until it stops being a gamble. Once it’s solid, you’ll rotate Rep Rotator in to lock it down.';
    } else if (h.lastTool === 'icu') {
      pick = 'rep';
      call =
        'You did ICU last time — so today, flip to Rep Rotator: run it cold, mixed in with other spots. Keep rotating the two day to day.';
    } else if (h.lastTool === 'rep') {
      pick = 'icu';
      call =
        'You did Rep Rotator last time — so today, come back to ICU: mix up the tempos and start points to keep tightening it. Keep rotating the two day to day.';
    } else if (didICU && !didRR) {
      pick = 'rep';
      call =
        'You’ve drilled it with ICU — now rotate Rep Rotator in: run it cold, mixed with other spots. Then keep alternating the two.';
    } else {
      pick = 'icu';
      call =
        'Tighten it up with ICU — mix up the tempos and start points. Then keep ICU and Rep Rotator rotating day to day.';
    }
    return {
      lead,
      call,
      startTool: pick,
      escape:
        'ICU is what makes it reliable; Rep Rotator locks in what works — alternate them, don’t pick one forever.',
    };
  }

  // ⓔ coordination — Rhythm Variations (built) + the universal nudge
  // (instrument-specific drills are deliberately out of v1; see the plan).
  return {
    lead: `${affirm(h)} Since it’s the coordination that’s the issue,`,
    call:
      conn(h, 'rv', 'Rhythm Variations', 'play it in snappy, dotted rhythms to force the two parts to lock together') +
      ' And away from the metronome, isolate the two parts that aren’t lining up, then put them back together.',
    startTool: 'rv',
  };
}

function dueTriage(call: string, tool: ToolKey, dueWeeks: number | null): string {
  if (dueWeeks !== null && dueWeeks <= 1 && (tool === 'ladder' || tool === 'macro')) {
    return call + ' With the date this close, keep it to what feels reliable rather than pushing for more.';
  }
  return call;
}
