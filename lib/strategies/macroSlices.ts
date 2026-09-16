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

export type ScoreRowBand = { top: number; bot: number };
export type ScoreGeometry = {
  /** Marks sorted by index — the array the other fields index into. */
  marks: Marker[];
  /** Row index per mark (parallel to `marks`). */
  rowOf: number[];
  /** Vertical photo band per row, normalized. */
  bands: ScoreRowBand[];
  /** Normalized x where each row's music resumes (for continuation slices). */
  rowStart: number[];
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
// A continuation slice starts this far left of the row's first mark (room
// for the first notehead; the clef stays out of it).
const ROW_START_PAD = 0.038;
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

export function computeScoreGeometry(rawMarks: Marker[]): ScoreGeometry {
  const marks = [...rawMarks].sort((a, b) => a.index - b.index);
  const rowOf: number[] = [];
  const rowYMin: number[] = [];
  const rowFirst: number[] = [];
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
      rowFirst.push(i);
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
  const rowStart = rowFirst.map((fi) => Math.max(0, marks[fi].x - ROW_START_PAD));
  return {
    marks,
    rowOf,
    bands,
    rowStart,
    rowCount,
    beatCount: Math.max(0, marks.length - 1),
  };
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
  const { marks, rowOf, rowStart } = geom;
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
    slices.push({ row: r, x0: rowStart[r], x1: LINE_END });
  }
  const x0 = rowStart[rb];
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
