// Pills-first passage overlay for a document page.
//
// The page shows ONLY a small name pill per passage (anchored at its box's
// top-left corner) — the box rectangle itself is not drawn. One tap on a
// pill does everything: the box lights up AND a compact action bar opens
// (Practice / Edit / History). Tap the empty score to tuck it away.
//
// Why: nested boxes (a passage fully inside another — e.g. the start of a
// line inside a whole-line passage) made labels collide and the inner box
// untappable when boxes were always drawn. With only ONE box ever drawn at
// a time, nesting can't collide; the only remaining collision is
// pill-vs-pill, and pills stack vertically when they'd overlap.
//
// Coordinates persist in source-page pixel space; the overlay converts to
// display space via a single ratio (the page image is letterboxed inside its
// slot by contentFit="contain").

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Radii, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { parseRegions, type Passage, type PassageRegion } from '@/lib/db/repos/passages';
import type { PassageStatus } from '@/lib/db/repos/passageStatus';

type Props = {
  // Passages whose regions_json may contain entries for this page.
  passages: Passage[];
  // Per-passage practice status (last date + Tempo Ladder %). Missing entries
  // render no badge — same as a passage with no history.
  statusByPassage?: Map<string, PassageStatus>;
  // 1-indexed page number this overlay covers (matches DocumentPage.index and PassageRegion.page).
  pageIndex: number;
  // Source-pixel dimensions of the rendered page JPG (DocumentPage.w/h).
  sourceWidth: number;
  sourceHeight: number;
  // Rendered dimensions of the page slot on screen (the parent container).
  slotWidth: number;
  slotHeight: number;
  // Visibility toggle — "View a blank page" hides pills, box, and bar, and
  // no taps are accepted.
  visible: boolean;
  // Selection state.
  selectedId: string | null;
  onSelect: (passageId: string) => void;
  onDeselect: () => void;
  // Action bar under the lit box.
  onPractice: (passage: Passage) => void;
  onEdit: (passage: Passage) => void;
  onHistory: (passage: Passage) => void;
};

// Estimated pill metrics for collision stacking — RN can't measure text
// before layout, so widths are approximated from character count. Verified
// visually; a few px of error just makes the stacking slightly conservative.
const PILL_H = 22;
const PILL_GAP = 3;
const PILL_MAX_W = 190;
const BAR_W = 252;
const BAR_H = 42;

function estimatePillWidth(label: string): number {
  return Math.min(PILL_MAX_W, 16 + label.length * 6.5);
}

export function PageBoxOverlay({
  passages,
  statusByPassage,
  pageIndex,
  sourceWidth,
  sourceHeight,
  slotWidth,
  slotHeight,
  visible,
  selectedId,
  onSelect,
  onDeselect,
  onPractice,
  onEdit,
  onHistory,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  if (!visible) return null;
  if (sourceWidth <= 0 || sourceHeight <= 0 || slotWidth <= 0 || slotHeight <= 0) return null;

  const imageRect = fitContain(slotWidth, slotHeight, sourceWidth, sourceHeight);

  // Collect every (passage, region) pair that lands on this page.
  type Hit = { passage: Passage; region: PassageRegion };
  const hits: Hit[] = [];
  for (const p of passages) {
    const regs = parseRegions(p.regions_json);
    for (const r of regs) {
      if (r.page !== pageIndex) continue;
      hits.push({ passage: p, region: r });
    }
  }
  if (hits.length === 0) return null;

  // Display-space box rect for a hit.
  const boxRect = (region: PassageRegion) => ({
    left: (region.x / sourceWidth) * imageRect.w,
    top: (region.y / sourceHeight) * imageRect.h,
    width: (region.w / sourceWidth) * imageRect.w,
    height: (region.h / sourceHeight) * imageRect.h,
  });

  // Lay the pills out: each anchors at its box's top-left corner, straddling
  // the top edge; when two pills would overlap, the later one stacks below
  // the earlier (top-to-bottom, left-to-right order keeps the outcome
  // stable). Nested passages therefore read as a tidy little stack.
  type Placed = Hit & {
    label: string;
    badge: string | null;
    x: number;
    y: number;
    w: number;
  };
  const placed: Placed[] = [];
  const sorted = hits
    .map((h) => ({ h, r: boxRect(h.region) }))
    .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
  for (const { h, r } of sorted) {
    const badge = formatStatusBadge(statusByPassage?.get(h.passage.id) ?? null);
    const label = badge ? `${h.passage.title}  ·  ${badge}` : h.passage.title;
    const w = estimatePillWidth(label);
    const x = Math.max(0, Math.min(r.left + 2, imageRect.w - w));
    let y = Math.max(0, r.top - PILL_H / 2);
    // Push down until clear of every already-placed pill.
    for (let guard = 0; guard < placed.length + 1; guard++) {
      const clash = placed.find(
        (p) =>
          x < p.x + p.w + PILL_GAP &&
          p.x < x + w + PILL_GAP &&
          y < p.y + PILL_H + PILL_GAP &&
          p.y < y + PILL_H + PILL_GAP,
      );
      if (!clash) break;
      y = clash.y + PILL_H + PILL_GAP;
    }
    placed.push({ ...h, label, badge, x, y, w });
  }

  // The selected passage's box (every region of it on this page) plus the
  // action bar anchored to the first region: above the box when there's
  // room (that's where the eye goes), below it otherwise, and pinned to
  // the page top as a last resort — never covering the box when either
  // side fits. The bar may use the letterbox margins around the image
  // (the layer's parent doesn't clip).
  const selectedHits = selectedId
    ? hits.filter((h) => h.passage.id === selectedId)
    : [];
  let bar: { left: number; top: number; passage: Passage } | null = null;
  if (selectedHits.length > 0) {
    const first = boxRect(selectedHits[0].region);
    const minTop = -imageRect.y + 4;
    const maxTop = slotHeight - imageRect.y - BAR_H - 4;
    let barTop = first.top - BAR_H - 8;
    if (barTop < minTop) barTop = first.top + first.height + 8;
    if (barTop > maxTop) barTop = minTop;
    const barLeft = Math.max(
      4,
      Math.min(first.left + first.width / 2 - BAR_W / 2, imageRect.w - BAR_W - 4),
    );
    bar = { left: barLeft, top: barTop, passage: selectedHits[0].passage };
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { left: imageRect.x, top: imageRect.y, width: imageRect.w, height: imageRect.h }]}>
      {/* Tap the empty score = tuck the box away (only active while
          something is selected, to avoid intercepting accidental presses). */}
      {selectedId && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDeselect}
          accessibilityLabel="Deselect passage"
        />
      )}
      {/* The ONE lit box — only the selected passage ever draws its
          rectangle. Tapping the box itself starts practice (the box was the
          old "tap to practice" surface; keeping that muscle memory). */}
      {selectedHits.map(({ passage, region }) => {
        const r = boxRect(region);
        return (
          <Pressable
            key={`box:${passage.id}:${region.page}`}
            onPress={() => onPractice(passage)}
            accessibilityLabel={`Practice ${passage.title}`}
            style={[
              styles.litBox,
              {
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                borderColor: C.tint,
                backgroundColor: C.tint + '14',
                shadowColor: C.tint,
              },
            ]}
          />
        );
      })}
      {/* The pills — solid brand-accent fill + white text (outline pills
          washed out against the white score page). While a passage is
          selected, ALL pills hide so nothing covers the music; the lit box
          + action bar carry the selection, and tapping the empty score
          brings the pills back. */}
      {!selectedId &&
        placed.map((p) => (
          <Pressable
            key={`pill:${p.passage.id}:${p.region.page}`}
            onPress={() => onSelect(p.passage.id)}
            accessibilityRole="button"
            style={[
              styles.pill,
              {
                left: p.x,
                top: p.y,
                maxWidth: PILL_MAX_W,
                backgroundColor: C.tint,
                borderColor: C.tint,
              },
            ]}>
            <ThemedText
              numberOfLines={1}
              style={[styles.pillText, { color: '#fff' }]}>
              {p.passage.title}
              {p.badge ? (
                <ThemedText style={[styles.pillText, { color: '#ffffffcc' }]}>
                  {'  ·  '}
                  {p.badge}
                </ThemedText>
              ) : null}
            </ThemedText>
          </Pressable>
        ))}
      {/* Compact action bar — Practice / Edit / History, one tap from the
          pill, positioned to stay clear of the lit box. */}
      {bar && (
        <View
          style={[
            styles.bar,
            {
              left: bar.left,
              top: bar.top,
              width: BAR_W,
              height: BAR_H,
              backgroundColor: scheme === 'dark' ? '#26292b' : '#ffffff',
              borderColor: scheme === 'dark' ? '#3a3e41' : '#e3ddd2',
            },
          ]}>
          <Pressable
            onPress={() => bar && onPractice(bar.passage)}
            accessibilityRole="button"
            style={[styles.barBtn, styles.barBtnPrimary, { backgroundColor: C.tint }]}>
            <ThemedText style={[styles.barBtnText, { color: '#fff' }]}>
              ▶ Practice
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => bar && onEdit(bar.passage)}
            accessibilityRole="button"
            style={[styles.barBtn, { backgroundColor: scheme === 'dark' ? '#33373a' : '#f4f1ea' }]}>
            <ThemedText style={[styles.barBtnText, { color: C.text }]}>Edit</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => bar && onHistory(bar.passage)}
            accessibilityRole="button"
            style={[styles.barBtn, { backgroundColor: scheme === 'dark' ? '#33373a' : '#f4f1ea' }]}>
            <ThemedText style={[styles.barBtnText, { color: C.text }]}>Log</ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Format the pill's status suffix. Priority:
//   practiced today  → "✓"  (or "✓ 65%" with Tempo Ladder)
//   has TL %         → "65%" or "65% · 3d"
//   else has date    → "3d"
//   nothing          → null (no badge)
function formatStatusBadge(status: PassageStatus | null): string | null {
  if (!status) return null;
  const { lastPracticedAt, tempoLadderPercent } = status;
  const today = isToday(lastPracticedAt);
  if (today) {
    return tempoLadderPercent !== null ? `✓ ${tempoLadderPercent}%` : '✓';
  }
  const dateLabel = lastPracticedAt !== null ? relativeDays(lastPracticedAt) : null;
  if (tempoLadderPercent !== null && dateLabel) {
    return `${tempoLadderPercent}% · ${dateLabel}`;
  }
  if (tempoLadderPercent !== null) return `${tempoLadderPercent}%`;
  if (dateLabel) return dateLabel;
  return null;
}

function isToday(ts: number | null): boolean {
  if (ts === null) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return ts >= start.getTime();
}

// Compact relative-time label used by the pill badge. Units stack: days →
// weeks → months → years. Smallest unit that comes out >= 1 wins.
function relativeDays(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days < 1) return '1d';
  if (days < 14) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
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
  litBox: {
    position: 'absolute',
    borderRadius: Radii.sm,
    borderWidth: 2,
    // Soft glow so the box reads as "lit", not merely outlined.
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  pill: {
    position: 'absolute',
    height: PILL_H,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    // Lift the pill off the score slightly so it reads as a control.
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  pillText: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
    lineHeight: PILL_H - 4,
  },
  bar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  barBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  barBtnPrimary: {},
  barBtnText: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.bold,
  },
});
