import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmModal } from '@/components/ConfirmModal';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { RecordingPlayer } from '@/components/RecordingPlayer';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import {
  deletePracticeLog,
  getPracticeLogForPassage,
  updatePracticeLogMoodNote,
  type PracticeLogEntry,
} from '@/lib/db/repos/practiceLog';
import { formatPracticeDetail, strategyLabel } from '@/lib/practiceLog/format';

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth())
    return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function parseMoodNote(entry: PracticeLogEntry): {
  mood: string | null;
  note: string | null;
} {
  if (!entry.data_json) return { mood: null, note: null };
  try {
    const data = JSON.parse(entry.data_json);
    return {
      mood: typeof data.mood === 'string' ? data.mood : null,
      note: typeof data.note === 'string' ? data.note : null,
    };
  } catch {
    return { mood: null, note: null };
  }
}

function parseRemindNext(entry: PracticeLogEntry): boolean {
  if (!entry.data_json) return false;
  try {
    const data = JSON.parse(entry.data_json);
    return data?.remindNext === true;
  } catch {
    return false;
  }
}

function recordingUri(entry: PracticeLogEntry): string | null {
  if (!entry.data_json) return null;
  try {
    const data = JSON.parse(entry.data_json);
    return typeof data.recording_uri === 'string' ? data.recording_uri : null;
  } catch {
    return null;
  }
}

type Section = { title: string; data: PracticeLogEntry[] };

export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors: STRATEGY_COLORS } = useStrategyColors();

  const router = useRouter();
  const [passage, setPassage] = useState<Passage | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [editing, setEditing] = useState<PracticeLogEntry | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<PracticeLogEntry | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    const entries = await getPracticeLogForPassage(id);
    const groups = new Map<string, { title: string; data: PracticeLogEntry[] }>();
    for (const e of entries) {
      const key = dateKey(e.practiced_at);
      if (!groups.has(key)) {
        groups.set(key, { title: formatDate(e.practiced_at), data: [] });
      }
      groups.get(key)!.data.push(e);
    }
    setSections(Array.from(groups.values()));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getPassage(id).then(setPassage);
    refresh();
  }, [id, refresh]);

  const editingParsed = editing ? parseMoodNote(editing) : null;
  const editingRemindNext = editing ? parseRemindNext(editing) : false;

  async function onEditSubmit(payload: {
    mood: string | null;
    note: string | null;
    remindNext: boolean;
  }) {
    if (!editing) return;
    await updatePracticeLogMoodNote(editing.id, payload);
    setEditing(null);
    refresh();
  }

  function onEditDelete() {
    if (!editing) return;
    setDeleteConfirmFor(editing);
    setEditing(null);
  }

  async function performDelete() {
    if (!deleteConfirmFor) return;
    await deletePracticeLog(deleteConfirmFor.id);
    setDeleteConfirmFor(null);
    refresh();
  }

  if (!passage) return <ThemedView style={{ flex: 1 }} />;

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={styles.backLink}>‹ Back</ThemedText>
        </Pressable>
        <ThemedText type="title">Practice history</ThemedText>
        <ThemedText style={styles.headerSub} numberOfLines={1}>
          {passage.title}
        </ThemedText>
      </View>
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ color: Palette.textMuted, textAlign: 'center' }}>
            No practice sessions recorded yet.{'\n'}Practice with any strategy to start
            building your history.
          </ThemedText>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={styles.content}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <ThemedText style={styles.dateHeader}>{section.title}</ThemedText>
          )}
          renderItem={({ item }) => {
            const label = strategyLabel(item);
            const color = STRATEGY_COLORS[item.strategy] ?? Palette.textMuted;
            const detail = formatPracticeDetail(item);
            const exerciseName =
              item.exercise_name && item.exercise_name.trim().length > 0
                ? item.exercise_name
                : null;
            const { mood, note } = parseMoodNote(item);
            return (
              <Pressable
                onPress={() => setEditing(item)}
                style={styles.entry}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.entryHeader}>
                    <ThemedText style={styles.stratLabel} numberOfLines={1}>
                      {label}
                      {exerciseName ? ` · ${exerciseName}` : ''}
                      {mood ? ` ${mood}` : ''}
                    </ThemedText>
                    <ThemedText style={styles.timeText}>
                      {formatTime(item.practiced_at)}
                    </ThemedText>
                  </View>
                  {detail && <ThemedText style={styles.detailText}>{detail}</ThemedText>}
                  {note && <ThemedText style={styles.noteText}>{note}</ThemedText>}
                  {(() => {
                    const uri = recordingUri(item);
                    return uri ? <RecordingPlayer uri={uri} /> : null;
                  })()}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <PracticeLogNotePrompt
        visible={editing !== null}
        title="Edit log entry"
        initialMood={editingParsed?.mood ?? null}
        initialNote={editingParsed?.note ?? null}
        initialRemindNext={editingRemindNext}
        submitLabel="Save"
        cancelLabel="Cancel"
        onSubmit={onEditSubmit}
        onSkip={() => setEditing(null)}
        onDelete={onEditDelete}
      />

      <ConfirmModal
        visible={deleteConfirmFor !== null}
        title="Delete this log entry?"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={performDelete}
        onCancel={() => setDeleteConfirmFor(null)}
      />

      <TutorialStep
        id="passage-history"
        visible={false}
        title="Passage history"
        body={
          "Every session you've run on this passage, newest first. Each entry shows the strategy, time, any tempo/step detail, your mood, note, and a player for any recording you captured.\n\n" +
          "Tap an entry to open it for editing — add or change the mood and note, play back any attached recording, or Delete the entry entirely.\n\n" +
          "Use this to track how a single passage is developing — what tempos you've hit, what's still rough, when you last worked on it."
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'] },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.xs },
  backLink: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, color: Palette.accent },
  headerSub: { fontSize: Type.size.md, color: Palette.textSecondary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'] },
  dateHeader: {
    fontFamily: Fonts.rounded,
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.lg,
    color: Palette.text,
    letterSpacing: -0.2,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    ...Lift,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: Spacing.xs,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stratLabel: { fontWeight: Type.weight.bold, fontSize: Type.size.md, color: Palette.text },
  timeText: { fontSize: 12, fontWeight: Type.weight.semibold, color: Palette.textMuted },
  detailText: { color: Palette.textSecondary, fontSize: Type.size.sm },
  noteText: { color: Palette.textSecondary, fontSize: Type.size.sm, fontStyle: 'italic', marginTop: 2 },
});
