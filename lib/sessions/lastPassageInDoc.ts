// Remembers which passage the user was on within a given document, so when
// they back out to the document viewer it lands on that passage's page
// instead of wherever the document was scrolled when they entered the
// passage. In-memory only — survives within the session, not across reloads.

const lastPassageByDoc = new Map<string, string>();

export function rememberPassageInDoc(documentId: string, passageId: string): void {
  lastPassageByDoc.set(documentId, passageId);
}

export function consumeLastPassageInDoc(documentId: string): string | null {
  const id = lastPassageByDoc.get(documentId);
  if (id !== undefined) lastPassageByDoc.delete(documentId);
  return id ?? null;
}

// After a LOGGED practice session, land on the page where the passage lives
// (the document viewer, opened to that passage's page) instead of the
// passage hub — you finish a spot and you're back at the score, ready to
// pick the next one. Standalone passages (no parent document) have no page
// to land on and return to wherever they came from, as before.
//
// router.navigate pops back to the document screen when it's already in the
// stack (the normal pill → Practice → tool path), so Back from the score
// goes to the library, not through a stale passage hub.
export function returnToScoreAfterSession(
  router: { navigate: (href: never) => void; back: () => void },
  passage: { id: string; document_id: string | null } | null,
): void {
  if (passage?.document_id) {
    rememberPassageInDoc(passage.document_id, passage.id);
    router.navigate(`/document/${passage.document_id}` as never);
  } else {
    router.back();
  }
}
