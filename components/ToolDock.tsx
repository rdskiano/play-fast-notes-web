// One edge-docked practice tool. A fixed tab sits on a screen edge; tapping
// it pops the tool out as a floating card. The whole card is draggable
// (one finger) and pinch-resizable (two fingers) — plus a small ⊖ / ⊕
// sizer in the top-right corner of the card so a laptop user (mouse, no
// pinch) can resize without two fingers. Two ways to collapse: tapping the
// tab again, or the × in the card's top-left corner (the obvious "put this
// away" control — the resize − was being misread as a close button).
// Tools are independent — several can float at once.
//
// The card stays mounted whether open or closed (only its opacity / scale /
// position change), so a running tool — e.g. the metronome — keeps going
// while collapsed.

import { type ReactNode, useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  /**
   * Phone mode: render as a fixed, full-height panel docked to the edge that
   * springs in/out on tab tap — no dragging, pinching, or resizing. Keeps the
   * tool from feeling like a loose floating card on a small screen.
   */
  docked?: boolean;
  children: ReactNode;
};

const TAB_THICKNESS = 34;
const DURATION = 300;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.6;
const COLLAPSED_SCALE = 0.25;
// Per-tap multiplier for the corner ⊖ / ⊕ sizer. 1.15 = ~5 taps from min
// (0.7) to max (1.6) — granular enough to find the right size, coarse
// enough to not feel tedious.
const SIZER_STEP = 1.15;

// Touch-input detection: hides the corner ⊖/⊕ sizer on phone + iPad +
// any other primarily-touch device. The discrete-step buttons are
// pure clutter where pinch works; they exist for mouse-only laptop
// users who can't pinch. Native is always touch; on web the standard
// pointer media query catches phones, tablets, and mouse-less devices
// while correctly leaving laptops with trackpads (even ones with a
// touchscreen) showing the buttons. Evaluated once at module load —
// input modality almost never changes mid-session.
const IS_TOUCH_DEVICE =
  Platform.OS !== 'web' ||
  (typeof window !== 'undefined' &&
    window.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true);

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
  docked = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  // Keep the docked Modal mounted through the slide-out before unmounting it.
  const [modalShown, setModalShown] = useState(defaultOpen && docked);

  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // A docked panel fills the screen height in landscape (so it covers the
  // header); in portrait it's content-height so it isn't a giant empty strip.
  const dockedLandscape = winW > winH;
  const dockedPanelH = docked && dockedLandscape ? winH : panelHeight;
  // Portrait: start the panel below the status bar / notch so its × close
  // button isn't hidden under the phone's speaker. Landscape fills from y=0.
  const dockedTopY = docked && !dockedLandscape ? insets.top + 6 : 0;

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

  // Docked (phone): the panel renders in a full-screen Modal, so positions are
  // in WINDOW coordinates. It sits flush to the screen edge (the Modal is on
  // top of everything, so no tab gap is needed) and slides in from off-screen.
  const dockedOpenX = edge === 'left' ? 0 : Math.max(0, winW - panelWidth);
  const dockedHiddenX = edge === 'left' ? -panelWidth : winW;

  // Drag clamp — keep most of the card on screen. Same 25/75 rule on
  // every edge so the user can push a card almost out of the way and
  // still have a handle to grab it. The previous minY of 4 made the
  // Metronome card un-draggable upward (it opens near the top of its
  // tab to begin with).
  const minX = -panelWidth * 0.25;
  const maxX = Math.max(minX, containerW - panelWidth * 0.75);
  const minY = -panelHeight * 0.25;
  const maxY = Math.max(minY, containerH - panelHeight * 0.25);

  const tx = useSharedValue(docked ? dockedHiddenX : homeX);
  const ty = useSharedValue(homeY);
  // Docked panels never shrink-into-tab — they're full size, sliding only.
  const scale = useSharedValue(docked ? 1 : COLLAPSED_SCALE);
  const op = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);

  useEffect(() => {
    if (docked) {
      // Slide in from the edge with a little spring "bounce"; slide back out.
      if (open) {
        tx.value = withSpring(dockedOpenX, { damping: 18, stiffness: 180, mass: 0.7 });
        ty.value = withTiming(dockedTopY, { duration: DURATION });
        op.value = withTiming(1, { duration: DURATION });
      } else {
        tx.value = withTiming(dockedHiddenX, { duration: DURATION });
        op.value = withTiming(0, { duration: DURATION });
      }
      return;
    }
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
  }, [open, openX, openY, homeX, homeY, tx, ty, scale, op, docked, dockedOpenX, dockedHiddenX, dockedTopY]);

  // Mount the docked Modal on open; keep it mounted through the slide-out
  // animation, then unmount. (Non-docked ignores this.)
  useEffect(() => {
    if (!docked) return;
    if (open) {
      setModalShown(true);
      return;
    }
    const t = setTimeout(() => setModalShown(false), DURATION + 60);
    return () => clearTimeout(t);
  }, [open, docked]);

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

  // Discrete-step resizer for mouse / keyboard users (no pinch). One tap
  // multiplies scale by SIZER_STEP (or its inverse), clamped to the same
  // [MIN_SCALE, MAX_SCALE] band the pinch uses, so both interactions
  // share one source of truth.
  function bumpSize(direction: 1 | -1) {
    const factor = direction === 1 ? SIZER_STEP : 1 / SIZER_STEP;
    const next = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, scale.value * factor),
    );
    scale.value = withTiming(next, { duration: 160 });
  }

  const cardStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  // Docked panels sit flush to their edge — drop the rounded corners and
  // border on the edge that meets the screen so it reads as attached.
  const dockedRadius = !docked
    ? null
    : edge === 'right'
      ? styles.dockedRight
      : styles.dockedLeft;

  const card = (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[
        styles.card,
        {
          width: panelWidth,
          height: docked ? dockedPanelH : panelHeight,
          backgroundColor: panelBg,
          borderColor,
        },
        dockedRadius,
        cardStyle,
      ]}>
      {children}
          {/* Top-left collapse affordance. A plain × that flies the card
              back into its tab — the unambiguous "put this away" control.
              Shown on every device (touch + mouse): the edge tab also
              toggles, but users reach for an X on the thing itself. Kept
              clear of the top-right resize ⊖/⊕ so the two don't get
              confused (the old failure mode was tapping − to "close" and
              just shrinking the card). */}
          <View pointerEvents="box-none" style={styles.closeWrap}>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={8}
              accessibilityLabel={`Collapse ${label}`}
              style={styles.closeBtn}>
              <ThemedText style={styles.closeGlyph}>×</ThemedText>
            </Pressable>
          </View>
          {/* Top-right resize affordance. Sits inside the scaled card
              so it shrinks / grows with everything else. `box-none`
              lets taps that miss the buttons fall through to the
              gesture detector (so a stray drag-attempt on the card's
              top corner still pans the card). Hidden on any touch
              device (phone, iPad, etc.) — pinch is the native gesture
              there, and the +/− buttons just steal corner pixels from
              the tool itself. Mouse-only laptops still get them. */}
          {!IS_TOUCH_DEVICE && !docked && (
            <View pointerEvents="box-none" style={styles.sizerWrap}>
              <Pressable
                onPress={() => bumpSize(-1)}
                hitSlop={4}
                accessibilityLabel="Shrink tool"
                style={styles.sizerBtn}>
                <ThemedText style={styles.sizerGlyph}>−</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => bumpSize(1)}
                hitSlop={4}
                accessibilityLabel="Enlarge tool"
                style={styles.sizerBtn}>
                <ThemedText style={styles.sizerGlyph}>+</ThemedText>
              </Pressable>
            </View>
          )}
    </Animated.View>
  );

  return (
    <>
      {/* Docked (phone): render the panel in a full-screen Modal so it overlays
          the header and the global help button — escaping the content box it
          would otherwise be clipped to. Non-docked stays an in-layer draggable
          card. The transparent, box-none backdrop leaves the rest of the
          screen visible and (on web) interactive. */}
      {docked ? (
        <Modal
          visible={modalShown}
          transparent
          animationType="none"
          onRequestClose={() => setOpen(false)}>
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {card}
          </View>
        </Modal>
      ) : (
        <GestureDetector gesture={composed}>{card}</GestureDetector>
      )}

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
  // Docked-panel edge treatment: square off + drop the border on the side
  // flush against the screen edge.
  dockedRight: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  dockedLeft: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderLeftWidth: 0,
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

  // Collapse button — top-left, mirror of the resize cluster. Slightly
  // more present than the dim sizers since it's the primary "put away"
  // action and needs to read on both light and dark tool palettes.
  closeWrap: {
    position: 'absolute',
    top: 4,
    left: 4,
    zIndex: 10,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000040',
  },
  closeGlyph: {
    color: '#ffffffe6',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },

  // Corner size buttons — small, dim, top-right so they stay out of the
  // way of the tool's own controls. The wrapper is `box-none` so taps
  // that miss either button fall through to the underlying pan/pinch
  // gesture.
  sizerWrap: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    gap: 2,
    zIndex: 10,
  },
  sizerBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000033',
  },
  sizerGlyph: {
    color: '#ffffffcc',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
  },
});
