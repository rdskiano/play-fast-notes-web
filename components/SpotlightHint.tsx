import { useEffect, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

// A one-time coaching spotlight: dims the whole screen, cuts a bright hole
// around one control, and shows a short dark card explaining it. Unlike the
// web-only tour engine (components/tour), this is plain RN primitives so it
// works identically on the iPad app and the web. The hole itself is empty —
// four dim strips compose the mask — so the spotlit control stays TAPPABLE
// straight through it; tapping anywhere dim (or "Got it") dismisses.
//
// Visuals match the tour's coaching layer (slate card, orange accent) so
// the two systems read as one voice.

const ACCENT = '#e67e22';
const CARD_BG = '#1e293b';
const CARD_TITLE = '#f8fafc';
const CARD_BODY = '#cbd5e1';
const DIM = 'rgba(15, 23, 42, 0.74)';

type TargetRect = { x: number; y: number; w: number; h: number };

export function SpotlightHint({
  visible,
  targetRef,
  title,
  body,
  onDismiss,
}: {
  visible: boolean;
  /** A View wrapping the control to spotlight (collapsable={false}). */
  targetRef: RefObject<View | null>;
  title: string;
  body: string;
  onDismiss: () => void;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [rect, setRect] = useState<TargetRect | null>(null);

  useEffect(() => {
    if (!visible) {
      setRect(null);
      return;
    }
    let cancelled = false;
    // Measure after layout settles; retry briefly in case the top bar is
    // still animating in when the hint first becomes visible.
    let tries = 0;
    const attempt = () => {
      const node = targetRef.current;
      if (!node || cancelled) return;
      node.measureInWindow((x, y, w, h) => {
        if (cancelled) return;
        if (w > 0 && h > 0) setRect({ x, y, w, h });
        else if (tries++ < 5) setTimeout(attempt, 150);
      });
    };
    const t = setTimeout(attempt, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // Re-measure when the window changes size (rotation, resize).
  }, [visible, targetRef, screenW, screenH]);

  if (!visible || !rect) return null;

  const pad = 6;
  const holeTop = Math.max(0, rect.y - pad);
  const holeLeft = Math.max(0, rect.x - pad);
  const holeW = rect.w + pad * 2;
  const holeH = rect.h + pad * 2;

  const cardW = Math.min(320, screenW - 24);
  const gap = 14;
  const below = holeTop + holeH + gap + 170 < screenH;
  const cardTop = below ? holeTop + holeH + gap : Math.max(12, holeTop - 170 - gap);
  const cardLeft = Math.max(
    12,
    Math.min(holeLeft + holeW - cardW, screenW - cardW - 12),
  );

  return (
    // zIndex + elevation lift the whole coaching layer above floating
    // chrome (practice-tool tabs and the like) on both platforms.
    <View
      style={[StyleSheet.absoluteFill, { zIndex: 10000, elevation: 10000 }]}
      pointerEvents="box-none">
      {/* Four dim strips composing the mask; the hole between them is empty
          so the real control underneath still takes the tap. */}
      <Pressable
        onPress={onDismiss}
        style={[styles.dim, { top: 0, left: 0, right: 0, height: holeTop }]}
      />
      <Pressable
        onPress={onDismiss}
        style={[styles.dim, { top: holeTop, left: 0, width: holeLeft, height: holeH }]}
      />
      <Pressable
        onPress={onDismiss}
        style={[
          styles.dim,
          { top: holeTop, left: holeLeft + holeW, right: 0, height: holeH },
        ]}
      />
      <Pressable
        onPress={onDismiss}
        style={[styles.dim, { top: holeTop + holeH, left: 0, right: 0, bottom: 0 }]}
      />
      {/* Accent ring around the hole. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: holeTop - 3,
          left: holeLeft - 3,
          width: holeW + 6,
          height: holeH + 6,
          borderRadius: 12,
          borderWidth: 3,
          borderColor: ACCENT,
        }}
      />
      {/* The coaching card. */}
      <View
        style={[styles.card, { top: cardTop, left: cardLeft, width: cardW }]}
        pointerEvents="box-none">
        <ThemedText style={styles.cardTitle}>{title}</ThemedText>
        <ThemedText style={styles.cardBody}>{body}</ThemedText>
        <Pressable onPress={onDismiss} style={styles.gotIt} hitSlop={6}>
          <ThemedText style={styles.gotItText}>Got it</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  card: {
    position: 'absolute',
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ACCENT + '55',
    padding: 18,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  cardTitle: { color: CARD_TITLE, fontSize: 18, fontWeight: '800' },
  cardBody: { color: CARD_BODY, fontSize: 14.5, lineHeight: 21 },
  gotIt: {
    alignSelf: 'flex-end',
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  gotItText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
