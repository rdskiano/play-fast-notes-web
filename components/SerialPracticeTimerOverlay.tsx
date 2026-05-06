// Floating bottom bar that shows the current Serial Practice Timer-mode
// countdown on every screen the user can navigate to mid-session — Tempo
// Ladder, Click-Up, Rhythmic Variation, Exercise Builder, Chunking,
// Self-Led, etc. Without this, the user launches a strategy from Serial
// Practice and loses sight of how much time is left on the current passage.
//
// Hidden when:
//   - There is no active session.
//   - The session is in Consistency mode (no countdown to show).
//   - The user is already on /interleaved (which renders its own bar in
//     the same position).
//
// Tap the Next button to advance the singleton's passage and pop back to
// /interleaved so the user sees the new passage's strategy launchers.

import { usePathname, useRouter } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getSnapshot,
  nextPassage,
  subscribe,
} from '@/lib/sessions/serialPractice';

function formatLabel(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function SerialPracticeTimerOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const session = useSyncExternalStore(subscribe, getSnapshot, () => null);

  if (!session) return null;
  if (session.mode !== 'timer') return null;
  // /interleaved renders its own bar, so we don't double up.
  if (pathname === '/interleaved') return null;

  const cur = session.spots[session.currentIndex];
  const timeLabel = formatLabel(session.secondsLeft);
  const isLast = session.visitedCount >= session.spots.length;

  function onNext() {
    nextPassage();
    // Pop back to the Serial Practice screen so the user sees the new
    // passage's strategy launchers and (if on the last passage) the
    // celebration / save flow.
    router.replace('/interleaved' as never);
  }

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: session.timerExpired ? '#c0392b' : C.tint,
          },
        ]}>
        <ThemedText style={styles.label} numberOfLines={1}>
          {session.timerExpired ? "Time's up · " : `${timeLabel} · `}
          {cur?.passage.title ?? ''}
        </ThemedText>
        <Pressable onPress={onNext} style={styles.nextBtn}>
          <ThemedText style={styles.nextText}>
            {isLast ? 'Finish session →' : 'Next →'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.lg,
    // Right padding clears the floating Feedback bubble at bottom-right.
    paddingRight: 160,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  label: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.lg,
    flex: 1,
  },
  nextBtn: {
    backgroundColor: '#ffffff22',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
    borderColor: '#fff',
  },
  nextText: {
    color: '#fff',
    fontWeight: Type.weight.bold,
    fontSize: Type.size.sm,
  },
});
