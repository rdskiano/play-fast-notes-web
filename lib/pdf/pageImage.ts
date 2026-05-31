// Native sibling — on-device PDF page rendering is web-only. Native documents
// always carry a per-page image_uri (imported via /import-supabase or written
// to the app sandbox), so there's nothing to render on demand here. Signature
// must match pageImage.web.ts (TypeScript reads this .ts version by default).

export type ResolvableDoc = { id: string; original_uri: string | null };
export type ResolvablePage = { index: number; image_uri?: string; w: number; h: number };

export async function resolvePageImageUri(
  _doc: ResolvableDoc,
  page: ResolvablePage,
): Promise<string> {
  return page.image_uri ?? '';
}
