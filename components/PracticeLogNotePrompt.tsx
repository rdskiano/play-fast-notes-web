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
import { Borders, Overlays, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type MetronomeApi } from '@/lib/audio/useMetronome';
import {
  chipsForStrategy,
  proposeNote,
  strategySupportsReminder,
  type ChipContext,
  type SessionOutcome,
} from '@/lib/practice/noteChips';

export const PRACTICE_MOODS = ['🔥', '😄', '😐', '😢', '💩'] as const;
export type PracticeMood = (typeof PRACTICE_MOODS)[number];

type Props = {
  visible: boolean;
  // The strategy this session ran (or the log row's strategy in edit flows).
  // Picks the chip list: each tool offers only chips that can act after it.
  // 'interleaved' (Rep Rotator) gets no chips and no reminder checkbox.
  strategy?: string;
  // Session facts that gate individual chips (increment edges, micro mode,
  // builder vs patterns-only).
  chipContext?: ChipContext;
  // Session-end flows pass this (even empty) to get the propose-first stage:
  // the coach leads with ONE pre-picked suggestion grounded in what it just
  // watched — "Sounds right" is a one-tap save, "Something else…" unfolds
  // the full chips + text box. Edit flows omit it and keep the classic UI.
  sessionOutcome?: SessionOutcome;
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
  // When provided, shows a "keep practicing" escape (an ✕ + tapping the
  // backdrop/back) that closes WITHOUT logging — for an accidental "Done" tap so
  // the user can return to the session instead of being forced to finish.
  onKeepPracticing?: () => void;
  // When provided, the prompt silences a running metronome while it's open —
  // clicking over the "what to do next time" question was distracting. Resumes
  // ONLY on the keep-practicing escape (back into the session); Save/Skip end
  // the session and leave the screen, so restarting would just blip.
  metronome?: MetronomeApi;
};

// Single hard-coded prompt. Title / emoji / subtitle props are retained on
// the type for backward compat with call sites but intentionally not
// rendered — the prompt now asks one question and only one question.
const PROMPT_TITLE =
  'What do you think is most important to do on this next time?';

// One-tap answers for the tired-hands moment. An open text box at the end of
// a session demands articulation most players don't have right then (the
// app's own builder left it blank mid-practice, then knew the answer —
// "introduce variation" — two hours later). Tapping a chip appends its phrase
// to the note; tapping again removes it; the text stays fully editable.
// The list is strategy-aware — see lib/practice/noteChips.ts.

export function PracticeLogNotePrompt({
  visible,
  strategy,
  chipContext,
  sessionOutcome,
  initialMood = null,
  initialNote = null,
  initialRemindNext = false,
  submitLabel = 'Save',
  cancelLabel = 'Skip',
  onSubmit,
  onSkip,
  onDelete,
  onKeepPracticing,
  metronome,
}: Props) {
  const chips = chipsForStrategy(strategy, chipContext);
  const remindable = strategySupportsReminder(strategy);
  // The coach's proposal — session-end flows only (edit flows pass no
  // outcome). Shown as an asterisk on the matching chip + a footnote with
  // the reasoning, inside the ONE classic modal. (The earlier two-stage
  // "Sounds right / Something else…" card confused Ralph — the suggestion
  // pill read as a button — and hid the notes box behind a tap.)
  const proposal = sessionOutcome ? proposeNote(strategy, sessionOutcome) : null;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  // Preserve any prior mood through edit flows even though the UI no longer
  // lets you set one — protects existing log rows that already carry a mood.
  const [mood, setMood] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [remindNext, setRemindNext] = useState(false);
  // Chips drive the reminder checkbox: selecting any chip checks it,
  // deselecting the last chip un-checks it. A manual tap on the checkbox wins
  // for the rest of the prompt, and typed text never moves the box. A prompt
  // that opens already-checked (edit flow) counts as manual.
  const remindTouched = useRef(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setMood(initialMood ?? null);
      setNote(initialNote ?? '');
      setRemindNext(initialRemindNext ?? false);
      remindTouched.current = initialRemindNext ?? false;
    }
  }, [visible, initialMood, initialNote, initialRemindNext]);

  // Silence a running metronome while the prompt is up. `metronomeWasRunning`
  // survives across renders so the keep-practicing escape knows whether to
  // restart it. Effect is idempotent: once stopped, `running` is false, so
  // re-runs (the metronome object is a fresh identity each render) no-op.
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

  // Resume the click only when the user ducks back INTO the session.
  const keepPracticing = onKeepPracticing
    ? () => {
        if (metronomeWasRunning.current) metronome?.start();
        onKeepPracticing();
      }
    : undefined;

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

  // Belt-and-suspenders for iPad Safari (web). The synchronous focus above
  // catches the gesture-window case, but RN-Web mounts the modal's content a
  // tick after `visible` flips, so that focus can fire before the <input>
  // exists and no-op — which is why the keyboard didn't reliably pop up at the
  // end of a session. Retry on the next frame and again shortly after; iPadOS
  // raises the keyboard for a programmatic focus even slightly outside the
  // gesture. (iPhone Safari ignores a deferred focus, and native already worked
  // via the layout effect — so no regression on either.)
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [visible]);

  function submit() {
    const trimmed = note.trim();
    onSubmit({
      mood,
      note: trimmed.length > 0 ? trimmed : null,
      remindNext: remindable ? remindNext : false,
    });
  }

  // Chip toggle: append the phrase if absent, strip it if present. Phrases
  // join with " · " so several chips read as a list, and hand-typed text is
  // never disturbed beyond removing the exact chip phrase.
  function toggleChip(phrase: string) {
    setNote((cur) => {
      const next = cur.includes(phrase)
        ? cur
            .split(' · ')
            .map((part) => part.trim())
            .filter((part) => part.length > 0 && part !== phrase)
            .join(' · ')
        : cur.trim().length > 0
          ? `${cur.trim()} · ${phrase}`
          : phrase;
      if (remindable && !remindTouched.current) {
        setRemindNext(chips.some((p) => next.includes(p)));
      }
      return next;
    });
  }

  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={keepPracticing ?? onSkip}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}>
        <View style={styles.card}>
          {keepPracticing && (
            <Pressable
              onPress={keepPracticing}
              hitSlop={12}
              accessibilityLabel="Keep practicing"
              style={styles.keepClose}>
              <ThemedText style={[styles.keepCloseText, { color: C.icon }]}>✕</ThemedText>
            </Pressable>
          )}
          <ThemedText
            type="subtitle"
            style={{ textAlign: 'center', paddingHorizontal: onKeepPracticing ? 28 : 0 }}>
            {PROMPT_TITLE}
          </ThemedText>

          {chips.length > 0 && (
          <View style={styles.chipRow}>
            {chips.map((phrase) => {
              const active = note.includes(phrase);
              const suggested = proposal?.phrase === phrase;
              return (
                <Pressable
                  key={phrase}
                  onPress={() => toggleChip(phrase)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? C.tint : C.icon,
                      backgroundColor: active ? C.tint : 'transparent',
                    },
                  ]}>
                  <ThemedText
                    style={[styles.chipText, { color: active ? '#fff' : C.text }]}>
                    {suggested ? `${phrase} *` : phrase}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          )}

          {proposal && (
            <ThemedText style={[styles.coachNote, { color: C.icon }]}>
              * The coach’s pick — {proposal.why}
            </ThemedText>
          )}

          <ThemedText style={[styles.inputLabel, { color: C.text }]}>
            Any notes from this session?
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

          {remindable && (
          <Pressable
            onPress={() => {
              remindTouched.current = true;
              setRemindNext((v) => !v);
            }}
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
          )}

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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: Borders.medium,
  },
  chipText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold },
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
  coachNote: {
    fontSize: Type.size.sm,
    lineHeight: 19,
    marginTop: -4,
  },
  inputLabel: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    marginBottom: -8,
  },
});
