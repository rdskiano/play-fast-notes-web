// Custom Tempo Ladder patterns — user-defined sequences of "N reps at tempo X"
// blocks that get saved in a per-user library and run as a third mode of
// Tempo Ladder (alongside Step click-up and Randomized cluster).
//
// The runtime contract:
// - One execution of the whole pattern with NO misses = one successful set.
// - On a clean set, the base tempo bumps by Increment (just like Step).
// - On any miss mid-set, the position resets to (block 0, rep 0) immediately
//   (Strict miss-restart — confirmed by user).
// - When base climbs to performance, session ends in victory.
//
// Tempo references are RELATIVE to Base + Performance, not absolute, because
// users care about the relationship ("ten over slow" / "up to performance")
// far more than the literal BPM. The `absolute` kind is the escape hatch for
// edge cases.

export type TempoRef =
  | { kind: 'base' }
  | { kind: 'base_plus'; delta: number }     // base + N, delta > 0
  | { kind: 'performance' }
  | { kind: 'absolute'; bpm: number };

export type CustomBlock = {
  count: number;   // 1..MAX_REPS_PER_BLOCK
  tempo: TempoRef;
};

export type CustomPattern = {
  id: string;
  user_id?: string;
  name: string;
  blocks: CustomBlock[];
  sort_order?: number;
  created_at?: number;
  updated_at?: number;
};

export const MAX_BLOCKS_PER_PATTERN = 8;
export const MAX_REPS_PER_BLOCK = 20;
export const MIN_REPS_PER_BLOCK = 1;

// Predefined offsets shown in the tempo dropdown. The user can also pick a
// literal BPM via the "Custom BPM…" option (which maps to the `absolute` kind).
export const PRESET_DELTAS = [5, 10, 15, 20] as const;

/**
 * Resolve a block's tempo reference to an actual BPM given the current Base
 * and Performance tempos. Performance is the target ceiling; Base climbs.
 *
 * Block tempos CAN exceed Performance — that's intentional overshoot training
 * (e.g., "1 × Base + 20" while Performance is only Base + 10). No clamping.
 */
export function resolveBlockBpm(
  ref: TempoRef,
  base: number,
  performance: number,
): number {
  switch (ref.kind) {
    case 'base':
      return base;
    case 'base_plus':
      return base + ref.delta;
    case 'performance':
      return performance;
    case 'absolute':
      return ref.bpm;
  }
}

/**
 * One rep of an expanded pattern, used by both the practice runtime and the
 * dot-strip preview. `tempoBpm` is the resolved BPM for that rep at the
 * current base; `tempoLabel` is what the editor preview shows under the
 * dot.
 */
export type ExpandedRep = {
  blockIndex: number;
  repInBlock: number;
  ref: TempoRef;
  tempoBpm: number;
};

export function expandPatternToReps(
  pattern: Pick<CustomPattern, 'blocks'>,
  base: number,
  performance: number,
): ExpandedRep[] {
  const out: ExpandedRep[] = [];
  pattern.blocks.forEach((block, blockIndex) => {
    for (let r = 0; r < block.count; r++) {
      out.push({
        blockIndex,
        repInBlock: r,
        ref: block.tempo,
        tempoBpm: resolveBlockBpm(block.tempo, base, performance),
      });
    }
  });
  return out;
}

/**
 * Human-readable one-line summary used as the subtitle on the mode-picker
 * card ("9 × Base · 1 × Base + 10").
 */
export function summarizePattern(pattern: Pick<CustomPattern, 'blocks'>): string {
  if (pattern.blocks.length === 0) return '(empty)';
  return pattern.blocks.map((b) => `${b.count} × ${formatTempoRef(b.tempo)}`).join(' · ');
}

export function formatTempoRef(ref: TempoRef): string {
  switch (ref.kind) {
    case 'base':
      return 'Base';
    case 'base_plus':
      return `Base + ${ref.delta}`;
    case 'performance':
      return 'Performance';
    case 'absolute':
      return `${ref.bpm} BPM`;
  }
}

/**
 * Validation for the editor's Save button. Returns null when the pattern is
 * savable, else a user-facing message. The only hard requirement is a
 * non-empty name and at least one block with a positive count; we leave the
 * "block tempos exceed Performance" edge case alone because it's intentional
 * (per user spec).
 */
export function validatePattern(p: { name: string; blocks: CustomBlock[] }): string | null {
  if (!p.name.trim()) return 'Give your pattern a name.';
  if (p.blocks.length === 0) return 'Add at least one block.';
  if (p.blocks.length > MAX_BLOCKS_PER_PATTERN)
    return `Patterns can have up to ${MAX_BLOCKS_PER_PATTERN} blocks.`;
  for (const b of p.blocks) {
    if (!Number.isFinite(b.count) || b.count < MIN_REPS_PER_BLOCK)
      return 'Each block needs at least one rep.';
    if (b.count > MAX_REPS_PER_BLOCK)
      return `Blocks can have up to ${MAX_REPS_PER_BLOCK} reps each.`;
    if (b.tempo.kind === 'base_plus' && (!Number.isFinite(b.tempo.delta) || b.tempo.delta <= 0))
      return 'Base + offsets must be a positive number.';
    if (b.tempo.kind === 'absolute' && (!Number.isFinite(b.tempo.bpm) || b.tempo.bpm <= 0))
      return 'BPM must be a positive number.';
  }
  return null;
}

// Total reps the pattern plays per set (sum of block counts). Useful for the
// dot-strip width estimate and for the editor preview label.
export function totalRepsInPattern(p: Pick<CustomPattern, 'blocks'>): number {
  return p.blocks.reduce((acc, b) => acc + b.count, 0);
}
