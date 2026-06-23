/**
 * Design tokens for Play Fast Notes (web).
 *
 * Copied verbatim from the iPad app — keep these in sync. The roadmap calls
 * for design parity between surfaces, with iPad as the north star.
 *
 * `Colors` (light/dark scheme palette) and `Fonts` still live in `theme.ts`.
 */

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 40,
} as const;

export const Radii = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  '2xl': 18,
  pill: 999,
  circle: 9999,
} as const;

export const Type = {
  size: {
    xs: 11,
    sm: 13,
    md: 14,
    lg: 16,
    xl: 18,
    '2xl': 22,
    '3xl': 28,
    '4xl': 36,
  },
  weight: {
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
    black: '900',
  },
} as const;

export const Borders = {
  thin: 1,
  medium: 1.5,
  thick: 2,
} as const;

export const Opacity = {
  faint: 0.55,
  muted: 0.6,
  subtle: 0.7,
} as const;

export const Shadows = {
  // v2 reskin — soft, low lift (0 10px 26px rgba(20,30,30,.10)). No heavy
  // dark shadows. Mirrors `Lift` in constants/palette.ts.
  card: {
    shadowColor: 'rgb(20, 30, 30)',
    shadowOpacity: 0.1,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
} as const;

export const Overlays = {
  scrim: '#00000099',
  cardDark: '#1f2123ee',
  cardLight: '#ffffffee',
} as const;

// Aligned to DESIGN_RULES §1 (one success / danger / warn). Kept as a separate
// export for existing call sites; values now match the Palette semantics.
export const Status = {
  success: '#2E9C66',
  danger: '#D9523E',
  warning: '#E0863A',
} as const;

/**
 * Layout breakpoints for the strategy config screens.
 *
 * `configMaxWidth` caps the setup form in a centred column so it never
 * stretches edge-to-edge on a wide viewport (landscape phone, tablet,
 * desktop). `tempoStackBelow` decides when paired BPM cards stack into one
 * column vs sit 2-across — keyed off the *effective* column width
 * (`min(windowWidth, configMaxWidth)`), NOT `min(width, height)`. The old
 * orientation-independent `isPhone` flag wrongly forced the narrow-portrait
 * stack onto wide landscape viewports; this decouples layout width from
 * device class. See `configColumnWidth` / `tempoStacks` in lib/layout.
 */
export const Layout = {
  configMaxWidth: 600,
  tempoStackBelow: 520,
} as const;
