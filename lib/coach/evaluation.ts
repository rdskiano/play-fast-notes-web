// First-practice evaluation — helpers for app/passage/[id]/evaluate.tsx.
//
// The evaluation takes MEASUREMENTS, no judgments: goal tempo, one probe at
// goal, the player's clean tempo, and the deadline. It fires on the FIRST
// practice of a passage (never at marking time — marking must stay cheap) and
// hands off to a fully pre-filled Tempo Ladder. Design settled on mock-up
// night 2026-08-12; the observed rules are D6 (probe at goal first) and D8
// (start a buffer below clean).
//
// Goal-tempo inheritance (Ralph's design, 2026-08-13): once the user has
// DECIDED a performance tempo for any passage in a section, other passages in
// that same section inherit it as the offered default — always changeable.
// The earlier idea of parsing a tempo out of the section's NAME was rejected:
// the offer should come from a real decision the user made, not from reading
// their labels.

import { getDocument, parseSections, sectionForPosition } from '@/lib/db/repos/documents';
import { listPassagesInDocument, parseRegions, type Passage } from '@/lib/db/repos/passages';

export type InheritedGoal = {
  bpm: number;
  /** Title of the sibling passage whose performance tempo we're offering. */
  fromTitle: string;
};

// Identity of the section a passage's top-most box falls in — or null when
// the document has no sections / the passage sits before the first marker.
// Two passages with the SAME key live in the same section (two nulls = both
// in the unsectioned part of the document, which we treat as one region).
function sectionKeyOf(
  passage: Passage,
  sections: { name: string; start_page: number; start_y: number }[],
): string | null {
  const regions = parseRegions(passage.regions_json);
  if (regions.length === 0) return null;
  const first = [...regions].sort((a, b) => a.page - b.page || a.y - b.y)[0];
  const s = sectionForPosition(sections, first.page, first.y);
  return s ? `${s.start_page}:${s.start_y}` : null;
}

// All OTHER passages that live in the same section as this one (two nulls =
// both in the unsectioned part of the document). Shared by the evaluate
// screen's inherited-goal offer and the strategy setup screens' section-scoped
// tempo prefill. Throws are the caller's problem — wrap in try/catch.
export async function listSameSectionSiblings(passage: Passage): Promise<Passage[]> {
  if (!passage.document_id) return [];
  const siblings = await listPassagesInDocument(passage.document_id);
  const doc = await getDocument(passage.document_id);
  const sections = doc ? parseSections(doc.sections_json) : [];
  const myKey = sectionKeyOf(passage, sections);
  return siblings.filter((s) => s.id !== passage.id && sectionKeyOf(s, sections) === myKey);
}

// The most recently updated same-section sibling that has a performance tempo
// set — pure selection, no I/O, for callers that already hold the sibling list.
export function latestSectionTempo(sameSection: Passage[]): InheritedGoal | null {
  const withTempo = sameSection.filter(
    (s) => typeof s.performance_tempo === 'number' && s.performance_tempo > 0,
  );
  if (withTempo.length === 0) return null;
  const best = [...withTempo].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))[0];
  return { bpm: best.performance_tempo as number, fromTitle: best.title };
}

// The goal tempo this passage inherits: the most recently updated sibling in
// the SAME SECTION that already has a performance tempo set.
export async function inheritedGoalForPassage(passage: Passage): Promise<InheritedGoal | null> {
  try {
    return latestSectionTempo(await listSameSectionSiblings(passage));
  } catch {
    // The inherited offer is a convenience — never block the evaluation on it.
    return null;
  }
}

// Ladder start = the proven clean tempo minus a comfort buffer (~12%), rounded
// to a friendly number. Observed in D8: the expert starts BELOW clean ("very,
// very comfortable for the first couple of repetitions") — 80 clean → 70 start.
export function suggestedLadderStart(cleanBpm: number): number {
  return Math.max(30, Math.round((cleanBpm * 0.875) / 5) * 5);
}

// Where the find-your-clean-tempo hunt begins after a failed probe: half the
// goal, rounded to 5 (Ralph's call 2026-08-13 — also the app's existing
// half-the-goal convention for ladder starts).
export function findHuntStart(goalBpm: number): number {
  return Math.max(30, Math.round((goalBpm * 0.5) / 5) * 5);
}
