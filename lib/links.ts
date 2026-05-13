// Single source of truth for external links surfaced in the app.
//
// Update BMAC_USERNAME to the actual Buy Me a Coffee profile slug before
// rolling this out. The placeholder is used until then so the build works
// locally — the link will simply 404 in production until the slug is real.
export const BMAC_USERNAME = 'playfastnotes';

export function bmacUrl(): string {
  return `https://www.buymeacoffee.com/${BMAC_USERNAME}`;
}
