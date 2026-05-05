// Small modal shown after a passage is saved from the document marker.
// "Practice now" navigates to the new passage detail screen; "Mark another"
// dismisses and returns to draw mode in the document.

import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  visible: boolean;
  passageTitle: string;
  onPracticeNow: () => void;
  onMarkAnother: () => void;
  onDone: () => void;
  onCancel: () => void;
};

export function PostSaveSheet({
  visible,
  passageTitle,
  onPracticeNow,
  onMarkAnother,
  onDone,
  onCancel,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.card, { backgroundColor: C.background }]} onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            Saved: {passageTitle}
          </ThemedText>
          <ThemedText style={[styles.hint, { color: C.icon }]}>
            What next?
          </ThemedText>
          <Button label="Practice this passage" onPress={onPracticeNow} fullWidth />
          <Button label="Mark another" variant="outline" onPress={onMarkAnother} fullWidth />
          <Button label="Done" variant="ghost" onPress={onDone} fullWidth />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0008',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  hint: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    marginBottom: Spacing.xs,
  },
});
