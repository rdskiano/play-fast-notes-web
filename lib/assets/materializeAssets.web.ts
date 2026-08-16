// Lazy asset download — WEB no-op. Web is cloud-native: every image/PDF is
// already an https URL the browser loads directly; there is no sandbox to
// materialize into. The native sibling (materializeAssets.ts) does the work.

export async function materializePassageAssets(
  _passageId: string,
): Promise<boolean> {
  return false;
}

export async function materializeDocumentAssets(
  _documentId: string,
): Promise<boolean> {
  return false;
}
