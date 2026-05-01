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
import { Borders, Overlays, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const PRACTICE_MOODS = ['🔥', '😄', '😐', '😢', '💩'] as const;
export type PracticeMood = (typeof PRACTICE_MOODS)[number];

type Props = {
  visible: boolean;
  emoji?: string;
  title?: string;
  subtitle?: string;
  initialMood?: string | null;
  initialNote?: string | null;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (payload: { mood: string | null; note: string | null }) => void;
  onSkip: () => void;
  onDelete?: () => void;
};

export function PracticeLogNotePrompt({
  visible,
  emoji,
  title = 'How did that go?',
  subtitle,
  initialMood = null,
  initialNote = null,
  submitLabel = 'Save',
  cancelLabel = 'Skip',
  onSubmit,
  onSkip,
  onDelete,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [mood, setMood] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setMood(initialMood ?? null);
      setNote(initialNote ?? '');
    }
  }, [visible, initialMood, initialNote]);

  function submit() {
    const trimmed = note.trim();
    onSubmit({ mood, note: trimmed.length > 0 ? trimmed : null });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: C.background }]}>
          {emoji && <ThemedText style={styles.emoji}>{emoji}</ThemedText>}
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            {title}
          </ThemedText>
          {subtitle && (
            <ThemedText style={[styles.subtitle, { color: C.icon }]}>
              {subtitle}
            </ThemedText>
          )}

          <View style={styles.moodRow}>
            {PRACTICE_MOODS.map((m) => {
              const selected = mood === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMood(selected ? null : m)}
                  style={[
                    styles.moodBtn,
                    {
                      borderColor: selected ? C.tint : 'transparent',
                      backgroundColor: selected ? C.tint + '22' : C.icon + '15',
                    },
                  ]}>
                  <ThemedText style={styles.moodText}>{m}</ThemedText>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={C.icon}
            multiline
            style={[styles.input, { color: C.text, borderColor: C.icon }]}
          />

          <View style={styles.row}>
            {onDelete && (
              <Pressable onPress={onDelete} style={styles.delete}>
                <ThemedText style={styles.deleteText}>Delete</ThemedText>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onSkip} style={styles.skip}>
              <ThemedText style={[styles.skipText, { color: C.icon }]}>
                {cancelLabel}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={submit}
              style={[styles.save, { backgroundColor: C.tint }]}>
              <ThemedText style={styles.saveText}>{submitLabel}</ThemedText>
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
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: Radii['2xl'],
    padding: 20,
    gap: 14,
  },
  emoji: {
    fontSize: 56,
    lineHeight: 70,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    marginTop: -6,
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  moodBtn: {
    flex: 1,
    height: 68,
    borderRadius: Radii.xl,
    borderWidth: Borders.thick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodText: { fontSize: 30, lineHeight: 36 },
  input: {
    minHeight: 90,
    maxHeight: 200,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.md,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  skip: { paddingHorizontal: 14, paddingVertical: 10 },
  skipText: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  save: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radii.md,
    minWidth: 90,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 15 },
  delete: { paddingHorizontal: 14, paddingVertical: 10 },
  deleteText: { color: Status.danger, fontWeight: Type.weight.bold, fontSize: Type.size.md },
});
