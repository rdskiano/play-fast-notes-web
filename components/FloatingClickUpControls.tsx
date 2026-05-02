import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Subdivision } from '@/lib/audio/useMetronome';

type Props = {
  bpm: number;
  subdivision: Subdivision;
  running: boolean;
  volume: number;
  onSubdivision: (s: Subdivision) => void;
  onVolume: (v: number) => void;
  onToggle: () => void;
  onNext: () => void;
};

const SUBS: Subdivision[] = [1, 2, 3];
const SUB_LABEL: Record<Subdivision, string> = { 1: '♩', 2: '♫', 3: '3' };

const CARD_W = 280;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.6;

export function FloatingClickUpControls({
  bpm,
  subdivision,
  running,
  volume,
  onSubdivision,
  onVolume,
  onToggle,
  onNext,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState({ x: 12, y: 100 });
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
          <View style={styles.collapsedRow}>
            <Pressable onPress={onToggle} style={styles.collapsedTempo}>
              <ThemedText style={styles.collapsedBpm}>{bpm}</ThemedText>
              <ThemedText style={[styles.collapsedPlay, { color: running ? '#2ecc71' : C.tint }]}>
                {running ? '■' : '▶'}
              </ThemedText>
            </Pressable>
            <Pressable onPress={onNext} style={styles.collapsedNextBtn}>
              <ThemedText style={styles.collapsedNextText}>NEXT →</ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.tempoDisplay}>
              <ThemedText style={styles.tempoNum}>{bpm}</ThemedText>
              <ThemedText style={styles.tempoUnit}>BPM</ThemedText>
            </View>

            <Pressable
              onPress={onToggle}
              style={[styles.playBtn, { backgroundColor: running ? '#c0392b' : '#e67e22' }]}>
              <ThemedText style={styles.playBtnText}>
                {running ? '■ Stop click' : '▶ Start click'}
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

            <Pressable onPress={onNext} style={styles.nextBtn}>
              <ThemedText style={styles.nextText}>NEXT →</ThemedText>
            </Pressable>
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
    padding: 14,
    gap: Spacing.md,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: Spacing.xs,
  },
  collapsedTempo: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
  collapsedBpm: { fontSize: Type.size['3xl'], fontWeight: Type.weight.heavy, lineHeight: 32 },
  collapsedPlay: { fontSize: Type.size['2xl'], fontWeight: Type.weight.heavy },
  collapsedNextBtn: {
    backgroundColor: Status.warning,
    paddingHorizontal: 14,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
  },
  collapsedNextText: { color: '#fff', fontWeight: Type.weight.black, fontSize: 15 },

  tempoDisplay: { alignItems: 'center' },
  tempoNum: { fontSize: 44, fontWeight: Type.weight.heavy, lineHeight: 48 },
  tempoUnit: { fontSize: Type.size.xs, opacity: Opacity.muted, marginTop: -2 },
  playBtn: {
    borderRadius: Radii.xl,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  playBtnText: {
    color: '#fff',
    fontWeight: Type.weight.black,
    fontSize: Type.size.xl,
    letterSpacing: 0.3,
  },
  subRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
  subChip: {
    borderWidth: Borders.thin,
    borderRadius: Radii['2xl'],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minWidth: 54,
    alignItems: 'center',
  },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  volLabel: { opacity: Opacity.muted, fontSize: 12 },
  nextBtn: {
    backgroundColor: Status.warning,
    borderRadius: Radii.xl,
    paddingVertical: 22,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  nextText: {
    color: '#fff',
    fontWeight: Type.weight.black,
    fontSize: Type.size['2xl'],
    letterSpacing: 0.5,
  },
});
