import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  useMicrobreakTimer,
  useMoveOnTimer,
  usePlayItColdTimer,
} from '@/components/PracticeTimersContext';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function PracticeTimerAlertModal() {
  const moveOn = useMoveOnTimer();
  const microbreak = useMicrobreakTimer();
  const playItCold = usePlayItColdTimer();

  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const anyFiring = moveOn.firing || microbreak.firing || playItCold.firing;

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (microbreak.firing) {
      pulse.value = 1;
      pulse.value = withRepeat(
        withTiming(0.55, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      pulse.value = 1;
    }
  }, [microbreak.firing, pulse]);

  const brainStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!anyFiring) return null;

  return (
    <Modal
      visible={anyFiring}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (moveOn.firing) moveOn.dismiss();
        else if (playItCold.firing) playItCold.dismiss();
      }}>
      {moveOn.firing && (
        <View style={styles.standardBackdrop}>
          <View style={[styles.card, { backgroundColor: C.background }]}>
            <ThemedText type="title" style={styles.centered}>
              Time to move on
            </ThemedText>
            <ThemedText style={[styles.body, { color: C.text }]}>
              Rotate to a different spot. When you come back, try to remember
              exactly what you were working on — that recall is what cements
              the work.
            </ThemedText>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: C.tint }]}
              onPress={moveOn.dismiss}>
              <ThemedText style={styles.primaryText}>Got it</ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {microbreak.firing && (
        <View style={styles.microbreakBackdrop}>
          <Animated.Text style={[styles.brain, brainStyle]}>🧠</Animated.Text>
          <ThemedText style={styles.microbreakCopy}>
            Sit quietly for a moment — your brain is replaying what you just
            practiced, and that&apos;s when it actually sticks.
          </ThemedText>
          <ThemedText style={styles.microbreakCountdown}>
            {microbreak.secondsLeft}s
          </ThemedText>
        </View>
      )}

      {playItCold.firing && playItCold.passage && (
        <View style={styles.coldFullscreen}>
          {playItCold.passage.source_uri && (
            <Image
              source={{ uri: playItCold.passage.source_uri }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
            />
          )}
          <View style={styles.coldBannerTop} pointerEvents="none">
            <ThemedText style={styles.coldBannerTitle}>
              Play it cold — {playItCold.passage.title}
            </ThemedText>
            <ThemedText style={styles.coldBannerBody}>
              Stop what you&apos;re doing. Play this once, on stage. No restarts.
            </ThemedText>
          </View>
          <View style={styles.coldDidItWrap}>
            <Pressable
              style={[styles.coldDidItBtn, { backgroundColor: C.tint }]}
              onPress={playItCold.dismiss}>
              <ThemedText style={styles.primaryText}>Did it</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  standardBackdrop: {
    flex: 1,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radii['2xl'],
    padding: 22,
    gap: 14,
  },
  centered: { textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center', opacity: 0.8 },
  primaryBtn: {
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: Radii.lg,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.lg },

  microbreakBackdrop: {
    flex: 1,
    backgroundColor: '#050607f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: Spacing.xl,
  },
  brain: { fontSize: 140 },
  microbreakCopy: {
    color: '#e8eaed',
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 420,
  },
  microbreakCountdown: {
    color: '#9aa0a6',
    fontSize: Type.size.xl,
    fontWeight: Type.weight.bold,
    marginTop: Spacing.xs,
  },

  coldFullscreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  coldBannerTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: Spacing.md,
    backgroundColor: '#000000cc',
    gap: Spacing.xs,
  },
  coldBannerTitle: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: 17,
    textAlign: 'center',
  },
  coldBannerBody: {
    color: '#d0d4d8',
    fontSize: Type.size.sm,
    lineHeight: 18,
    textAlign: 'center',
  },
  coldDidItWrap: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  coldDidItBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: Radii.pill,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
