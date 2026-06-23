/**
 * Play Fast Notes v2 — visual redesign palette ("modern ed-tech").
 *
 * This file is the single source of truth for the v2 reskin. It is PURELY
 * presentational: colors, fonts, and surface tints. It introduces NO behavior.
 * Screens migrate their inline hex values to these tokens so the new look is
 * consistent and adjustable from one place.
 *
 * Values come verbatim from the finished Claude Design redesign spec
 * (2026-06-19). Visual goal: warm "paper" backgrounds (not stark white),
 * rounded white cards with a soft low lift, two editorial fonts, and the
 * brand accent sampled from the app icon (#0A7598 petrol-blue).
 */

export const Palette = {
  // ── Brand ────────────────────────────────────────────────────────────────
  /** Brand primary — petrol-blue sampled from the app icon. */
  accent: '#0A7598',
  /** Deeper brand for gradients / pressed states. */
  accentDeep: '#075A77',
  /** Very light brand wash for soft fills / chips / focus tints. */
  accentSoft: '#E1EFF4',

  // ── Surfaces ───────────────────────────────────────────────────────────────
  /** App page surface — the warm "paper" backdrop (replaces stark white). */
  paper: '#F6F2EC',
  /** Outer canvas / deepest backdrop (one step darker than paper). */
  canvas: '#E4E0D6',
  /** Raised white cards. */
  card: '#FFFFFF',
  /** Hairline borders on cards / inputs. */
  border: '#ECE6DC',
  /** Heavier hairline for sunk / secondary surfaces (DESIGN_RULES `--border-strong`). */
  borderStrong: '#E4DED3',
  /** Idle / unfilled track (e.g. progress-bar background). */
  track: '#EFEAE1',
  /** Subtle inset surface (recessed wells, secondary fills). */
  inset: '#FBFAF7',
  /** Sunk surface — inset wells, segmented tracks, tertiary buttons,
   *  secondary chips (DESIGN_RULES `--surface-sunk`). */
  surfaceSunk: '#F4F1EA',

  // ── Ink ──────────────────────────────────────────────────────────────────
  /** Primary text. */
  text: '#15191A',
  /** Secondary body / subtitles. */
  textSecondary: '#6B7375',
  /** Muted hints / placeholders. */
  textMuted: '#9AA0A1',

  // ── Functional strategy colors (meanings preserved from v1) ────────────────
  /** Tempo Ladder — "clean / go" green. */
  tempoLadder: '#2E9C66',
  tempoLadderSoft: '#E4F2EA',
  /** Interleaved / Rep Rotator — amber. */
  interleaved: '#E0863A',
  interleavedSoft: '#F8ECDD',
  /** Rhythmic Variation — violet. */
  rhythmic: '#7657C8',
  rhythmicSoft: '#EEE9F8',
  /** Serial practice uses the brand petrol (accent / accentSoft). */

  // ── Semantic ───────────────────────────────────────────────────────────────
  /** Destructive — miss / end / delete coral-red. */
  danger: '#D9523E',
  dangerSoft: '#FBEAE6',
  /** Border for destructive-secondary (ghost) buttons (DESIGN_RULES). */
  dangerGhostBorder: '#E2A99B',
  /** Warning amber. */
  warning: '#E0A33E',
  /** Success reuses the Tempo Ladder green family. */
  success: '#2E9C66',
  successSoft: '#E4F2EA',
} as const;

/**
 * Soft, low card lift from the redesign spec — `0 10px 26px rgba(20,30,30,.10)`.
 * Expressed in React Native shadow props (Metro maps these to box-shadow on
 * web). Deliberately gentle: no heavy/dark shadows.
 */
export const Lift = {
  shadowColor: 'rgb(20, 30, 30)',
  shadowOpacity: 0.1,
  shadowRadius: 26,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
} as const;

/**
 * Web font-family stacks for the redesign. The actual font files are loaded
 * via <link> tags in app/+html.tsx. On native these gracefully fall back to
 * the system fonts (the brand fonts are a web-first concern for now).
 *
 * - display: Bricolage Grotesque — headings, big numbers, titles (700, tight
 *   letter-spacing ≈ -0.02em applied at the text-style level).
 * - body:    Hanken Grotesk     — everything else (400–800).
 */
export const BrandFonts = {
  display:
    "'Bricolage Grotesque', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  body:
    "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

export type PaletteKey = keyof typeof Palette;
