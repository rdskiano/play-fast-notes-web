/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// v2 redesign — brand petrol-blue sampled from the app icon (#0A7598).
// Full design system lives in constants/palette.ts; this map is the live
// light/dark scheme the existing components already read via useThemeColor.
const tintColorLight = '#0A7598';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    // v2 reskin tokens (see constants/palette.ts).
    text: '#15191A',
    background: '#F6F2EC',
    tint: tintColorLight,
    icon: '#6B7375',
    tabIconDefault: '#6B7375',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    // v2 redesign — Hanken Grotesk (body) + Bricolage Grotesque (display).
    sans: "'Hanken Grotesk', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "'Bricolage Grotesque', Georgia, 'Times New Roman', serif",
    rounded: "'Bricolage Grotesque', 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
