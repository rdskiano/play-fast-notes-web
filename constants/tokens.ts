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
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

export const Overlays = {
  scrim: '#00000099',
  cardDark: '#1f2123ee',
  cardLight: '#ffffffee',
} as const;

export const Status = {
  success: '#2ecc71',
  danger: '#c0392b',
  warning: '#e67e22',
} as const;
