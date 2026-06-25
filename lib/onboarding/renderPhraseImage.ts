// Native stub for the web notation-to-image renderer (`renderPhraseImage.web.ts`).
// abcjs-to-canvas rasterization is browser-only; on native the seeded piece
// falls back to a placeholder card (onboarding is web-first).

export async function renderPhraseImage(_abc: string): Promise<string | null> {
  return null;
}
