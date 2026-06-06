// Single-tap overlay used in section-mark mode. iPad port of the web
// SectionMarkerCapturer. The user taps a page; we capture the y position
// in source-page pixels and report via onCapture.

import { Pressable, StyleSheet, View } from 'react-native';

// Diagonal "armed" stripes matching the web's CSS repeating-linear-gradient
// (135deg, cyan 0.06 / 0.10 alternating, 12px bands). RN has no gradient, so
// we render a rotated stack of horizontal bars and clip it to the surface.
const STRIPE = 12;
const STRIPE_A = 'rgba(0,200,255,0.06)';
const STRIPE_B = 'rgba(0,200,255,0.10)';

function DiagonalStripes({ w, h }: { w: number; h: number }) {
  if (w <= 0 || h <= 0) return null;
  // Oversize so the rotated band still covers the corners of the surface.
  const side = Math.ceil(Math.sqrt(w * w + h * h)) + STRIPE * 2;
  const count = Math.ceil(side / STRIPE) + 1;
  const bars = [];
  for (let i = 0; i < count; i++) {
    bars.push(
      <View
        key={i}
        style={{ width: side, height: STRIPE, backgroundColor: i % 2 ? STRIPE_B : STRIPE_A }}
      />,
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={{
          position: 'absolute',
          left: (w - side) / 2,
          top: (h - side) / 2,
          width: side,
          height: side,
          transform: [{ rotate: '135deg' }],
        }}>
        {bars}
      </View>
    </View>
  );
}

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

  const drawW = useFallback ? slotWidth : imageRect.w;
  const drawH = useFallback ? slotHeight : imageRect.h;

  return (
    <View
      pointerEvents="auto"
      style={[
        styles.layer,
        styles.clip,
        useFallback
          ? { left: 0, top: 0, right: 0, bottom: 0 }
          : { left: imageRect.x, top: imageRect.y, width: imageRect.w, height: imageRect.h },
      ]}>
      <DiagonalStripes w={drawW} h={drawH} />
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
  // Clip the oversized rotated stripe band to the armed surface.
  clip: { overflow: 'hidden' },
  // Transparent tap surface over the stripes; the "armed" tint is now the
  // diagonal stripes behind it (DiagonalStripes), matching the web.
  surface: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
