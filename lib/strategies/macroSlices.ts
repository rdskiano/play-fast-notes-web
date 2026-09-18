// Geometry for the Macro-Chaining run screen's visual modes (2026-09-13
// redesign, mock-up-approved by Ralph on his real Polovtsian Dances marks).
//
// The beat marks the user tapped carry normalized [0,1] positions on the
// passage photo. From them we derive:
//   - which STAFF ROW (line of music) each mark sits on, by clustering the
//     marks' y values (reading order = index order, so a big y jump = the
//     next line);
//   - a vertical BAND of the photo per row (the strip of image that holds
//     that line's music). Marks are tapped at/just above the notes, so a
//     row's band runs from a hair above its own marks down to a hair above
//     the next row's marks — validated against Ralph's real passages;
//   - horizontal SLICES for any chunk of beats, splitting at line breaks the
//     way a hyphenated word splits: end-of-line piece + start-of-next piece.
//
// Both run-screen views build on these: "sliced apart" renders each slice as
// a cut strip of the photo; "rests above the score" uses the bands/rows to
// know where boundaries sit and whether the passage is single-line (badges
// at every boundary) or multi-line (one banner + small boundary markers).

import type { Marker } from '@/lib/db/repos/passages';
import type { StaffSystem } from '@/lib/image/staffSystems';

export type ScoreRowBand = { top: number; bot: number };
export type ScoreGeometry = {
  /** Marks sorted by index — the array the other fields index into. */
  marks: Marker[];
  /** Row index per mark (parallel to `marks`). */
  rowOf: number[];
  /** Vertical photo band per row, normalized. */
  bands: ScoreRowBand[];
  rowCount: number;
  beatCount: number;
};

export type ChunkSlice = { row: number; x0: number; x1: number };

// Row (line-of-music) detection, mark by mark in playing order:
//  - A mark whose y sits more than ROW_BREAK from its row's top-most mark
//    starts a new row, UNLESS it moved on to the right (by MIN_ADVANCE) and
//    only a small step from the previous mark. That exception keeps a
//    melody that drifts up or down across one line as a single row (Ralph's
//    "45" strip, 2026-09-16: the last mark on a low note read as a second
//    line and squashed every box to a thin sliver above the notes).
//  - A mark that jumps far back LEFT and a little DOWN always starts a new
//    row: that is what a line break looks like, even on a dense page whose
//    staves sit closer together than ROW_BREAK.
// Checked against all 264 saved passages; every changed split read better.
const ROW_BREAK = 0.12;
const MIN_ADVANCE = 0.02;
const LINE_WRAP_DX = 0.25;
const LINE_WRAP_DY = 0.05;
// Band edges sit this far above the row's top-most mark.
const BAND_PAD = 0.02;
// Where a line a chunk wraps onto starts: its left edge, clef included.
// This used to be "just left of the line's first mark", which cut out any
// notes before that mark (Ralph's "51", 2026-09-16: a unit wrapping onto
// line 2 lost the tied E-flat before mark 2). Ralph chose the clef showing
// over missing notes, for ICU boxes and Macro strips alike.
const LINE_START = 0;
// Where a line of music ends, normalized (staff lines run to the photo edge).
const LINE_END = 0.995;
// Slice padding: room left of the start mark and enough past the end mark
// to show the landing note it plays into. PAD_LEFT is sized so an
// ACCIDENTAL on the first note stays inside the cut (Ralph's live check,
// 2026-09-13 — the original 0.01 clipped a sharp/flat). That protection
// matters where the photo is literally CUT (Macro's sliced strips); ICU's
// boxes are only highlight rings over the intact score, so they use the
// tighter BOX_PAD_LEFT instead (Ralph, same night, on the iPad: the wide
// boxes read worse and hide nothing).
const PAD_LEFT = 0.022;
/** Left pad for non-destructive highlight boxes (ICU Boxed view). Tried
 *  0.01 (clipped accidentals) and 0.022 (too wide); Ralph asked for the
 *  middle, just enough to take in a sharp/flat, 2026-09-16. */
export const BOX_PAD_LEFT = 0.016;
const PAD_LANDING = 0.026;
// The final mark sits ON the last note, so the last slice reaches further.
const PAD_FINAL = 0.036;
// A landing slice narrower than this (landing mark at the very start of the
// next line) is dropped — the previous slice's line-end already shows it.
const MIN_SLICE_W = 0.02;

// When the photo's lines of music are known (read from its pixels), a row's
// band reaches past its staves by up to this many staff-heights, and never
// past halfway to the neighboring line of music. Ralph (2026-09-17): height
// only has to show the notes clearly, so be generous; left-right is what
// makes the tool accurate. Between two lines this means "halfway"; the
// limit only bites at the photo's top and bottom edges.
const SYSTEM_REACH = 2.5;

export function computeScoreGeometry(
  rawMarks: Marker[],
  systems?: StaffSystem[] | null,
): ScoreGeometry {
  const marks = [...rawMarks].sort((a, b) => a.index - b.index);
  const rowOf: number[] = [];
  const rowYMin: number[] = [];
  for (let i = 0; i < marks.length; i++) {
    const y = marks[i].y;
    const r = rowYMin.length - 1;
    const dx = i > 0 ? marks[i].x - marks[i - 1].x : 0;
    const dy = i > 0 ? y - marks[i - 1].y : 0;
    const wrapped = dx < -LINE_WRAP_DX && dy > LINE_WRAP_DY;
    const farFromRow =
      r >= 0 &&
      Math.abs(y - rowYMin[r]) > ROW_BREAK &&
      (Math.abs(dy) > ROW_BREAK || dx < MIN_ADVANCE);
    if (r < 0 || wrapped || farFromRow) {
      rowYMin.push(y);
    } else if (y < rowYMin[r]) {
      rowYMin[r] = y;
    }
    rowOf.push(rowYMin.length - 1);
  }
  const rowCount = rowYMin.length;
  const bands: ScoreRowBand[] =
    rowCount === 1
      ? [{ top: 0, bot: 1 }]
      : rowYMin.map((yMin, k) => ({
          top: Math.max(0, yMin - BAND_PAD),
          bot: k + 1 < rowCount ? Math.max(0, rowYMin[k + 1] - BAND_PAD) : 1,
        }));
  const fitted = systems?.length ? fitBandsToSystems(bands, marks, rowOf, rowCount, systems) : null;
  return {
    marks,
    rowOf,
    bands: fitted ?? bands,
    rowCount,
    beatCount: Math.max(0, marks.length - 1),
  };
}

/**
 * Tightens each row's band to the line of music its marks sit on. Before
 * this, a passage marked on ONE line boxed the whole photo top to bottom
 * (Ralph's "W horns", 2026-09-17: three two-staff lines in the photo, marks
 * on the middle one), and the LAST row of any passage ran to the photo's
 * bottom edge. Returns null (keep the mark-only bands) when the rows don't
 * map one-to-one onto lines of music in reading order.
 */
function fitBandsToSystems(
  bands: ScoreRowBand[],
  marks: Marker[],
  rowOf: number[],
  rowCount: number,
  systems: StaffSystem[],
): ScoreRowBand[] | null {
  const sysOf: number[] = [];
  for (let r = 0; r < rowCount; r++) {
    const ys = marks.filter((_, i) => rowOf[i] === r).map((m) => m.y).sort((a, b) => a - b);
    const y = ys[Math.floor(ys.length / 2)];
    // Marks sit at or above their notes, so a line of music the marks hang
    // well below can't be theirs: marks in the gap between two lines belong
    // to the LOWER line, however close the upper one is. Picking the plain
    // nearest line boxed the whole photo (Suzanne's "210 arpeggios",
    // 2026-09-18: marks above line 2's high notes sat a hair nearer line 1,
    // which was then rejected for hanging below it).
    let best = -1;
    let bestD = Infinity;
    systems.forEach((sy, k) => {
      if (y > sy.bot + ((sy.bot - sy.top) / sy.staffCount) * 0.25) return;
      const d = y < sy.top ? sy.top - y : y > sy.bot ? y - sy.bot : 0;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    // Marks below every line the reader found belong to a staff it missed
    // (a small inset staff, say). Don't trust the reading then.
    if (best < 0) return null;
    if (r > 0 && best <= sysOf[r - 1]) return null;
    sysOf.push(best);
  }
  const out = bands.map((band, r) => {
    const k = sysOf[r];
    const sy = systems[k];
    const reach = ((sy.bot - sy.top) / sy.staffCount) * SYSTEM_REACH;
    const prev = systems[k - 1];
    const next = systems[k + 1];
    const top = Math.max(sy.top - reach, prev ? (prev.bot + sy.top) / 2 : 0);
    const bot = Math.min(sy.bot + reach, next ? (sy.bot + next.top) / 2 : 1);
    // Every mark stays inside its band, with room for the note under it.
    const ys = marks.filter((_, i) => rowOf[i] === r).map((m) => m.y);
    return {
      top: Math.max(0, Math.min(top, Math.min(...ys) - BAND_PAD)),
      bot: Math.min(band.bot, Math.max(bot, Math.max(...ys) + BAND_PAD * 1.5)),
    };
  });
  return out.every((b) => b.bot - b.top > BAND_PAD) ? out : null;
}

/**
 * Photo slices for the chunk that starts at mark array-index `a` and lands on
 * mark array-index `b` (chunk of beats a+1..b in musician terms). One slice
 * when the chunk stays on one line; otherwise end-of-line + (full middle
 * lines) + start-of-line pieces, in playing order.
 */
export function chunkSlices(
  geom: ScoreGeometry,
  a: number,
  b: number,
  opts?: { padLeft?: number },
): ChunkSlice[] {
  const { marks, rowOf } = geom;
  const padLeft = opts?.padLeft ?? PAD_LEFT;
  const isFinal = b === marks.length - 1;
  const landPad = isFinal ? PAD_FINAL : PAD_LANDING;
  const ra = rowOf[a];
  const rb = rowOf[b];
  if (ra === rb) {
    return [{ row: ra, x0: Math.max(0, marks[a].x - padLeft), x1: Math.min(1, marks[b].x + landPad) }];
  }
  const slices: ChunkSlice[] = [
    { row: ra, x0: Math.max(0, marks[a].x - padLeft), x1: LINE_END },
  ];
  for (let r = ra + 1; r < rb; r++) {
    slices.push({ row: r, x0: LINE_START, x1: LINE_END });
  }
  const x0 = LINE_START;
  const x1 = Math.min(1, marks[b].x + landPad);
  if (x1 - x0 > MIN_SLICE_W) slices.push({ row: rb, x0, x1 });
  return slices;
}

/**
 * The marks where one chunk hands off to the next in a chain step (interior
 * boundaries only — not the passage's start or end). This is where the rest
 * badges / boundary markers go.
 */
export function chainBoundaries(geom: ScoreGeometry, chunkSize: number): Marker[] {
  const out: Marker[] = [];
  for (let a = chunkSize; a < geom.beatCount; a += chunkSize) out.push(geom.marks[a]);
  return out;
}

/**
 * Whether a chain step's rests render as per-boundary badges or as one
 * banner. Ralph's rule, twice confirmed (2026-09-13): badges ONLY on a
 * single-line passage. On a multi-line passage a badge anchored to a mark
 * sits on top of the line above and covers notes — always use the banner
 * there, no matter how few boundaries the step has.
 */
export function overlayUsesBadges(geom: ScoreGeometry, _chunkSize: number): boolean {
  return geom.rowCount === 1;
}

/** Start/landing mark array-indices for isolate step `chunkIndex`. */
export function isolateRange(
  geom: ScoreGeometry,
  chunkSize: number,
  chunkIndex: number,
): { a: number; b: number } {
  const a = chunkIndex * chunkSize;
  const b = Math.min(a + chunkSize, geom.beatCount);
  return { a, b };
}
