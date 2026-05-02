import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type DropdownOption<T extends string = string> = {
  id: T;
  label: string;
};

type Props<T extends string = string> = {
  label: string;
  valueId: T;
  options: DropdownOption<T>[];
  onChange: (id: T) => void;
  /** Title shown in the picker modal header. */
  pickerTitle?: string;
};

export function DropdownField<T extends string = string>({
  label,
  valueId,
  options,
  onChange,
  pickerTitle,
}: Props<T>) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [open, setOpen] = useState(false);

  const current = options.find((o) => o.id === valueId);

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.button, { borderColor: C.icon }]}>
        <ThemedText style={styles.value} numberOfLines={1}>
          {current?.label ?? '—'}
        </ThemedText>
        <ThemedText style={[styles.chevron, { color: C.icon }]}>▾</ThemedText>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: C.background }]}>
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              {pickerTitle ?? label}
            </ThemedText>
            <ScrollView style={{ maxHeight: 380 }}>
              {options.map((o) => {
                const active = o.id === valueId;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    style={[
                      styles.row,
                      {
                        borderColor: C.icon + '55',
                        backgroundColor: active ? C.tint + '22' : 'transparent',
                      },
                    ]}>
                    <ThemedText
                      style={{
                        fontWeight: active ? '800' : '500',
                        color: active ? C.tint : C.text,
                      }}>
                      {o.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setOpen(false)} style={styles.cancel}>
              <ThemedText style={{ color: C.tint, fontWeight: '700' }}>Cancel</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  label: { opacity: 0.7, fontSize: 12, fontWeight: Type.weight.semibold },
  button: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontSize: Type.size.lg, fontWeight: Type.weight.semibold, flex: 1 },
  chevron: { fontSize: Type.size.md, marginLeft: Spacing.sm },

  backdrop: {
    flex: 1,
    backgroundColor: Overlays.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 18,
    gap: Spacing.md,
  },
  row: {
    paddingVertical: Spacing.md,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.xs,
  },
  cancel: { alignItems: 'center', paddingVertical: 10 },
});
