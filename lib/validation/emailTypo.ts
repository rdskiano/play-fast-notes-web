// Catches the most common email typos at the input — the exact class of bug that
// locked out a real signup (`helen.oshe@gmsil.com`). The address bounces, so the
// user can never recover the account. We only ever *suggest* a correction; we
// never block or auto-change, so a genuinely-unusual domain is never harmed.

// Domains we treat as definitely-correct. If the user's domain is in here we
// stay silent — this prevents real but uncommon domains (ymail, gmx, proton…)
// from being "corrected" toward a more popular neighbour.
const KNOWN_GOOD = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'hey.com',
  'fastmail.com',
  'comcast.net',
  'verizon.net',
  'att.net',
  'sbcglobal.net',
]);

// The popular consumer domains we measure typos against.
const POPULAR = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'live.com',
  'msn.com',
  'me.com',
  'comcast.net',
  'protonmail.com',
];

// Damerau–Levenshtein: edit distance that also counts a single transposition
// (e.g. "gmial" → "gmail") as one edit, which is the most common typo shape.
function editDistance(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  const d: number[][] = Array.from({ length: al + 1 }, () =>
    new Array(bl + 1).fill(0),
  );
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[al][bl];
}

/**
 * Returns a corrected email if the domain looks like a near-miss of a popular
 * provider, otherwise null. Pure string check — no network, safe on web + native.
 */
export function suggestEmailCorrection(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  // Need a dotted domain before we judge it (user may still be typing).
  if (!domain.includes('.')) return null;
  // Already a domain we trust — never nag.
  if (KNOWN_GOOD.has(domain)) return null;

  let best: string | null = null;
  let bestDist = Infinity;
  for (const candidate of POPULAR) {
    const dist = editDistance(domain, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  if (!best || bestDist === 0) return null;
  // Allow a 1-char slip for any domain; a 2-char slip only for longer domains
  // so we don't over-correct very short ones.
  const allowed = best.length >= 8 ? 2 : 1;
  if (bestDist > allowed) return null;

  return `${local}@${best}`;
}
