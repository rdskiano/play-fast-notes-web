// Single-tap overlay used in section-mark mode. The user taps a page; the
// component captures the y position in source-page pixels and reports it via
// onCapture. No persistent visual; the marker itself is invisible.

import { StyleSheet, View } from 'react-native';

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

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const k = sourceHeight / Math.max(rect.height, 1);
    const ySource = Math.max(0, Math.min(sourceHeight, Math.round(y * k)));
    onCapture(pageIndex, ySource);
  }

  // Fallback for layout race: if imageRect is zero-sized, still mount a
  // tap-capture surface that fills the page slot.
  const useFallback = imageRect.w <= 0 || imageRect.h <= 0;

  return (
    <View
      pointerEvents="auto"
      style={[
        styles.layer,
        useFallback
          ? { left: 0, top: 0, right: 0, bottom: 0 }
          : { left: imageRect.x, top: imageRect.y, width: imageRect.w, height: imageRect.h },
      ]}>
      <div
        onClick={onClick}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          cursor: 'pointer',
          touchAction: 'manipulation',
          userSelect: 'none',
          zIndex: 11,
          // Subtle striped tint so the user knows the page is "armed" for marking.
          background:
            'repeating-linear-gradient(135deg, rgba(0,200,255,0.06) 0 12px, rgba(0,200,255,0.10) 12px 24px)',
        }}
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
});
