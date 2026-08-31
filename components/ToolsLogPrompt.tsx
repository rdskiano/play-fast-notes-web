// Freehand session log for the Tools room. The tools run with no piece
// attached, so the normal post-session prompt (which files a row under a
// passage) has nothing to file under. This box asks for a title in the
// user's own words ("Scales", "Long tones", "Rose etude no. 3") plus an
// optional note, and the row lands in the practice log as its own card
// under that title. Mirrors PracticeLogNotePrompt's layout so the two
// prompts feel like the same piece of furniture.

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
import { Lift, Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type MetronomeApi } from '@/lib/audio/useMetronome';

type Props = {
  visible: boolean;
  onSave: (payload: { title: string; note: string | null }) => void;
  /** Leave the session and write nothing to the log. */
  onDiscard: () => void;
  /** Close the box and return to the session (accidental tap escape). */
  onKeepPracticing: () => void;
  /** Silences a running metronome while the box is open; resumes only on
      the keep-practicing escape (same convention as the note prompt). */
  metronome?: MetronomeApi;
};

export function ToolsLogPrompt({
  visible,
  onSave,
  onDiscard,
  onKeepPracticing,
  metronome,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const titleRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setNote('');
    }
  }, [visible]);

  // Silence a running click while the box is up; remember whether it was
  // running so ducking back into the session can resume it.
  const metronomeWasRunning = useRef(false);
  useEffect(() => {
    if (visible) {
      if (metronome?.running) {
        metronomeWasRunning.current = true;
        metronome.stop();
      }
    } else {
      metronomeWasRunning.current = false;
    }
  }, [visible, metronome]);

  function keepPracticing() {
    if (metronomeWasRunning.current) metronome?.start();
    onKeepPracticing();
  }

  // Focus-inside-the-gesture + RN-Web retry, copied from
  // PracticeLogNotePrompt (see the comments there for the iOS keyboard
  // rules this dance satisfies).
  useLayoutEffect(() => {
    if (visible) titleRef.current?.focus();
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => titleRef.current?.focus());
    const t = setTimeout(() => titleRef.current?.focus(), 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [visible]);

  function submit() {
    const trimmedTitle = title.trim();
    const trimmedNote = note.trim();
    onSave({
      title: trimmedTitle.length > 0 ? trimmedTitle : 'Practice tools',
      note: trimmedNote.length > 0 ? trimmedNote : null,
    });
  }

  return (
    <Modal
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={keepPracticing}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable
            onPress={keepPracticing}
            hitSlop={12}
            accessibilityLabel="Keep practicing"
            style={styles.keepClose}>
            <ThemedText style={[styles.keepCloseText, { color: C.icon }]}>✕</ThemedText>
          </Pressable>
          <ThemedText
            type="subtitle"
            style={{ textAlign: 'center', paddingHorizontal: 28 }}>
            Log this session
          </ThemedText>

          <ThemedText style={[styles.inputLabel, { color: C.text }]}>
            What did you work on?
          </ThemedText>
          <TextInput
            ref={titleRef}
            value={title}
            onChangeText={setTitle}
            placeholder="Scales, long tones, an etude..."
            placeholderTextColor={C.icon}
            style={[styles.titleInput, { color: C.text, borderColor: C.icon }]}
          />

          <ThemedText style={[styles.inputLabel, { color: C.text }]}>
            Any notes from this session?
          </ThemedText>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder=""
            placeholderTextColor={C.icon}
            multiline
            style={[styles.noteInput, { color: C.text, borderColor: C.icon }]}
          />

          <View style={styles.row}>
            <Pressable onPress={onDiscard} style={styles.skip}>
              <ThemedText style={[styles.skipText, { color: C.icon }]}>
                Exit without logging
              </ThemedText>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={submit}
              style={[styles.save, { backgroundColor: C.tint }]}>
              <ThemedText style={styles.saveText}>Save</ThemedText>
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
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    ...Lift,
  },
  keepClose: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 2,
    padding: 4,
  },
  keepCloseText: { fontSize: 20, fontWeight: Type.weight.bold, lineHeight: 22 },
  inputLabel: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    marginBottom: -8,
  },
  titleInput: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.md,
    fontSize: 15,
  },
  noteInput: {
    minHeight: 90,
    maxHeight: 200,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.md,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  skip: { paddingVertical: 8, paddingHorizontal: 4 },
  skipText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold },
  save: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: Radii.lg,
  },
  saveText: { color: '#fff', fontWeight: Type.weight.bold },
});
