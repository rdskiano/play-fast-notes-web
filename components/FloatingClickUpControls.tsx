import Slider from '@react-native-community/slider';
import { Pressable, StyleSheet, View } from 'react-native';
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
  onSubdivision: (s: Subdivision) => void;
  onVolume: (v: number) => void;
  onToggle: () => void;
  onNext: () => void;
};

const SUBS: Subdivision[] = [1, 2, 3];

const BASE_CARD_W = 280;
const EXPANDED_H = 420;
const COLLAPSED_H = 72;

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
  const cardW = useResponsiveCardWidth(BASE_CARD_W);

  const { collapsed, toggleCollapsed, gesture, animatedStyle } = useDraggableCard({
    cardWidth: cardW,
    expandedHeight: EXPANDED_H,
    collapsedHeight: COLLAPSED_H,
    initialX: 8,
    initialScale: 0.8,
    // SessionTopBar + the play-helper instruction line sit above the score,
    // so reserve room for both.
    topInset: 100,
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
          <View style={styles.collapsedRow}>
            <Pressable onPress={onToggle} style={styles.collapsedTempo}>
              <ThemedText style={styles.collapsedBpm}>{bpm}</ThemedText>
              <ThemedText
                style={[styles.collapsedPlay, { color: running ? '#2ecc71' : C.tint }]}>
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
              <Slider
                style={{ flex: 1 }}
                minimumValue={0}
                maximumValue={1}
                value={volume}
                onValueChange={onVolume}
                minimumTrackTintColor={C.tint}
                maximumTrackTintColor={C.icon}
                thumbTintColor={C.tint}
              />
            </View>

            <Pressable onPress={onNext} style={styles.nextBtn}>
              <ThemedText style={styles.nextText}>NEXT →</ThemedText>
            </Pressable>
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
  nextBtn: {
    backgroundColor: Status.warning,
    borderRadius: Radii.xl,
    paddingVertical: 22,
    alignItems: 'center',
    marginTop: Spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  nextText: { color: '#fff', fontWeight: Type.weight.black, fontSize: Type.size['2xl'], letterSpacing: 0.5 },
});
