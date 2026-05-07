import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Subdivision } from '@/lib/audio/useMetronome';

type Props = {
  bpm: number;
  subdivision: Subdivision;
  running: boolean;
  volume: number;
  onBpm: (v: number) => void;
  onSubdivision: (s: Subdivision) => void;
  onVolume: (v: number) => void;
  onToggle: () => void;
  initialX?: number;
  initialY?: number;
};

const SUBS: Subdivision[] = [1, 2, 3];
const SUB_LABEL: Record<Subdivision, string> = { 1: '♩', 2: '♫', 3: '3' };

const CARD_W = 220;
const BPM_MIN = 30;
const BPM_MAX = 240;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.6;

export function FloatingMetronome({
  bpm,
  subdivision,
  running,
  volume,
  onBpm,
  onSubdivision,
  onVolume,
  onToggle,
  initialX = 16,
  initialY = 100,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [scale, setScale] = useState(0.85);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragBaseRef = useRef<{ x: number; y: number } | null>(null);
  const pinchBaseRef = useRef<{ dist: number; scale: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

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
        // Stay above inline page content (e.g. Exercise Builder generated
        // rhythm cards). FloatingRhythmCard sits even higher so it lands
        // on top of this when both are mounted.
        zIndex: 150,
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

        {collapsed ? (
          <Pressable onPress={onToggle} style={styles.collapsedRow}>
            <ThemedText style={styles.collapsedBpm}>{bpm}</ThemedText>
            <ThemedText style={[styles.collapsedUnit, { color: C.icon }]}>BPM</ThemedText>
            <ThemedText style={[styles.collapsedPlay, { color: running ? '#2ecc71' : C.tint }]}>
              {running ? '■' : '▶'}
            </ThemedText>
          </Pressable>
        ) : (
          <>
            <View style={styles.tempoRow}>
              <Pressable
                onPress={() => onBpm(Math.max(BPM_MIN, bpm - 1))}
                hitSlop={6}
                style={[styles.nudgeBtn, { borderColor: C.icon }]}>
                <ThemedText style={[styles.nudgeText, { color: C.icon }]}>−</ThemedText>
              </Pressable>
              <View style={styles.tempoDisplay}>
                <ThemedText style={styles.tempoNum}>{bpm}</ThemedText>
                <ThemedText style={styles.tempoUnit}>BPM</ThemedText>
              </View>
              <Pressable
                onPress={() => onBpm(Math.min(BPM_MAX, bpm + 1))}
                hitSlop={6}
                style={[styles.nudgeBtn, { borderColor: C.icon }]}>
                <ThemedText style={[styles.nudgeText, { color: C.icon }]}>+</ThemedText>
              </Pressable>
            </View>

            <input
              type="range"
              min={BPM_MIN}
              max={BPM_MAX}
              step={1}
              value={bpm}
              onChange={(e) => onBpm(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: C.tint }}
            />

            <Pressable
              onPress={onToggle}
              style={[styles.playBtn, { backgroundColor: running ? '#c0392b' : '#e67e22' }]}>
              <ThemedText style={styles.playBtnText}>
                {running ? '■ Stop' : '▶ Start'}
              </ThemedText>
            </Pressable>

            <View style={styles.subRow}>
              {SUBS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => onSubdivision(s)}
                  style={[
                    styles.subChip,
                    {
                      borderColor: C.icon,
                      backgroundColor: subdivision === s ? C.tint : 'transparent',
                    },
                  ]}>
                  <ThemedText style={{ color: subdivision === s ? '#fff' : C.text }}>
                    {SUB_LABEL[s]}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <View style={styles.volRow}>
              <ThemedText style={styles.volLabel}>vol</ThemedText>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => onVolume(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: C.tint }}
              />
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

  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.xs,
  },
  collapsedBpm: { fontSize: 30, fontWeight: Type.weight.heavy, lineHeight: 34 },
  collapsedUnit: { fontSize: 12, fontWeight: Type.weight.semibold },
  collapsedPlay: { fontSize: Type.size.lg, fontWeight: Type.weight.heavy },

  tempoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nudgeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: Opacity.subtle,
    minWidth: 36,
    alignItems: 'center',
  },
  nudgeText: { fontSize: Type.size.lg, fontWeight: Type.weight.bold },
  tempoDisplay: { alignItems: 'center' },
  tempoNum: { fontSize: 36, fontWeight: Type.weight.heavy, lineHeight: 40 },
  tempoUnit: { fontSize: Type.size.xs, opacity: Opacity.muted, marginTop: -2 },

  playBtn: {
    borderRadius: Radii.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  playBtnText: {
    color: '#fff',
    fontWeight: Type.weight.black,
    fontSize: Type.size.lg,
    letterSpacing: 0.3,
  },

  subRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
  subChip: {
    borderWidth: Borders.thin,
    borderRadius: Radii['2xl'],
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    minWidth: 44,
    alignItems: 'center',
  },

  volRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  volLabel: { opacity: Opacity.muted, fontSize: 12 },
});
