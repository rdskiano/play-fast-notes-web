import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export function PromptModal({
  visible,
  title,
  message,
  initialValue = '',
  placeholder,
  submitLabel = 'OK',
  cancelLabel = 'Cancel',
  onSubmit,
  onCancel,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: C.background }]}>
          <ThemedText type="subtitle">{title}</ThemedText>
          {message && <ThemedText style={{ opacity: 0.7 }}>{message}</ThemedText>}
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={C.icon}
            returnKeyType="done"
            onSubmitEditing={() => onSubmit(value.trim())}
            style={[styles.input, { color: C.text, borderColor: C.icon }]}
          />
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}>
              <ThemedText style={[styles.btnText, { color: C.text }]}>{cancelLabel}</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.btn, { backgroundColor: C.tint }]}
              onPress={() => onSubmit(value.trim())}>
              <ThemedText style={[styles.btnText, { color: '#fff' }]}>{submitLabel}</ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  input: {
    borderWidth: Borders.thin,
    borderRadius: Radii.sm,
    padding: Spacing.md,
    fontSize: Type.size.lg,
  },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  btn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radii.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  cancel: { backgroundColor: 'transparent' },
  btnText: { fontWeight: Type.weight.bold, fontSize: 15 },
});
