// Lock-don't-lose: which existing content a free-tier user can still open.
//
// The promise (paywall fine-print): "Cancel anytime — your music stays; extra
// passages just lock until you return." Downgrading NEVER deletes anything —
// nothing in the app removes data when an entitlement lapses. This module is
// the other half: which already-saved pieces are *locked* (visible but not
// openable) while the user is on the free plan.
//
// Pure and shared (web + native) so the rule lives in exactly one place. Fed
// the globally-loaded passage + document lists the library already holds; it
// does not query. When the user is Pro (incl. the paywall-off / trial states),
// nothing is locked — so this is completely inert while PAYWALL_ENABLED is
// false, because everyone reads as Pro then.
//
// The rule, for a free user:
//   • Every PDF document (source_kind 'pdf') and every passage marked inside
//     one is Pro-only → locked. (PDF parts were always the Pro workflow.)
//   • Photo passages (the free-tier unit: non-PDF marked passages) are ranked
//     OLDEST-first by created_at; the first FREE_PASSAGE_LIMIT stay free, the
//     rest lock. "Your first N passages" = the ones you made first, a stable
//     ordering that doesn't shuffle when the user reorders their library.

import { FREE_PASSAGE_LIMIT } from '@/constants/billing';
import type { Passage } from '@/lib/db/repos/passages';
import type { DocumentRow } from '@/lib/db/repos/documents';

export type Locks = {
  lockedPassageIds: Set<string>;
  lockedDocumentIds: Set<string>;
  /** How many photo passages are locked — for the downgrade message count. */
  lockedPhotoCount: number;
};

const EMPTY: Locks = {
  lockedPassageIds: new Set(),
  lockedDocumentIds: new Set(),
  lockedPhotoCount: 0,
};

export function computeLocks(args: {
  passages: Passage[];
  documents: DocumentRow[];
  isPro: boolean;
}): Locks {
  const { passages, documents, isPro } = args;
  // Pro (or paywall-off / trial — all report isPro) → nothing is ever locked.
  if (isPro) return EMPTY;

  // PDF documents are Pro-only in full.
  const pdfDocIds = new Set(
    documents.filter((d) => d.source_kind === 'pdf').map((d) => d.id),
  );

  const lockedPassageIds = new Set<string>();
  const lockedDocumentIds = new Set<string>(pdfDocIds);

  // Photo passages = the free-tier unit: any live passage NOT belonging to a
  // PDF document (matches countActivePhotoPassages). Rank oldest-first; lock
  // everything past the free allowance.
  const photoPassages = passages
    .filter((p) => p.document_id == null || !pdfDocIds.has(p.document_id))
    .sort((a, b) => a.created_at - b.created_at);

  let lockedPhotoCount = 0;
  photoPassages.forEach((p, i) => {
    if (i >= FREE_PASSAGE_LIMIT) {
      lockedPassageIds.add(p.id);
      lockedPhotoCount += 1;
    }
  });

  // Passages marked inside a PDF part are Pro-only regardless of the count.
  for (const p of passages) {
    if (p.document_id != null && pdfDocIds.has(p.document_id)) {
      lockedPassageIds.add(p.id);
    }
  }

  return { lockedPassageIds, lockedDocumentIds, lockedPhotoCount };
}
