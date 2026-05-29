import { StyleSheet } from 'react-native';

import { Layout } from '@/constants/tokens';

/**
 * Shared layout math for the strategy config screens (tempo-ladder,
 * click-up, rhythmic, chunking, self-led). Centralised so every screen
 * makes the same row-vs-stack call and caps its form the same way.
 *
 * The bug this fixes: screens decided layout from `Math.min(width, height)
 * < 600`, which is orientation-independent — a landscape iPhone is still
 * "phone", so the narrow-portrait single-column stack rendered across a
 * ~800px-wide viewport with no max-width guard. These helpers key off the
 * *effective column width* instead, and the centred cap bounds it.
 */

/** Effective width of the centred config column for a given window width. */
export function configColumnWidth(windowWidth: number): number {
  return Math.min(windowWidth, Layout.configMaxWidth);
}

/**
 * Whether paired BPM cards should stack into a single column (true) or sit
 * 2-across (false), given the current window width. Decided on the column
 * width, so a wide landscape phone gets 2-across inside the capped column
 * while a narrow portrait phone stacks.
 */
export function tempoStacks(windowWidth: number): boolean {
  return configColumnWidth(windowWidth) < Layout.tempoStackBelow;
}

/**
 * Style fragment that caps a ScrollView's contentContainer to a centred
 * column. Spread into the existing contentContainerStyle.
 */
export const configColumnStyle = StyleSheet.create({
  cap: {
    width: '100%',
    maxWidth: Layout.configMaxWidth,
    alignSelf: 'center',
  },
}).cap;
