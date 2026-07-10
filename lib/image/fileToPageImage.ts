// Native stub of fileToPageImage.web.ts. The browser File → canvas → JPEG
// pipeline is web-only; native document/page ingestion goes through its own
// image tooling. This file exists so the shared import path resolves and
// type-checks on native; the encoder itself throws if ever called there.

export const MAX_PAGE_EDGE = 2000;

export function isHeic(file: { name: string; type?: string }): boolean {
  return /image\/hei[cf]/i.test(file.type ?? '') || /\.hei[cf]$/i.test(file.name);
}

export async function fileToPageImage(
  _file: unknown,
): Promise<{ blob: Blob; w: number; h: number }> {
  throw new Error('fileToPageImage is web-only');
}
