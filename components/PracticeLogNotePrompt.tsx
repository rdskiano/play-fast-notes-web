import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  initialRemindNext?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (payload: {
    mood: string | null;
    note: string | null;
    remindNext: boolean;
  }) => void;
  onSkip: () => void;
  onDelete?: () => void;
};

// Single hard-coded prompt. Title / emoji / subtitle props are retained on
// the type for backward compat with call sites but intentionally not
// rendered — the prompt now asks one question and only one question.
const PROMPT_TITLE =
  'What do you think is most important to do on this next time?';

export function PracticeLogNotePrompt({
  visible,
  initialMood = null,
  initialNote = null,
  initialRemindNext = false,
  submitLabel = 'Save',
  cancelLabel = 'Skip',
  onSubmit,
  onSkip,
  onDelete,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  // Preserve any prior mood through edit flows even though the UI no longer
  // lets you set one — protects existing log rows that already carry a mood.
  const [mood, setMood] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [remindNext, setRemindNext] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setMood(initialMood ?? null);
      setNote(initialNote ?? '');
      setRemindNext(initialRemindNext ?? false);
    }
  }, [visible, initialMood, initialNote, initialRemindNext]);

  // Raise the on-screen keyboard the instant the prompt opens. iOS / iPadOS
  // only shows the keyboard when the input is focused *inside* the tap that
  // triggered it — a deferred focus (setTimeout / useEffect / autoFocus's own
  // internal defer) lands after the gesture and iOS silently ignores it,
  // leaving the keyboard down. useLayoutEffect runs synchronously within the
  // same event flush as the button press, so the focus stays inside the
  // gesture window. (Auto-opens with no gesture — e.g. the goal-reached
  // celebration — still can't raise the keyboard; that's an iOS hard limit.)
  useLayoutEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  function submit() {
    const trimmed = note.trim();
    onSubmit({ mood, note: trimmed.length > 0 ? trimmed : null, remindNext });
  }

  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: C.background }]}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            {PROMPT_TITLE}
          </ThemedText>

          <TextInput
            ref={inputRef}
            value={note}
            onChangeText={setNote}
            placeholder=""
            placeholderTextColor={C.icon}
            multiline
            autoFocus
            style={[styles.input, { color: C.text, borderColor: C.icon }]}
          />

          <Pressable
            onPress={() => setRemindNext((v) => !v)}
            style={styles.remindRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: remindNext }}>
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: remindNext ? C.tint : C.icon,
                  backgroundColor: remindNext ? C.tint : 'transparent',
                },
              ]}>
              {remindNext && <ThemedText style={styles.checkmark}>✓</ThemedText>}
            </View>
            <ThemedText style={[styles.remindLabel, { color: C.text }]}>
              Remind me of this next time
            </ThemedText>
          </Pressable>

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
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: Borders.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: Type.weight.heavy, lineHeight: 16 },
  remindLabel: { fontSize: Type.size.md, fontWeight: Type.weight.semibold },
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
