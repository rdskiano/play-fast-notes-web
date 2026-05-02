import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Borders, Spacing, Type } from '@/constants/tokens';

/**
 * Horizontally scrollable full 88-key piano keyboard (A0 → C8).
 *
 * Layout: white keys laid out in a row at the bottom; black keys
 * absolutely positioned on top, straddling the gaps between whites
 * with the classic C-D-E / F-G-A-B pattern.
 *
 * Middle C (MIDI 60) is visually highlighted and the scroll view
 * auto-scrolls to it on mount so the user is oriented.
 */

type Props = {
  /** Lowest MIDI note to display (inclusive). Default 21 = A0. */
  startMidi?: number;
  /** Highest MIDI note to display (inclusive). Default 108 = C8. */
  endMidi?: number;
  /** Called when a key is pressed with its MIDI note number. */
  onKeyPress: (midi: number) => void;
  /** White key width in pt. */
  whiteKeyWidth?: number;
  /** Keyboard height in pt. */
  height?: number;
  /** Label black keys with sharp names (C♯) vs flat names (D♭). */
  preferSharps?: boolean;
};

const BLACK_LABELS_SHARP: Record<number, string> = {
  1: 'C♯',
  3: 'D♯',
  6: 'F♯',
  8: 'G♯',
  10: 'A♯',
};
const BLACK_LABELS_FLAT: Record<number, string> = {
  1: 'D♭',
  3: 'E♭',
  6: 'G♭',
  8: 'A♭',
  10: 'B♭',
};

// Which pc values are black keys
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
function isBlackKey(midi: number): boolean {
  return BLACK_PCS.has(((midi % 12) + 12) % 12);
}

const NOTE_LETTERS: Record<number, string> = {
  0: 'C',
  2: 'D',
  4: 'E',
  5: 'F',
  7: 'G',
  9: 'A',
  11: 'B',
};

const MIDDLE_C = 60;

export function PianoKeyboard({
  startMidi = 21,
  endMidi = 108,
  onKeyPress,
  whiteKeyWidth = 38,
  height = 180,
  preferSharps = true,
}: Props) {
  const [pressed, setPressed] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Pre-compute white and black key positions
  const whites: number[] = [];
  const blacks: { midi: number; leftFromWhiteIndex: number }[] = [];
  let whiteIndex = 0;
  let middleCWhiteIndex = -1;
  for (let m = startMidi; m <= endMidi; m++) {
    if (isBlackKey(m)) {
      blacks.push({ midi: m, leftFromWhiteIndex: whiteIndex });
    } else {
      if (m === MIDDLE_C) middleCWhiteIndex = whiteIndex;
      whites.push(m);
      whiteIndex += 1;
    }
  }

  const totalWidth = whites.length * whiteKeyWidth;
  const blackKeyWidth = whiteKeyWidth * 0.62;
  const blackKeyHeight = height * 0.62;

  // Auto-scroll to middle C on mount (offset left by ~half a screen so it lands
  // centered-ish in whatever viewport width the ScrollView has).
  useEffect(() => {
    if (middleCWhiteIndex < 0) return;
    const id = setTimeout(() => {
      const x = Math.max(0, middleCWhiteIndex * whiteKeyWidth - 180);
      scrollRef.current?.scrollTo({ x, animated: false });
    }, 0);
    return () => clearTimeout(id);
  }, [middleCWhiteIndex, whiteKeyWidth]);

  function handlePress(midi: number) {
    onKeyPress(midi);
    setPressed(midi);
    setTimeout(() => setPressed((p) => (p === midi ? null : p)), 180);
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator
      style={{ flexGrow: 0 }}>
      <View style={[styles.wrap, { width: totalWidth, height }]}>
        {/* White keys row */}
        <View style={styles.whiteRow}>
          {whites.map((midi) => {
            const letter = NOTE_LETTERS[((midi % 12) + 12) % 12] ?? '';
            const octave = Math.floor(midi / 12) - 1;
            const isC = letter === 'C';
            const isMiddleC = midi === MIDDLE_C;
            const isActive = pressed === midi;
            return (
              <Pressable
                key={midi}
                onPress={() => handlePress(midi)}
                style={[
                  styles.whiteKey,
                  {
                    width: whiteKeyWidth,
                    height,
                    backgroundColor: isActive
                      ? '#9b59b6'
                      : isMiddleC
                        ? '#fff6d5' // soft yellow highlight
                        : '#ffffff',
                    borderColor: isMiddleC ? '#d4a017' : '#333',
                    borderWidth: isMiddleC ? 2 : 1,
                  },
                ]}>
                {isMiddleC && (
                  <View style={styles.middleCDot}>
                    <ThemedText style={styles.middleCLabel}>Middle C</ThemedText>
                  </View>
                )}
                <ThemedText
                  style={[
                    styles.whiteLabel,
                    { color: isActive ? '#fff' : '#555' },
                  ]}>
                  {letter}
                  {isC ? octave : ''}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {/* Black keys absolutely positioned on top */}
        {blacks.map((b) => {
          const left =
            b.leftFromWhiteIndex * whiteKeyWidth - blackKeyWidth / 2;
          const isActive = pressed === b.midi;
          const pc = ((b.midi % 12) + 12) % 12;
          const label = preferSharps
            ? BLACK_LABELS_SHARP[pc]
            : BLACK_LABELS_FLAT[pc];
          return (
            <Pressable
              key={b.midi}
              onPress={() => handlePress(b.midi)}
              style={[
                styles.blackKey,
                {
                  left,
                  width: blackKeyWidth,
                  height: blackKeyHeight,
                  backgroundColor: isActive ? '#9b59b6' : '#111',
                  borderColor: '#000',
                },
              ]}>
              <ThemedText style={styles.blackLabel}>{label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  whiteRow: {
    flexDirection: 'row',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  whiteKey: {
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Spacing.sm,
  },
  whiteLabel: {
    fontSize: 12,
    fontWeight: Type.weight.bold,
  },
  middleCDot: {
    position: 'absolute',
    top: Spacing.sm,
    alignItems: 'center',
    alignSelf: 'center',
  },
  middleCLabel: {
    fontSize: 8,
    fontWeight: Type.weight.heavy,
    color: '#a06a00',
    transform: [{ rotate: '-90deg' }],
    width: 60,
    textAlign: 'center',
  },
  blackKey: {
    position: 'absolute',
    top: 0,
    borderWidth: Borders.thin,
    borderRadius: 3,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  blackLabel: {
    fontSize: 9,
    fontWeight: Type.weight.bold,
    color: '#fff',
  },
});
