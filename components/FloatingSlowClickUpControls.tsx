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
  onBpm: (v: number) => void;
  onSubdivision: (s: Subdivision) => void;
  onVolume: (v: number) => void;
  onToggle: () => void;
  onClean: () => void;
  onMiss: () => void;
};

const SUBS: Subdivision[] = [1, 2, 3];
const SUB_LABEL: Record<Subdivision, string> = { 1: '♩', 2: '♫', 3: '3' };

const CARD_W = 300;
const BPM_MIN = 30;
const BPM_MAX = 240;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.6;

export function FloatingSlowClickUpControls({
  bpm,
  subdivision,
  running,
  volume,
  onBpm,
  onSubdivision,
  onVolume,
  onToggle,
  onClean,
  onMiss,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState({ x: 12, y: 80 });
  const [scale, setScale] = useState(0.9);

  // Track active pointers on the card so we can disambiguate one-finger drag
  // from two-finger pinch. Drag only activates if the gesture started on the
  // drag handle (handleStartedRef); pinch activates whenever a second pointer
  // joins, regardless of where it started.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const handleStartedRef = useRef(false);
  const dragBaseRef = useRef<{ x: number; y: number } | null>(null);
  const pinchBaseRef = useRef<{ dist: number; scale: number } | null>(null);

  function pinchDistance(): number {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return 0;
    const [a, b] = pts;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  // Pinch can start anywhere on the card, so we attach its listeners to the
  // outer card div. Drag starts only from the handle.
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    function onPointerDown(e: PointerEvent) {
      // Track every pointer that lands on the card. We never preventDefault
      // here so the underlying buttons / sliders / Pressables still receive
      // their events.
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size === 2) {
        // Second finger down → start pinch. Cancel any in-flight drag.
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
      if (pointersRef.current.size < 2) {
        pinchBaseRef.current = null;
      }
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

  // Trackpad pinch (Mac Safari/Chrome): the browser fires wheel events with
  // ctrlKey=true while the user pinches. Convert deltaY into a small scale
  // delta so trackpad users without a touchscreen still get pinch-to-resize.
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
      // If a second pointer is already down, this is a pinch — let the card
      // listener handle it and skip drag.
      if (pointersRef.current.size >= 2) return;
      e.preventDefault();
      handleStartedRef.current = true;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      dragBaseRef.current = { x: pos.x, y: pos.y };

      function onMove(ev: PointerEvent) {
        // If a second finger arrived, drop drag in favour of pinch.
        if (pointersRef.current.size >= 2 || !dragBaseRef.current) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const cw = CARD_W * scale;
        const nextX = Math.max(0, Math.min(w - cw, dragBaseRef.current.x + (ev.clientX - startX)));
        const nextY = Math.max(0, Math.min(h - 100, dragBaseRef.current.y + (ev.clientY - startY)));
        setPos({ x: nextX, y: nextY });
      }
      function onUp() {
        handleStartedRef.current = false;
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
                <ThemedText style={[styles.nudgeText, { color: C.icon }]}>−1</ThemedText>
              </Pressable>
              <View style={styles.tempoDisplay}>
                <ThemedText style={styles.tempoNum}>{bpm}</ThemedText>
                <ThemedText style={styles.tempoUnit}>BPM</ThemedText>
              </View>
              <Pressable
                onPress={() => onBpm(Math.min(BPM_MAX, bpm + 1))}
                hitSlop={6}
                style={[styles.nudgeBtn, { borderColor: C.icon }]}>
                <ThemedText style={[styles.nudgeText, { color: C.icon }]}>+1</ThemedText>
              </Pressable>
            </View>
            <ThemedText style={[styles.ladderHint, { color: C.icon }]}>
              Tempo moves up automatically when you hit your Clean streak.
            </ThemedText>

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

            <View style={styles.repRow}>
              <Pressable onPress={onClean} style={[styles.repBtn, styles.cleanBtn]}>
                <ThemedText style={styles.repText}>Clean ✓</ThemedText>
              </Pressable>
              <Pressable onPress={onMiss} style={[styles.repBtn, styles.missBtn]}>
                <ThemedText style={styles.repText}>Miss ✗</ThemedText>
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
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: Spacing.xs,
  },
  collapsedBpm: { fontSize: 32, fontWeight: Type.weight.heavy, lineHeight: 36 },
  collapsedUnit: { fontSize: 12, fontWeight: Type.weight.semibold },
  collapsedPlay: { fontSize: Type.size.xl, fontWeight: Type.weight.heavy },

  tempoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nudgeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: Opacity.subtle,
  },
  nudgeText: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  ladderHint: {
    textAlign: 'center',
    fontSize: Type.size.xs,
    opacity: Opacity.subtle,
    marginTop: -4,
  },
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

  repRow: { flexDirection: 'row', gap: 10, marginTop: Spacing.xs },
  repBtn: {
    flex: 1,
    borderRadius: Radii.xl,
    paddingVertical: 22,
    alignItems: 'center',
  },
  cleanBtn: { backgroundColor: Status.success },
  missBtn: { backgroundColor: '#e74c3c' },
  repText: { color: '#fff', fontWeight: Type.weight.black, fontSize: 20, letterSpacing: 0.3 },
});
