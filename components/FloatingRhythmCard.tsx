import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { buildRhythmAbc } from '@/lib/notation/buildAbc';
import type { RhythmPattern } from '@/lib/strategies/rhythmPatterns';

type Props = {
  pattern: RhythmPattern;
  patternIndex: number;
  patternCount: number;
  rhythmLooping: boolean;
  onToggleRhythm: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
};

const CARD_W = 440;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.6;

export function FloatingRhythmCard({
  pattern,
  patternIndex,
  patternCount,
  rhythmLooping,
  onToggleRhythm,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState({ x: 280, y: 100 });
  const [scale, setScale] = useState(0.85);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragBaseRef = useRef<{ x: number; y: number } | null>(null);
  const pinchBaseRef = useRef<{ dist: number; scale: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const abc = useMemo(() => buildRhythmAbc(pattern), [pattern]);

  function pinchDistance(): number {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return 0;
    const [a, b] = pts;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    function onPointerDown(e: PointerEvent) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size === 2) {
        dragBaseRef.current = null;
        pinchBaseRef.current = { dist: pinchDistance(), scale };
      }
    }
    function onPointerMove(e: PointerEvent) {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size >= 2 && pinchBaseRef.current) {
        e.preventDefault();
        const dist = pinchDistance();
        if (pinchBaseRef.current.dist > 0) {
          const ns = pinchBaseRef.current.scale * (dist / pinchBaseRef.current.dist);
          setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, ns)));
        }
      }
    }
    function onPointerUp(e: PointerEvent) {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchBaseRef.current = null;
    }
    card.addEventListener('pointerdown', onPointerDown);
    card.addEventListener('pointermove', onPointerMove);
    card.addEventListener('pointerup', onPointerUp);
    card.addEventListener('pointercancel', onPointerUp);
    return () => {
      card.removeEventListener('pointerdown', onPointerDown);
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerup', onPointerUp);
      card.removeEventListener('pointercancel', onPointerUp);
    };
  }, [scale]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setScale((s) => {
        const ns = s * (1 - e.deltaY * 0.01);
        return Math.max(MIN_SCALE, Math.min(MAX_SCALE, ns));
      });
    }
    card.addEventListener('wheel', onWheel, { passive: false });
    return () => card.removeEventListener('wheel', onWheel);
  }, []);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointersRef.current.size >= 2) return;
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      dragBaseRef.current = { x: pos.x, y: pos.y };

      function onMove(ev: PointerEvent) {
        if (pointersRef.current.size >= 2 || !dragBaseRef.current) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const cw = CARD_W * scale;
        const nextX = Math.max(0, Math.min(w - cw, dragBaseRef.current.x + (ev.clientX - startX)));
        const nextY = Math.max(0, Math.min(h - 100, dragBaseRef.current.y + (ev.clientY - startY)));
        setPos({ x: nextX, y: nextY });
      }
      function onUp() {
        dragBaseRef.current = null;
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
      }
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    },
    [pos.x, pos.y, scale],
  );

  return (
    <div
      ref={cardRef}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: CARD_W,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        touchAction: 'none',
        // Stay above other floating overlays (FloatingMetronome at zIndex
        // default, FeedbackButton, etc.) — the rhythm card is the primary
        // focus during Rhythmic Variation.
        zIndex: 200,
      }}>
      <View
        style={[
          styles.card,
          {
            width: CARD_W,
            backgroundColor: scheme === 'dark' ? '#1f2123ee' : '#ffffffee',
            borderColor: C.icon,
          },
        ]}>
        <div
          onPointerDown={onHandlePointerDown}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 4,
            paddingBottom: 4,
            touchAction: 'none',
            cursor: 'grab',
            position: 'relative',
          }}>
          <View style={styles.dragBars}>
            <View style={[styles.dragBar, { backgroundColor: C.icon }]} />
            <View style={[styles.dragBar, { backgroundColor: C.icon }]} />
          </View>
          <Pressable
            onPress={() => setCollapsed((c) => !c)}
            hitSlop={10}
            style={[styles.collapseBtn, { borderColor: C.icon }]}>
            <ThemedText style={[styles.collapseText, { color: C.text }]}>
              {collapsed ? '▾' : '▴'}
            </ThemedText>
          </Pressable>
        </div>

        <View style={styles.metaRow}>
          <ThemedText style={[styles.metaValue, { color: C.icon }]}>
            {patternIndex + 1}/{patternCount}
          </ThemedText>
          <View style={[styles.metaDot, { backgroundColor: C.icon }]} />
          <ThemedText style={styles.metaLabel}>Time</ThemedText>
          <ThemedText style={styles.metaValue}>{pattern.timeSig}</ThemedText>
          {pattern.beaming && pattern.beaming !== '0' && (
            <>
              <View style={[styles.metaDot, { backgroundColor: C.icon }]} />
              <ThemedText style={styles.metaLabel}>Beam</ThemedText>
              <ThemedText style={styles.metaValue}>{pattern.beaming}</ThemedText>
            </>
          )}
        </View>

        {collapsed ? (
          <View style={styles.collapsedRow}>
            <Pressable
              onPress={onToggleRhythm}
              style={[
                styles.hearBtnCompact,
                { backgroundColor: rhythmLooping ? '#c0392b' : C.tint },
              ]}>
              <ThemedText style={styles.hearText}>
                {rhythmLooping ? '■ Stop' : '▶ Loop'}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onPrev}
              disabled={!canPrev}
              style={[
                styles.navBtnCompact,
                { borderColor: C.tint, opacity: canPrev ? 1 : 0.3 },
              ]}>
              <ThemedText style={[styles.navText, { color: C.tint }]}>←</ThemedText>
            </Pressable>
            <Pressable
              onPress={onNext}
              disabled={!canNext}
              style={[styles.navBtnCompact, styles.nextBtn, { opacity: canNext ? 1 : 0.4 }]}>
              <ThemedText style={[styles.navText, { color: '#fff' }]}>→</ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.rhythmBox}>
              <AbcStaffView abc={abc} width={400} height={100} scale={1.6} />
            </View>

            <Pressable
              onPress={onToggleRhythm}
              style={[
                styles.hearBtn,
                { backgroundColor: rhythmLooping ? '#c0392b' : C.tint },
              ]}>
              <ThemedText style={styles.hearText}>
                {rhythmLooping ? '■ Stop rhythm' : '▶ Loop rhythm'}
              </ThemedText>
            </Pressable>

            <View style={styles.navRow}>
              <Pressable
                onPress={onPrev}
                disabled={!canPrev}
                style={[
                  styles.navBtn,
                  { borderColor: C.tint, opacity: canPrev ? 1 : 0.3 },
                ]}>
                <ThemedText style={[styles.navText, { color: C.tint }]}>← Prev</ThemedText>
              </Pressable>
              <Pressable
                onPress={onNext}
                disabled={!canNext}
                style={[styles.navBtn, styles.nextBtn, { opacity: canNext ? 1 : 0.4 }]}>
                <ThemedText style={[styles.navText, { color: '#fff' }]}>Next →</ThemedText>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </div>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: Borders.thin,
    borderRadius: Radii['2xl'],
    padding: 12,
    gap: Spacing.sm,
  },
  dragBars: { alignItems: 'center', gap: 3, flex: 1 },
  dragBar: { width: 44, height: 3, borderRadius: 2 },
  collapseBtn: {
    position: 'absolute',
    right: 0,
    width: 32,
    height: 32,
    borderRadius: Radii['2xl'],
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapseText: { fontSize: Type.size.lg, fontWeight: Type.weight.heavy, lineHeight: 18 },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  metaLabel: { fontSize: Type.size.xs, opacity: Opacity.muted },
  metaValue: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  metaDot: { width: 4, height: 4, borderRadius: 2, opacity: 0.5 },

  rhythmBox: {
    borderRadius: Radii.md,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },

  collapsedRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  hearBtnCompact: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radii.md,
    alignItems: 'center',
  },
  hearBtn: {
    paddingVertical: 14,
    borderRadius: Radii.lg,
    alignItems: 'center',
  },
  hearText: { color: '#fff', fontWeight: Type.weight.black, fontSize: Type.size.md },

  navRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  navBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
    alignItems: 'center',
  },
  navBtnCompact: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
    alignItems: 'center',
  },
  nextBtn: { backgroundColor: '#9b59b6', borderColor: '#9b59b6' },
  navText: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
});
