// End-of-session note chips, strategy by strategy, plus the action buttons a
// resurfaced chip-note offers. Ground rules (all Ralph's, 2026-08-12):
//   - The chip list depends on the tool just used, and a chip hides when it
//     can't act — no "Keep climbing" after Interleaved Click-Up (nothing
//     climbs there), no "larger increment" when already at +10.
//   - Buttons say the exact on-card tool name: "Interleaved Click-Up",
//     never "Click-Up".
//   - "Mind the dynamics" is dead as a chip, everywhere.
//   - Rep Rotator gets NO chips and NO reminder — plain text box only. A
//     rotation has no single passage to carry a reminder; if next-time
//     instructions start appearing in logged rotator notes, chips have
//     earned a build (on the rotator setup screen, not here).

export type ChipContext = {
  // Tempo Ladder: the increment used this session — gates the larger/smaller
  // increment chips at the edges of the 2·5·10 preset row.
  increment?: number;
  // Micro-Chaining: the mode used this session — the "try ..." chips offer
  // the two modes NOT used.
  microMode?: 'forward' | 'backward' | 'problem';
  // Rhythmic Variation: true when the session ran a built exercise
  // (Exercise Builder) rather than rhythm patterns only.
  builder?: boolean;
};

// The increment preset row on the Tempo Ladder setup screen. Kept in step
// with INCREMENTS in app/passage/[id]/tempo-ladder.tsx.
export const INCREMENT_STEPS = [2, 5, 10] as const;

// Chip phrases. These exact strings land in the saved note, and
// actionsForReminder recognizes them there when the note resurfaces — change
// one and old notes lose their buttons (they keep displaying as text).
export const CHIP = {
  again: 'Do this again next time',
  climb: 'Keep climbing the tempo',
  variation: 'Introduce some variation',
  slower: 'Start slower next time',
  incLarger: 'Use a larger increment',
  incSmaller: 'Use a smaller increment',
  unitsLarger: 'Use larger units next time',
  unitsSmaller: 'Use smaller units next time',
  tlWork: 'Do some Tempo Ladder work',
  icuWork: 'Do some Interleaved Click-Up work',
  rvWork: 'Do some Rhythmic Variation',
  patternsOnly: 'Try rhythm patterns only',
  buildExercise: 'Build an exercise',
  microForward: 'Try Forward chaining next time',
  microBackward: 'Try Backward chaining next time',
  microProblem: 'Try Problem chaining next time',
} as const;

const MICRO_TRY: Record<NonNullable<ChipContext['microMode']>, string> = {
  forward: CHIP.microForward,
  backward: CHIP.microBackward,
  problem: CHIP.microProblem,
};

export function chipsForStrategy(
  strategy: string | undefined,
  ctx: ChipContext = {},
): string[] {
  switch (strategy) {
    case 'tempo_ladder': {
      const chips: string[] = [CHIP.again, CHIP.climb, CHIP.variation, CHIP.slower];
      // Unknown increment (old rows in edit flows) → offer both directions.
      if (ctx.increment == null || ctx.increment < 10) chips.push(CHIP.incLarger);
      if (ctx.increment == null || ctx.increment > 2) chips.push(CHIP.incSmaller);
      return chips;
    }
    case 'click_up':
      return [
        CHIP.again,
        CHIP.slower,
        CHIP.tlWork,
        CHIP.rvWork,
        CHIP.unitsLarger,
        CHIP.unitsSmaller,
      ];
    case 'rhythmic':
      return ctx.builder
        ? [CHIP.again, CHIP.tlWork, CHIP.icuWork, CHIP.patternsOnly]
        : [CHIP.again, CHIP.tlWork, CHIP.icuWork, CHIP.buildExercise];
    case 'micro_chaining': {
      const unused = (['forward', 'backward', 'problem'] as const)
        .filter((m) => m !== ctx.microMode)
        .map((m) => MICRO_TRY[m]);
      return [CHIP.again, ...unused, CHIP.tlWork, CHIP.icuWork];
    }
    case 'macro_chaining':
      return [CHIP.again, CHIP.tlWork, CHIP.icuWork];
    case 'interleaved':
    case 'rep_rotator':
      return [];
    default:
      // Strategies with no settled list (chunking, self-led, recording):
      // just the universal chip.
      return [CHIP.again];
  }
}

// ── The coach's proposed note (D38, 2026-08-13) ─────────────────────────────
// Six chips overwhelmed a first-timer: "what's most important next time?"
// asks the user to plan the future, which is the expert skill they don't have
// yet — while the app just WATCHED the whole session. So the prompt now leads
// with ONE pre-picked chip plus a session-grounded observation ("Sounds
// right" = one tap, note + reminder set); "Something else…" unfolds the full
// chip set and text box, so the expert path loses nothing. The proposal is
// always an existing CHIP phrase, so the resurfaced reminder's action buttons
// keep working unchanged.

export type SessionOutcome = {
  // Tempo Ladder facts. Absent fields just soften the proposal's wording.
  reachedGoal?: boolean;
  bankedAt?: number; // the rung the session ended on
  goal?: number;
  misses?: number;
  targetReps?: number;
};

export type NoteProposal = {
  phrase: string; // one of the CHIP strings — lands verbatim in the note
  why: string; // the observation shown under it, in the coach's voice
};

export function proposeNote(
  strategy: string | undefined,
  outcome: SessionOutcome = {},
): NoteProposal | null {
  switch (strategy) {
    case 'tempo_ladder': {
      if (outcome.reachedGoal) {
        return {
          phrase: CHIP.variation,
          why: 'You hit your goal tempo today — variation is what makes it stick.',
        };
      }
      if (
        outcome.misses != null &&
        outcome.targetReps != null &&
        outcome.misses >= 2 * outcome.targetReps
      ) {
        return {
          phrase: CHIP.slower,
          why: 'Today was a grind — starting lower makes the first rungs feel easy again.',
        };
      }
      return {
        phrase: CHIP.climb,
        why:
          outcome.bankedAt && outcome.goal
            ? `You banked your climb at ${outcome.bankedAt}, heading for ${outcome.goal}.`
            : 'You banked your climb partway up — more rungs to go.',
      };
    }
    case 'click_up':
      return {
        phrase: CHIP.again,
        why: 'Interleaved work is what cements a passage — another pass is a strong plan.',
      };
    case 'rhythmic':
      return {
        phrase: CHIP.again,
        why: 'Another pass of rhythm work keeps evening it out.',
      };
    case 'interleaved':
    case 'rep_rotator':
      // Rep Rotator carries no chips and no reminder — no proposal either.
      return null;
    default:
      return {
        phrase: CHIP.again,
        why: 'Repeating this next time is a solid plan.',
      };
  }
}

// Rebuild a ChipContext from a saved practice-log row (edit flows). Rows
// logged before this feature lack the fields — the chip list then errs
// toward offering more (e.g. both increment chips).
export function chipContextFromLogData(
  dataJson: string | null | undefined,
): ChipContext {
  if (!dataJson) return {};
  try {
    const d = JSON.parse(dataJson) as Record<string, unknown>;
    const ctx: ChipContext = {};
    if (typeof d.increment === 'number') ctx.increment = d.increment;
    // Micro-Chaining's logged mode values; Tempo Ladder's mode values
    // (step/cluster/custom) fall through harmlessly.
    if (d.mode === 'forward' || d.mode === 'backward' || d.mode === 'problem') {
      ctx.microMode = d.mode;
    }
    if (d.builder === true) ctx.builder = true;
    return ctx;
  } catch {
    return {};
  }
}

// Rep Rotator drops the reminder checkbox along with the chips.
export function strategySupportsReminder(strategy: string | undefined): boolean {
  return strategy !== 'interleaved' && strategy !== 'rep_rotator';
}

// "Start slower next time" = drop ~10%, rounded to a friendly number
// (80 → 70): nearest 5, floored at 30.
export function applyStartScale(bpm: number, scale: number): number {
  return Math.max(30, Math.round((bpm * scale) / 5) * 5);
}

export type ReminderAction = {
  // Button label — exact tool name, optionally with a qualifier.
  label: string;
  // Route under /passage/<id>/, query string included.
  path: string;
  // Gated behind Practice Pro (Exercise Builder) — the caller shows the
  // paywall instead of navigating.
  pro?: boolean;
};

const TL: ReminderAction = { label: 'Tempo Ladder', path: 'tempo-ladder' };
const ICU: ReminderAction = { label: 'Interleaved Click-Up', path: 'click-up' };
const RV: ReminderAction = { label: 'Rhythmic Variation', path: 'rhythmic' };
const BUILDER: ReminderAction = {
  label: 'Exercise Builder',
  path: 'rhythm-builder',
  pro: true,
};

// Turn a resurfaced note into its action buttons. `strategy` and `data` come
// from the practice-log row the note was saved on; free-text notes (no chip
// phrase) return no actions and stay display-only.
export function actionsForReminder(
  strategy: string,
  note: string,
  data?: Record<string, unknown> | null,
): ReminderAction[] {
  const actions: ReminderAction[] = [];
  const has = (phrase: string) => note.includes(phrase);
  const push = (a: ReminderAction) => {
    if (!actions.some((x) => x.label === a.label && x.path === a.path)) {
      actions.push(a);
    }
  };

  if (has(CHIP.again)) {
    switch (strategy) {
      case 'tempo_ladder':
        push(TL);
        break;
      case 'click_up':
        push(ICU);
        break;
      case 'rhythmic':
        push(data?.builder === true ? BUILDER : RV);
        break;
      case 'micro_chaining':
        push({ label: 'Micro-Chaining', path: 'micro-chaining' });
        break;
      case 'macro_chaining':
        push({ label: 'Macro-Chaining', path: 'macro-chaining' });
        break;
    }
  }
  if (has(CHIP.climb)) push(TL);
  if (has(CHIP.variation)) {
    push({
      label: 'Tempo Ladder — randomized cluster',
      path: 'tempo-ladder?mode=cluster',
    });
    push(ICU);
    push(RV);
  }
  if (has(CHIP.slower)) {
    if (strategy === 'click_up') {
      push({
        label: 'Interleaved Click-Up — slower start',
        path: 'click-up?startScale=0.9',
      });
    } else {
      push({
        label: 'Tempo Ladder — slower start',
        path: 'tempo-ladder?startScale=0.9',
      });
    }
  }
  if (has(CHIP.incLarger) || has(CHIP.incSmaller)) {
    // Needs the increment the session used (logged since this feature
    // shipped). Old rows without it fall back to a plain Tempo Ladder button.
    const inc = typeof data?.increment === 'number' ? data.increment : null;
    const i = inc == null ? -1 : INCREMENT_STEPS.indexOf(inc as 2 | 5 | 10);
    if (i === -1) {
      push(TL);
    } else {
      if (has(CHIP.incLarger) && i < INCREMENT_STEPS.length - 1) {
        const next = INCREMENT_STEPS[i + 1];
        push({
          label: `Tempo Ladder — ${next} BPM steps`,
          path: `tempo-ladder?increment=${next}`,
        });
      }
      if (has(CHIP.incSmaller) && i > 0) {
        const prev = INCREMENT_STEPS[i - 1];
        push({
          label: `Tempo Ladder — ${prev} BPM steps`,
          path: `tempo-ladder?increment=${prev}`,
        });
      }
    }
  }
  if (has(CHIP.unitsLarger) || has(CHIP.unitsSmaller)) {
    // ICU always opens on the marking step with saved marks editable — the
    // app can't move the marks itself (musical judgment).
    push({ label: 'Interleaved Click-Up — edit your units', path: 'click-up' });
  }
  if (has(CHIP.tlWork)) push(TL);
  if (has(CHIP.icuWork)) push(ICU);
  if (has(CHIP.rvWork)) push(RV);
  if (has(CHIP.patternsOnly)) push(RV);
  if (has(CHIP.buildExercise)) push(BUILDER);
  return actions;
}
