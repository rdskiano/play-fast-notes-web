import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { RhythmNotation } from '@/components/RhythmNotation';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDraggableCard } from '@/hooks/useDraggableCard';
import { useResponsiveCardWidth } from '@/hooks/useResponsiveCardWidth';
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

const BASE_CARD_W = 440;
const EXPANDED_H = 265;
const COLLAPSED_H = 68;

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
  const cardW = useResponsiveCardWidth(BASE_CARD_W);

  const { collapsed, toggleCollapsed, gesture, animatedStyle } = useDraggableCard({
    cardWidth: cardW,
    expandedHeight: EXPANDED_H,
    collapsedHeight: COLLAPSED_H,
    initialX: 9999,
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

        <View style={styles.metaRow}>
          <ThemedText style={[styles.metaValue, { color: C.icon }]}>
            {patternIndex + 1}/{patternCount}
          </ThemedText>
          <View style={styles.metaDot} />
          <ThemedText style={styles.metaLabel}>Time</ThemedText>
          <ThemedText style={styles.metaValue}>{pattern.timeSig}</ThemedText>
          {pattern.beaming && pattern.beaming !== '0' && (
            <>
              <View style={styles.metaDot} />
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
              style={[styles.navBtnCompact, { borderColor: C.tint, opacity: canPrev ? 1 : 0.3 }]}>
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
              <RhythmNotation pattern={pattern} width={400} height={100} />
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
    gap: 10,
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

  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, justifyContent: 'center' },
  metaLabel: { opacity: 0.5, fontSize: Type.size.xs, fontWeight: Type.weight.semibold },
  metaValue: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#88888888', marginHorizontal: 2 },

  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: Spacing.xs,
  },
  hearBtnCompact: {
    flex: 1,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  navBtnCompact: {
    width: 60,
    borderWidth: Borders.thick,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },

  rhythmBox: {
    borderWidth: Borders.thin,
    borderColor: '#88888855',
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hearBtn: {
    borderRadius: Radii.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  hearText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 15 },

  navRow: { flexDirection: 'row', gap: Spacing.sm },
  navBtn: {
    flex: 1,
    borderWidth: Borders.thick,
    borderRadius: Radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextBtn: { backgroundColor: '#9b59b6', borderColor: '#6c3483' },
  navText: { fontWeight: Type.weight.heavy, fontSize: 15 },
});
