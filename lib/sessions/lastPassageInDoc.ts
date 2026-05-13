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
