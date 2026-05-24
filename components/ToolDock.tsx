// One edge-docked practice tool. A fixed tab sits on a screen edge; tapping
// it pops the tool out as a floating card. The whole card is draggable
// (one finger) and pinch-resizable (two fingers) — there is no header bar.
// Tapping the tab again collapses the card: it flies back into its tab.
// Tools are independent — several can float at once.
//
// The card stays mounted whether open or closed (only its opacity / scale /
// position change), so a running tool — e.g. the metronome — keeps going
// while collapsed.

import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';

export type DockEdge = 'left' | 'right';

type Props = {
  edge: DockEdge;
  label: string;
  accent: string;
  tabTop: number;
  tabSpan: number;
  panelWidth: number;
  panelHeight: number;
  panelBg: string;
  borderColor: string;
  containerW: number;
  containerH: number;
  /** Start with the panel already popped out (used on practice screens). */
  defaultOpen?: boolean;
  children: ReactNode;
};

const TAB_THICKNESS = 34;
const DURATION = 300;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.6;
const COLLAPSED_SCALE = 0.25;

export function ToolDock({
  edge,
  label,
  accent,
  tabTop,
  tabSpan,
  panelWidth,
  panelHeight,
  panelBg,
  borderColor,
  containerW,
  containerH,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const tabCenterY = tabTop + tabSpan / 2;

  // Collapsed "home": card shrunk into the centre of its tab.
  const homeX =
    (edge === 'left' ? TAB_THICKNESS / 2 : containerW - TAB_THICKNESS / 2) -
    panelWidth / 2;
  const homeY = tabCenterY - panelHeight / 2;

  // Opened: card placed just inboard of the tab column.
  const openX =
    edge === 'left'
      ? TAB_THICKNESS + 14
      : Math.max(8, containerW - panelWidth - TAB_THICKNESS - 14);
  const openY = Math.min(
    Math.max(12, tabCenterY - panelHeight / 2),
    Math.max(12, containerH - panelHeight - 12),
  );

  // Drag clamp — keep most of the card on screen.
  const minX = -panelWidth * 0.25;
  const maxX = Math.max(minX, containerW - panelWidth * 0.75);
  const minY = 4;
  const maxY = Math.max(minY, containerH - 56);

  const tx = useSharedValue(homeX);
  const ty = useSharedValue(homeY);
  const scale = useSharedValue(COLLAPSED_SCALE);
  const op = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);

  useEffect(() => {
    if (open) {
      tx.value = withTiming(openX, { duration: DURATION });
      ty.value = withTiming(openY, { duration: DURATION });
      scale.value = withTiming(1, { duration: DURATION });
      op.value = withTiming(1, { duration: DURATION });
    } else {
      tx.value = withTiming(homeX, { duration: DURATION });
      ty.value = withTiming(homeY, { duration: DURATION });
      scale.value = withTiming(COLLAPSED_SCALE, { duration: DURATION });
      op.value = withTiming(0, { duration: DURATION });
    }
  }, [open, openX, openY, homeX, homeY, tx, ty, scale, op]);

  // One finger drags the whole card; two fingers pinch-resize it.
  const pan = Gesture.Pan()
    .minDistance(10)
    .maxPointers(1)
    .onStart(() => {
      'worklet';
      startX.value = tx.value;
      startY.value = ty.value;
    })
    .onUpdate((e) => {
      'worklet';
      tx.value = Math.max(minX, Math.min(maxX, startX.value + e.translationX));
      ty.value = Math.max(minY, Math.min(maxY, startY.value + e.translationY));
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      'worklet';
      scale.value = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, startScale.value * e.scale),
      );
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <>
      <GestureDetector gesture={composed}>
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[
            styles.card,
            {
              width: panelWidth,
              height: panelHeight,
              backgroundColor: panelBg,
              borderColor,
            },
            cardStyle,
          ]}>
          {children}
        </Animated.View>
      </GestureDetector>

      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={[
          styles.tab,
          { top: tabTop, height: tabSpan, backgroundColor: accent },
          edge === 'left' ? styles.tabLeft : styles.tabRight,
        ]}>
        {tabSpan <= TAB_THICKNESS + 4 ? (
          // Phone density: square tab with an upright icon. No rotation —
          // the label is a single emoji and rotating it would just be
          // confusing.
          <ThemedText style={styles.tabIcon}>{label}</ThemedText>
        ) : (
          // Full label rendered in an absolutely-positioned wrapper sized
          // to the rotated tab footprint. Centering + rotating the wrapper
          // (rather than the text) avoids RN-Web shrinking the text's
          // width to the 34px Pressable, which clipped "METRONOME" /
          // "RECORDER" on web.
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: tabSpan,
              height: TAB_THICKNESS,
              left: (TAB_THICKNESS - tabSpan) / 2,
              top: (tabSpan - TAB_THICKNESS) / 2,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: edge === 'left' ? '-90deg' : '90deg' }],
            }}>
            <ThemedText numberOfLines={1} style={styles.tabLabel}>
              {label}
            </ThemedText>
          </View>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
  tab: {
    position: 'absolute',
    width: TAB_THICKNESS,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  tabLeft: { left: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  tabRight: { right: 0, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  tabLabel: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  tabIcon: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'center',
  },
});
