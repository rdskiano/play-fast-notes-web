// Share-sheet PDF import is a native concept (iOS "Copy to Play Fast");
// the web build gets inert stubs so shared call sites need no guards.

export type IncomingPdf = { uri: string; name: string };

export function startIncomingShareListener(): void {}

export function consumePendingShare(): IncomingPdf | null {
  return null;
}

export function subscribeIncomingShare(_fn: () => void): () => void {
  return () => {};
}
