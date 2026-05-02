import { Pressable, StyleSheet, View } from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Choice = { n: number; abc: string; w: number };

export const GROUPING_CHOICES: Choice[] = [
  { n: 3, abc: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB', w: 70 },
  { n: 4, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBB', w: 90 },
  { n: 5, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBB', w: 100 },
  { n: 6, abc: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB BBB', w: 120 },
  { n: 7, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBBBB', w: 130 },
  { n: 8, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBBBBB', w: 140 },
];

type Props = {
  /** Currently chosen grouping, used to highlight the pill. */
  selected?: number;
  onSelect: (n: number) => void;
};

export function GroupingPicker({ selected, onSelect }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  return (
    <View style={styles.grid}>
      {GROUPING_CHOICES.map(({ n, abc, w }) => {
        const active = selected === n;
        return (
          <Pressable
            key={n}
            onPress={() => onSelect(n)}
            style={[
              styles.pill,
              {
                borderColor: active ? C.tint : C.icon,
                backgroundColor: active ? C.tint + '22' : 'transparent',
              },
            ]}>
            <AbcStaffView abc={abc} width={w} height={60} hideStaffLines centered />
            <ThemedText
              style={{
                fontSize: 18,
                fontWeight: '800',
                color: active ? C.tint : C.text,
                marginTop: -4,
              }}>
              {n}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginVertical: 10,
  },
  pill: {
    width: '47%',
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
});
