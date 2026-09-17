// Finds the LINES OF MUSIC (systems) in a passage photo by counting dark
// pixels — no AI, no network. Built 2026-09-17 after Ralph's "W horns"
// passage: a photo holding three two-staff lines, all marks on the middle
// one, and the ICU box ran the full height of the photo because the marks
// alone can't say how tall a line of music is.
//
// Steps:
//   1. Staff lines are long thin dark stripes, so a row of pixels on a staff
//      line is mostly dark. Rows with a high dark share = staff lines.
//   2. Five evenly spaced lines = one staff.
//   3. Staves that belong to one line of music (piano hands, Clarinet I+II)
//      are joined by a vertical line at their left edge. Separate lines of
//      music are not. That decides which staves group into one system.
//
// Anything unclear (tilted photo, faint scan, no staves found) returns null
// and the caller keeps its old mark-only geometry.

export type StaffSystem = {
  /** Top staff line of the system's first staff, normalized to photo height. */
  top: number;
  /** Bottom staff line of the system's last staff, normalized. */
  bot: number;
  staffCount: number;
};

type Staff = {
  /** Extremes across the whole width (a scanned page can bow a few pixels). */
  top: number;
  bot: number;
  /** Line positions where the staff starts, for the left-edge checks. */
  leftLines: number[];
  left: number;
};

// A row counts as a staff line inside one vertical strip when this share of
// the strip is dark. Text, slurs and note heads stay below it.
const LINE_ROW_SHARE = 0.6;
// Pages bow and tilt a little, so each strip of the page is read on its own
// and the staves are stitched together across strips.
const STRIPS = 12;
// A dark run taller than this many line-gaps is a beam or a note cluster.
const MAX_LINE_THICK = 0.5;
// Five lines form a staff when each gap is within this ratio of their median.
const STAFF_GAP_TOL = 0.3;
// A staff must be found in this share of strips to count.
const MIN_STRIP_SHARE = 0.3;
// The joining line must be dark over this share of the gap between staves.
const JOIN_SHARE = 0.9;

/** Otsu threshold: the gray level that best splits ink from paper. */
function otsu(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let bestT = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT;
}

export function detectStaffSystems(
  gray: Uint8Array,
  width: number,
  height: number,
): StaffSystem[] | null {
  if (width < 50 || height < 20 || gray.length < width * height) return null;
  const t = otsu(gray);
  const dark = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) dark[i] = gray[i] <= t ? 1 : 0;
  const isDark = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && dark[y * width + x] === 1;

  // 1+2. In each vertical strip: dark rows -> staff lines -> five evenly
  //      spaced lines -> a staff.
  type Cand = { lines: number[]; x0: number; x1: number };
  const stripW = Math.floor(width / STRIPS);
  const perStrip: Cand[][] = [];
  for (let s = 0; s < STRIPS; s++) {
    const x0 = s * stripW;
    const x1 = s === STRIPS - 1 ? width : x0 + stripW;
    const runs: { a: number; b: number }[] = [];
    let open = -1;
    for (let y = 0; y <= height; y++) {
      let on = false;
      if (y < height) {
        let n = 0;
        for (let x = x0; x < x1; x++) n += dark[y * width + x];
        on = n / (x1 - x0) >= LINE_ROW_SHARE;
      }
      if (on && open < 0) open = y;
      if (!on && open >= 0) {
        runs.push({ a: open, b: y - 1 });
        open = -1;
      }
    }
    const cands: Cand[] = [];
    for (let i = 0; i + 4 < runs.length; ) {
      const five = runs.slice(i, i + 5);
      const centers = five.map((r) => (r.a + r.b) / 2);
      const gaps = [1, 2, 3, 4].map((k) => centers[k] - centers[k - 1]);
      const med = [...gaps].sort((a, b) => a - b)[2];
      const ok =
        med >= 3 &&
        gaps.every((g) => Math.abs(g - med) <= med * STAFF_GAP_TOL) &&
        five.every((r) => r.b - r.a + 1 <= Math.max(2, med * MAX_LINE_THICK));
      if (ok) {
        cands.push({ lines: centers, x0, x1 });
        i += 5;
      } else {
        i++;
      }
    }
    perStrip.push(cands);
  }

  // Stitch strips together: a candidate continues the staff whose most
  // recent position is within one staff-height of it.
  type Chain = { cands: Cand[]; lastMid: number; height: number };
  const chains: Chain[] = [];
  for (const cands of perStrip) {
    const used = new Set<Chain>();
    for (const c of cands) {
      const mid = c.lines[2];
      const h = c.lines[4] - c.lines[0];
      let best: Chain | null = null;
      for (const ch of chains) {
        if (used.has(ch)) continue;
        const d = Math.abs(ch.lastMid - mid);
        if (d <= Math.max(h, ch.height) * 0.5 && (!best || d < Math.abs(best.lastMid - mid))) {
          best = ch;
        }
      }
      if (best) {
        best.cands.push(c);
        best.lastMid = mid;
        used.add(best);
      } else {
        const ch = { cands: [c], lastMid: mid, height: h };
        chains.push(ch);
        used.add(ch);
      }
    }
  }
  const staves: Staff[] = chains
    .filter((ch) => ch.cands.length >= Math.max(2, Math.ceil(STRIPS * MIN_STRIP_SHARE)))
    .map((ch) => {
      const first = ch.cands[0];
      return {
        top: Math.min(...ch.cands.map((c) => c.lines[0])),
        bot: Math.max(...ch.cands.map((c) => c.lines[4])),
        leftLines: first.lines,
        left: staffLeft(first.lines, first.x1),
      };
    })
    .sort((a, b) => a.top - b.top);
  if (staves.length === 0) return null;

  // Leftmost column where the staff's lines are all present (4 of 5 — a
  // clef or brace can cover one) and stay present for a few columns.
  function staffLeft(five: number[], limit: number): number {
    const run = Math.max(3, Math.round((five[4] - five[0]) / 4));
    const hit = (x: number) => {
      let n = 0;
      for (const ly of five) {
        const y = Math.round(ly);
        if (isDark(x, y) || isDark(x, y - 1) || isDark(x, y + 1)) n++;
      }
      return n >= 4;
    };
    for (let x = 0; x < limit; x++) {
      let k = 0;
      while (k < run && hit(x + k)) k++;
      if (k === run) return x;
    }
    return 0;
  }

  // 3. Two neighboring staves are one system when a vertical line near their
  //    shared left edge runs dark through the gap between them.
  function joined(a: Staff, b: Staff): boolean {
    const y0 = Math.round(a.leftLines[4]) + 2;
    const y1 = Math.round(b.leftLines[0]) - 2;
    if (y1 <= y0) return true;
    const pitch = (a.leftLines[4] - a.leftLines[0]) / 4;
    const from = Math.max(0, Math.min(a.left, b.left) - Math.round(pitch));
    const to = Math.min(width - 1, Math.max(a.left, b.left) + Math.round(pitch * 1.5));
    for (let x = from; x <= to; x++) {
      let n = 0;
      for (let y = y0; y <= y1; y++) {
        if (isDark(x, y) || isDark(x - 1, y) || isDark(x + 1, y)) n++;
      }
      if (n / (y1 - y0 + 1) >= JOIN_SHARE) return true;
    }
    return false;
  }

  const systems: StaffSystem[] = [];
  let cur = { top: staves[0].top, bot: staves[0].bot, staffCount: 1 };
  for (let s = 1; s < staves.length; s++) {
    if (joined(staves[s - 1], staves[s])) {
      cur.bot = staves[s].bot;
      cur.staffCount++;
    } else {
      systems.push(cur);
      cur = { top: staves[s].top, bot: staves[s].bot, staffCount: 1 };
    }
  }
  systems.push(cur);
  return systems.map((sy) => ({
    top: sy.top / height,
    bot: sy.bot / height,
    staffCount: sy.staffCount,
  }));
}
