import { Pressable, StyleSheet, View } from 'react-native';

import { VolumeSlider } from '@/components/VolumeSlider';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDraggableCard } from '@/hooks/useDraggableCard';
import { useResponsiveCardWidth } from '@/hooks/useResponsiveCardWidth';
import { SubdivisionGlyph } from '@/components/SubdivisionGlyph';
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

const BASE_CARD_W = 300;
const EXPANDED_H = 420;
const BPM_MIN = 30;
const BPM_MAX = 240;
const COLLAPSED_H = 72;

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
  const cardW = useResponsiveCardWidth(BASE_CARD_W);

  const { collapsed, toggleCollapsed, gesture, animatedStyle } = useDraggableCard({
    cardWidth: cardW,
    expandedHeight: EXPANDED_H,
    collapsedHeight: COLLAPSED_H,
    initialX: 8,
    initialY: 80,
    initialScale: 0.8,
    // Allow dragging up close to the SessionTopBar so a full-page score has room.
    topInset: 24,
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.card,
          animatedStyle,
          {
            width: cardW,
            backgroundColor: scheme === 'dark' ? '#1f2123ee' : '#ffffffee',
            borderColor: C.icon,
          },
        ]}>
        <View style={styles.dragHandle}>
          <View style={styles.dragBars}>
            <View style={[styles.dragBar, { backgroundColor: C.icon }]} />
            <View style={[styles.dragBar, { backgroundColor: C.icon }]} />
          </View>
          <Pressable
            onPress={toggleCollapsed}
            hitSlop={10}
            style={[styles.collapseBtn, { borderColor: C.icon }]}>
            <ThemedText style={[styles.collapseText, { color: C.text }]}>
              {collapsed ? '▾' : '▴'}
            </ThemedText>
          </Pressable>
        </View>

        {collapsed ? (
          <Pressable onPress={onToggle} style={styles.collapsedRow}>
            <ThemedText style={styles.collapsedBpm}>{bpm}</ThemedText>
            <ThemedText style={[styles.collapsedUnit, { color: C.icon }]}>BPM</ThemedText>
            <ThemedText
              style={[styles.collapsedPlay, { color: running ? '#2ecc71' : C.tint }]}>
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
                <ThemedText style={[styles.nudgeText, { color: C.icon }]}>
                  −1
                </ThemedText>
              </Pressable>
              <View style={styles.tempoDisplay}>
                <ThemedText style={styles.tempoNum}>{bpm}</ThemedText>
                <ThemedText style={styles.tempoUnit}>BPM</ThemedText>
              </View>
              <Pressable
                onPress={() => onBpm(Math.min(BPM_MAX, bpm + 1))}
                hitSlop={6}
                style={[styles.nudgeBtn, { borderColor: C.icon }]}>
                <ThemedText style={[styles.nudgeText, { color: C.icon }]}>
                  +1
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText style={[styles.ladderHint, { color: C.icon }]}>
              Tempo moves up automatically when you hit your Clean streak.
            </ThemedText>

            <Pressable
              onPress={onToggle}
              style={[
                styles.playBtn,
                { backgroundColor: running ? '#c0392b' : '#e67e22' },
              ]}>
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
                  <SubdivisionGlyph subdivision={s} />
                </Pressable>
              ))}
            </View>

            <View style={styles.volRow}>
              <ThemedText style={styles.volLabel}>vol</ThemedText>
              <VolumeSlider
                value={volume}
                onChange={onVolume}
                minimumTrackTintColor={C.tint}
                maximumTrackTintColor={C.icon}
                thumbTintColor={C.tint}
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
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: Borders.thin,
    borderRadius: Radii['2xl'],
    padding: 14,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    transformOrigin: 'top left',
  },
  dragHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
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

  tempoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },

  volRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  volLabel: { opacity: Opacity.muted, fontSize: 12 },

  repRow: { flexDirection: 'row', gap: 10, marginTop: Spacing.xs },
  repBtn: {
    flex: 1,
    borderRadius: Radii.xl,
    paddingVertical: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  cleanBtn: { backgroundColor: Status.success },
  missBtn: { backgroundColor: '#e74c3c' },
  repText: { color: '#fff', fontWeight: Type.weight.black, fontSize: 20, letterSpacing: 0.3 },
});
