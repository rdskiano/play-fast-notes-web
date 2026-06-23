import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts } from '@/constants/theme';
import { Type } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    // v2 reskin — Hanken Grotesk body font. RN-Web puts a system-font default
    // on every Text, so the brand font must be set explicitly here (the <body>
    // font-family alone doesn't reach RN-Web Text nodes).
    fontFamily: Fonts.sans,
    fontSize: Type.size.lg,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontFamily: Fonts.sans,
    fontSize: Type.size.lg,
    lineHeight: 24,
    fontWeight: Type.weight.semibold,
  },
  title: {
    // v2 reskin — Bricolage display, tight tracking (≈ -0.02em of 32px).
    fontFamily: Fonts.rounded,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontFamily: Fonts.rounded,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  link: {
    fontFamily: Fonts.sans,
    lineHeight: 30,
    fontSize: Type.size.lg,
    // v2 reskin — brand petrol-blue.
    color: '#0A7598',
  },
});
