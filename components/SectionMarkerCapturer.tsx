// Single-tap overlay used in section-mark mode. iPad port of the web
// SectionMarkerCapturer. The user taps a page; we capture the y position
// in source-page pixels and report via onCapture. No persistent visual.

import { Pressable, StyleSheet, View } from 'react-native';

type Props = {
  pageIndex: number;
  sourceWidth: number;
  sourceHeight: number;
  slotWidth: number;
  slotHeight: number;
  onCapture: (page: number, y_in_source: number) => void;
};

export function SectionMarkerCapturer({
  pageIndex,
  sourceWidth,
  sourceHeight,
  slotWidth,
  slotHeight,
  onCapture,
}: Props) {
  const imageRect = fitContain(slotWidth, slotHeight, sourceWidth, sourceHeight);
  const useFallback = imageRect.w <= 0 || imageRect.h <= 0;

  function handlePress(e: { nativeEvent: { locationY: number } }) {
    const localY = e.nativeEvent.locationY;
    const slotH = useFallback ? slotHeight : imageRect.h;
    const k = sourceHeight / Math.max(slotH, 1);
    const ySource = Math.max(0, Math.min(sourceHeight, Math.round(localY * k)));
    onCapture(pageIndex, ySource);
  }

  return (
    <View
      pointerEvents="auto"
      style={[
        styles.layer,
        useFallback
          ? { left: 0, top: 0, right: 0, bottom: 0 }
          : { left: imageRect.x, top: imageRect.y, width: imageRect.w, height: imageRect.h },
      ]}>
      <Pressable
        onPress={handlePress}
        style={styles.surface}
        accessibilityLabel={`Tap to mark section start on page ${pageIndex}`}
      />
    </View>
  );
}

function fitContain(slotW: number, slotH: number, sourceW: number, sourceH: number) {
  const slotAspect = slotW / slotH;
  const sourceAspect = sourceW / sourceH;
  if (sourceAspect > slotAspect) {
    const w = slotW;
    const h = w / sourceAspect;
    return { x: 0, y: (slotH - h) / 2, w, h };
  }
  const h = slotH;
  const w = h * sourceAspect;
  return { x: (slotW - w) / 2, y: 0, w, h };
}

const styles = StyleSheet.create({
  layer: { position: 'absolute' },
  surface: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // Subtle striped tint indicating the page is "armed" for marking.
    // Web uses a CSS gradient; RN doesn't have gradients without a lib, so
    // we use a near-transparent solid color tint as a fallback.
    backgroundColor: 'rgba(0,200,255,0.08)',
  },
});
