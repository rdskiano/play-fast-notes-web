import { Modal, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Opacity, Overlays, Spacing, Status } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type CelebrationAction = {
  label: string;
  onPress: () => void;
  color?: string;
};

type Props = {
  visible: boolean;
  onRequestClose?: () => void;
  emoji?: string;
  title: string;
  body?: string;
  primary: CelebrationAction;
  secondary?: CelebrationAction;
};

export function CelebrationModal({
  visible,
  onRequestClose,
  emoji = '🎉',
  title,
  body,
  primary,
  secondary,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: C.background }]}>
          <ThemedText style={styles.emoji}>{emoji}</ThemedText>
          <ThemedText type="title" style={styles.title}>
            {title}
          </ThemedText>
          {body && <ThemedText style={styles.body}>{body}</ThemedText>}
          {secondary && (
            <Button
              label={secondary.label}
              onPress={secondary.onPress}
              style={{ backgroundColor: secondary.color ?? Status.success }}
            />
          )}
          <Button
            label={primary.label}
            onPress={primary.onPress}
            style={primary.color ? { backgroundColor: primary.color } : undefined}
          />
        </View>
      </View>
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
    borderRadius: 20,
    padding: Spacing.xl,
    gap: 14,
  },
  emoji: { fontSize: 64, lineHeight: 84, textAlign: 'center' },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', opacity: Opacity.subtle },
});
