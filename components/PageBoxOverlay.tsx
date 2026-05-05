// Renders the passage-region rectangles overlaid on a single document page.
//
// Boxes are absolute-positioned inside a container sized to match the actual
// rendered page image (which may be letterboxed inside the page slot because
// expo-image uses contentFit="contain"). Coordinates persist in source-page
// pixel space; the overlay converts to display space via a single ratio.
//
// Tap a box → onSelect(passage.id). Re-tap a different box switches selection.
// If two boxes contain the tap point (overlapping passages), the smaller one
// wins — small boxes are usually more specific (a 4-bar excerpt nested inside
// a 16-bar phrase). v2 could add cycling for >2 overlaps.

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Radii, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { parseRegions, type Passage, type PassageRegion } from '@/lib/db/repos/passages';

type Props = {
  // Passages whose regions_json may contain entries for this page.
  passages: Passage[];
  // 1-indexed page number this overlay covers (matches DocumentPage.index and PassageRegion.page).
  pageIndex: number;
  // Source-pixel dimensions of the rendered page JPG (DocumentPage.w/h).
  sourceWidth: number;
  sourceHeight: number;
  // Rendered dimensions of the page slot on screen (the parent container).
  slotWidth: number;
  slotHeight: number;
  // Visibility toggle — when off, no boxes render and no taps are accepted.
  visible: boolean;
  // Selection state.
  selectedId: string | null;
  onSelect: (passageId: string) => void;
  onDeselect: () => void;
};

export function PageBoxOverlay({
  passages,
  pageIndex,
  sourceWidth,
  sourceHeight,
  slotWidth,
  slotHeight,
  visible,
  selectedId,
  onSelect,
  onDeselect,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  if (!visible) return null;
  if (sourceWidth <= 0 || sourceHeight <= 0 || slotWidth <= 0 || slotHeight <= 0) return null;

  const imageRect = fitContain(slotWidth, slotHeight, sourceWidth, sourceHeight);

  // Collect every (passage, region) pair that lands on this page, then sort
  // smallest-area-first so smaller boxes hit-test ahead of larger ones (the
  // hit-test order = render order in reverse for a tap-to-select pattern,
  // but we use explicit area sort to make it independent of render order).
  type Hit = { passage: Passage; region: PassageRegion; area: number };
  const hits: Hit[] = [];
  for (const p of passages) {
    const regs = parseRegions(p.regions_json);
    for (const r of regs) {
      if (r.page !== pageIndex) continue;
      hits.push({ passage: p, region: r, area: r.w * r.h });
    }
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { left: imageRect.x, top: imageRect.y, width: imageRect.w, height: imageRect.h }]}>
      {/* Backdrop tap = deselect (only active when something is selected,
          to avoid intercepting accidental presses). */}
      {selectedId && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDeselect}
          accessibilityLabel="Deselect passage"
        />
      )}
      {/* Render largest-first so smaller boxes are visually on top AND
          hit-test first (they catch the tap). */}
      {hits
        .slice()
        .sort((a, b) => b.area - a.area)
        .map(({ passage, region }) => {
          const selected = selectedId === passage.id;
          const left = (region.x / sourceWidth) * imageRect.w;
          const top = (region.y / sourceHeight) * imageRect.h;
          const width = (region.w / sourceWidth) * imageRect.w;
          const height = (region.h / sourceHeight) * imageRect.h;
          return (
            <Pressable
              key={`${passage.id}:${region.page}`}
              onPress={() => onSelect(passage.id)}
              style={[
                styles.box,
                {
                  left,
                  top,
                  width,
                  height,
                  borderColor: selected ? C.tint : '#000',
                  borderWidth: selected ? 2 : 1.5,
                  backgroundColor: selected ? C.tint + '22' : '#00000022',
                },
              ]}>
              <View style={[styles.label, { backgroundColor: '#ffffffd9' }]}>
                <ThemedText
                  style={[styles.labelText, { color: selected ? C.tint : '#222' }]}
                  numberOfLines={1}>
                  {passage.title}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
    </View>
  );
}

// Compute the rendered image rect inside a slot when using contentFit="contain".
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
  layer: {
    position: 'absolute',
  },
  box: {
    position: 'absolute',
    borderRadius: Radii.sm,
  },
  label: {
    position: 'absolute',
    top: 2,
    left: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.sm,
    maxWidth: '90%',
  },
  labelText: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.medium,
  },
});
