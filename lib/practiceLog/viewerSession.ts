// Unguided practice on the viewer screens. When the metronome runs on the
// passage view or the PDF view (no guided strategy driving it), nothing would
// ever reach the practice log — so we remember what was on the stand, and the
// next landing on the library (or back on the PDF) offers a freeform log
// entry tied to it. Module state like sessionClock: one pending session per
// JS runtime, because only one screen is ever in front.
//
// Lifecycle: created on the first metronome run; retargeted (same clock) if
// the player moves to another passage and runs the click again; cleared when
// the offer is answered either way, when a guided practice screen mounts
// (usePracticeClock — the strategy's own logging takes over), or by age.

import { resetDroneUse } from './droneUsage';
import { markPracticeStart } from './sessionClock';

export type ViewerSession = {
  // Exactly one of these is set: the passage on the stand, or the whole PDF.
  pieceId: string | null;
  documentId: string | null;
  // The passage's parent PDF, so the PDF viewer can offer the prompt when
  // the player backs out of a passage into it.
  parentDocumentId: string | null;
  startedAt: number;
};

let pending: ViewerSession | null = null;

// Same abandonment cutoff as sessionClock: past this, offer nothing.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function reportViewerMetronomeUse(target: {
  pieceId?: string | null;
  documentId?: string | null;
  parentDocumentId?: string | null;
}): void {
  const now = Date.now();
  const next = {
    pieceId: target.pieceId ?? null,
    documentId: target.documentId ?? null,
    parentDocumentId: target.parentDocumentId ?? null,
  };
  if (pending && now - pending.startedAt <= MAX_AGE_MS) {
    // Same sitting, possibly a different passage on the stand now — the
    // entry ties to whatever the metronome ran on last; the clock keeps
    // measuring from the first run.
    pending = { ...next, startedAt: pending.startedAt };
    return;
  }
  pending = { ...next, startedAt: now };
  // The freeform row this may become gets duration + drone stamps measured
  // from here (logPractice peeks both).
  markPracticeStart();
  resetDroneUse();
}

export function peekViewerSession(): ViewerSession | null {
  if (pending && Date.now() - pending.startedAt > MAX_AGE_MS) pending = null;
  return pending;
}

export function clearViewerSession(): void {
  pending = null;
}
