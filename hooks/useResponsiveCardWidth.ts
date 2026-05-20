import { useWindowDimensions } from 'react-native';

export function useResponsiveCardWidth(baseWidth: number): number {
  const { width } = useWindowDimensions();
  if (width <= 380) return Math.min(baseWidth, width - 32);
  if (width > 500) return Math.min(Math.round(baseWidth * 1.15), width - 64);
  return baseWidth;
}
