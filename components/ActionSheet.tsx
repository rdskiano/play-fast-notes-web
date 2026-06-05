import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ActionSheetItem = {
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  // When true, the item renders as a filled tint-colored CTA so it reads as
  // the obvious / default choice (e.g. "Practice this passage").
  primary?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title?: string;
  items: ActionSheetItem[];
  cancelLabel?: string;
  onCancel: () => void;
};

export function ActionSheet({
  visible,
  title,
  items,
  cancelLabel = 'Cancel',
  onCancel,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, { backgroundColor: C.background }]}
          onPress={(e) => e.stopPropagation()}>
          {title && (
            <ThemedText
              style={[
                styles.title,
                { color: C.icon, borderBottomColor: C.icon + '22' },
              ]}
              numberOfLines={1}>
              {title}
            </ThemedText>
          )}
          {items.map((it, i) => {
            if (it.primary) {
              return (
                <Pressable
                  key={`${i}:${it.label}`}
                  disabled={it.disabled}
                  onPress={() => it.onPress()}
                  style={({ pressed }) => [
                    styles.primaryItem,
                    {
                      backgroundColor: pressed ? C.tint + 'cc' : C.tint,
                      opacity: it.disabled ? 0.35 : 1,
                    },
                  ]}>
                  <ThemedText style={styles.primaryItemText}>{it.label}</ThemedText>
                </Pressable>
              );
            }
            return (
              <Pressable
                key={`${i}:${it.label}`}
                disabled={it.disabled}
                onPress={() => it.onPress()}
                style={({ pressed }) => [
                  styles.item,
                  {
                    borderTopColor: C.icon + '22',
                    borderTopWidth: i === 0 && !title ? 0 : StyleSheet.hairlineWidth,
                    backgroundColor: pressed ? C.icon + '11' : 'transparent',
                    opacity: it.disabled ? 0.35 : 1,
                  },
                ]}>
                <ThemedText
                  style={[
                    styles.itemText,
                    it.destructive ? { color: '#c0392b' } : { color: C.text },
                  ]}>
                  {it.label}
                </ThemedText>
              </Pressable>
            );
          })}
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancel,
              {
                borderTopColor: C.icon + '33',
                backgroundColor: pressed ? C.icon + '11' : 'transparent',
              },
            ]}>
            <ThemedText style={[styles.cancelText, { color: C.tint }]}>
              {cancelLabel}
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Overlays.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radii['2xl'],
    overflow: 'hidden',
    borderWidth: Borders.thin,
    borderColor: '#0001',
  },
  // Title styling reworked 2026-05-25 after user feedback: the previous
  // uppercase + bold + letter-spaced treatment made the name-of-the-
  // tapped-thing (e.g. "INTO 1") read as a chip / button, competing for
  // tap weight with the actual primary action below. Now: normal case,
  // regular weight, slightly larger, with a hairline divider below so
  // the eye reads it as a label of what we're acting on, not as a
  // tappable choice.
  title: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    fontSize: Type.size.sm,
    textAlign: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
  },
  item: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  itemText: { fontSize: 16, fontWeight: Type.weight.semibold },
  primaryItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryItemText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.3,
  },
  cancel: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelText: { fontSize: 16, fontWeight: Type.weight.bold },
});
