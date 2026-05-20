import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

type Props = {
  value: number;
  onChange: (v: number) => void;
  minimumTrackTintColor: string;
  maximumTrackTintColor: string;
  thumbTintColor: string;
  style?: StyleProp<ViewStyle>;
};

// Five-step volume control. Replaces @react-native-community/slider, which on
// iOS + New Architecture ignores its `value` prop entirely (the thumb sticks
// pinned to one end no matter what value is passed — at mount AND on update).
//
// A segmented control is fully deterministic: the filled-segment count is
// purely value-derived, nothing to mis-initialise. It's built from plain
// Pressables, which already work inside the floating card's drag gesture —
// a custom pan-driven slider would conflict with that gesture and need extra
// wiring to win the touch.
//
// thumbTintColor is accepted for call-site compatibility with the old Slider
// API but unused (no thumb in a segmented control).
const LEVELS = [0.2, 0.4, 0.6, 0.8, 1.0];

export function VolumeSlider({
  value,
  onChange,
  minimumTrackTintColor,
  maximumTrackTintColor,
  style,
}: Props) {
  return (
    <View style={[styles.row, style]}>
      {LEVELS.map((level) => {
        const active = value >= level - 0.0001;
        return (
          <Pressable
            key={level}
            onPress={() => onChange(level)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.segment,
              {
                backgroundColor: active
                  ? minimumTrackTintColor
                  : maximumTrackTintColor + '33',
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, flex: 1, alignItems: 'center' },
  segment: { flex: 1, height: 22, borderRadius: 4 },
});
