// In-app replacement for window.confirm. iPad Safari has gotten increasingly
// strict about suppressing the native dialog, so we render our own. Same
// shape as the rest of the app's modals (PromptModal, ActionSheet) so it
// fits visually.

import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, { backgroundColor: C.background }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            {title}
          </ThemedText>
          {message && (
            <ThemedText style={[styles.message, { color: C.icon }]}>{message}</ThemedText>
          )}
          <View style={styles.buttonRow}>
            <Button label={cancelLabel} variant="outline" onPress={onCancel} style={{ flex: 1 }} />
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              style={{ flex: 1 }}
            />
          </View>
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
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  message: {
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
