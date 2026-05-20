import Slider from '@react-native-community/slider';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
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
  initialX?: number;
  initialY?: number;
  // For API parity with FloatingMetronome.web.tsx. `anchor: 'right'` pins
  // the initial X to the right edge of the screen; `defaultCollapsed`
  // mounts the card in its compact state. Both passed through to the
  // useDraggableCard hook.
  anchor?: 'left' | 'right';
  defaultCollapsed?: boolean;
};

const SUBS: Subdivision[] = [1, 2, 3];

const BASE_CARD_W = 240;
const EXPANDED_H = 360;
const COLLAPSED_H = 72;
const BPM_MIN = 30;
const BPM_MAX = 240;

export function FloatingMetronome({
  bpm,
  subdivision,
  running,
  volume,
  onBpm,
  onSubdivision,
  onVolume,
  onToggle,
  initialX,
  initialY = 160,
  anchor = 'left',
  defaultCollapsed = false,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const cardW = useResponsiveCardWidth(BASE_CARD_W);
  const { width: screenW } = useWindowDimensions();
  const resolvedInitialX =
    initialX !== undefined
      ? initialX
      : anchor === 'right'
        ? Math.max(8, screenW - cardW - 8)
        : 8;

  const { collapsed, toggleCollapsed, gesture, animatedStyle } = useDraggableCard({
    cardWidth: cardW,
    expandedHeight: EXPANDED_H,
    collapsedHeight: COLLAPSED_H,
    initialX: resolvedInitialX,
    initialY,
    initialCollapsed: defaultCollapsed,
    initialScale: 0.8,
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
                onLongPress={() => onBpm(Math.max(BPM_MIN, bpm - 5))}
                style={[styles.stepBtn, { borderColor: C.icon }]}>
                <ThemedText style={styles.stepText}>−</ThemedText>
              </Pressable>
              <View style={styles.tempoDisplay}>
                <ThemedText style={styles.tempoNum}>{bpm}</ThemedText>
                <ThemedText style={styles.tempoUnit}>BPM</ThemedText>
              </View>
              <Pressable
                onPress={() => onBpm(Math.min(BPM_MAX, bpm + 1))}
                onLongPress={() => onBpm(Math.min(BPM_MAX, bpm + 5))}
                style={[styles.stepBtn, { borderColor: C.icon }]}>
                <ThemedText style={styles.stepText}>+</ThemedText>
              </Pressable>
            </View>

            <Slider
              style={styles.tempoSlider}
              minimumValue={BPM_MIN}
              maximumValue={BPM_MAX}
              step={1}
              value={bpm}
              onValueChange={onBpm}
              minimumTrackTintColor={C.tint}
              maximumTrackTintColor={C.icon}
              thumbTintColor={C.tint}
            />
            <View style={styles.tempoSliderLabels}>
              <ThemedText style={styles.tempoSliderLabel}>{BPM_MIN}</ThemedText>
              <ThemedText style={styles.tempoSliderLabel}>{BPM_MAX}</ThemedText>
            </View>

            <Pressable
              onPress={onToggle}
              style={[
                styles.playBtn,
                { backgroundColor: running ? '#c0392b' : '#e67e22' },
              ]}>
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
    borderRadius: 16,
    padding: Spacing.md,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    transformOrigin: 'top left',
  },
  dragHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  dragBars: { alignItems: 'center', gap: 3, flex: 1 },
  dragBar: { width: 40, height: 3, borderRadius: 2 },
  collapseBtn: {
    position: 'absolute',
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapseText: { fontSize: Type.size.md, fontWeight: Type.weight.heavy, lineHeight: 16 },

  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  collapsedBpm: { fontSize: Type.size['3xl'], fontWeight: Type.weight.heavy, lineHeight: 32 },
  collapsedUnit: { fontSize: Type.size.xs, fontWeight: Type.weight.semibold },
  collapsedPlay: { fontSize: Type.size['2xl'], fontWeight: Type.weight.heavy },

  tempoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: Type.size['2xl'], fontWeight: Type.weight.bold, lineHeight: 26 },
  tempoDisplay: { alignItems: 'center' },
  tempoNum: { fontSize: 32, fontWeight: Type.weight.heavy, lineHeight: 36 },
  tempoUnit: { fontSize: 10, opacity: Opacity.muted, marginTop: -2 },
  playBtn: {
    borderRadius: Radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  },
  playBtnText: {
    color: '#fff',
    fontWeight: Type.weight.black,
    fontSize: 17,
    letterSpacing: 0.3,
  },
  subRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
  subChip: {
    borderWidth: Borders.thin,
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  volLabel: { opacity: Opacity.muted, fontSize: 12 },
  tempoSlider: { width: '100%', marginTop: -4 },
  tempoSliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -10,
    marginHorizontal: Spacing.sm,
  },
  tempoSliderLabel: { fontSize: 10, opacity: 0.5 },
});
