import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, SectionList, StyleSheet, View } from 'react-native';

import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Opacity, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import {
  deletePracticeLog,
  getPracticeLogForPassage,
  updatePracticeLogMoodNote,
  type PracticeLogEntry,
} from '@/lib/db/repos/practiceLog';

const STRATEGY_LABELS: Record<string, string> = {
  tempo_ladder: 'Tempo Ladder',
  click_up: 'Interleaved Click-Up',
  rhythmic: 'Rhythmic Variation',
  interleaved: 'Serial Practice',
  chunking: 'Chunking',
};

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

function formatDetail(entry: PracticeLogEntry): string | null {
  if (!entry.data_json) return null;
  try {
    const data = JSON.parse(entry.data_json);
    if (entry.strategy === 'tempo_ladder') {
      const parts: string[] = [];
      if (data.tempo) parts.push(`${data.tempo} BPM`);
      if (data.goalTempo) parts.push(`goal ${data.goalTempo}`);
      if (data.mode) parts.push(data.mode);
      return parts.join(' · ');
    }
    if (entry.strategy === 'click_up') {
      const parts: string[] = [];
      if (data.step != null && data.totalSteps)
        parts.push(`step ${data.step + 1}/${data.totalSteps}`);
      if (data.tempo) parts.push(`${data.tempo} BPM`);
      return parts.join(' · ');
    }
    if (entry.strategy === 'interleaved') {
      const parts: string[] = [];
      if (data.mode) parts.push(data.mode);
      if (typeof data.tempo === 'number') parts.push(`${data.tempo} BPM`);
      if (data.completed) parts.push('completed ✓');
      else if (data.streak != null && data.targetReps)
        parts.push(`${data.streak}/${data.targetReps} reps`);
      return parts.join(' · ');
    }
  } catch {
    // ignore
  }
  return null;
}

type Section = { title: string; data: PracticeLogEntry[] };

export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors: STRATEGY_COLORS } = useStrategyColors();

  const router = useRouter();
  const [passage, setPassage] = useState<Passage | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [editing, setEditing] = useState<PracticeLogEntry | null>(null);

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

  async function onEditSubmit(payload: { mood: string | null; note: string | null }) {
    if (!editing) return;
    await updatePracticeLogMoodNote(editing.id, payload);
    setEditing(null);
    refresh();
  }

  function onEditDelete() {
    if (!editing) return;
    const target = editing;
    const performDelete = async () => {
      await deletePracticeLog(target.id);
      setEditing(null);
      refresh();
    };
    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined' &&
        window.confirm('Delete this log entry? This cannot be undone.');
      if (ok) performDelete();
      return;
    }
    Alert.alert('Delete this log entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  }

  if (!passage) return <ThemedView style={{ flex: 1 }} />;

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: `${passage.title} — History`,
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={14}
              style={{ paddingHorizontal: 4 }}>
              <ThemedText
                style={{
                  color: C.tint,
                  fontSize: 30,
                  fontWeight: '400',
                  lineHeight: 32,
                }}>
                ‹
              </ThemedText>
            </Pressable>
          ),
        }}
      />
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ opacity: 0.6, textAlign: 'center' }}>
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
            const label = STRATEGY_LABELS[item.strategy] ?? item.strategy;
            const color = STRATEGY_COLORS[item.strategy] ?? C.icon;
            const detail = formatDetail(item);
            const exerciseName =
              item.exercise_name && item.exercise_name.trim().length > 0
                ? item.exercise_name
                : null;
            const { mood, note } = parseMoodNote(item);
            return (
              <Pressable
                onPress={() => setEditing(item)}
                style={[styles.entry, { borderColor: C.icon + '33' }]}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.entryHeader}>
                    <ThemedText style={styles.stratLabel} numberOfLines={1}>
                      {label}
                      {exerciseName ? ` · ${exerciseName}` : ''}
                      {mood ? ` ${mood}` : ''}
                    </ThemedText>
                    <ThemedText style={[styles.timeText, { color: C.icon }]}>
                      {formatTime(item.practiced_at)}
                    </ThemedText>
                  </View>
                  {detail && <ThemedText style={styles.detailText}>{detail}</ThemedText>}
                  {note && <ThemedText style={styles.noteText}>{note}</ThemedText>}
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
        submitLabel="Save"
        cancelLabel="Cancel"
        onSubmit={onEditSubmit}
        onSkip={() => setEditing(null)}
        onDelete={onEditDelete}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'] },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'] },
  dateHeader: {
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  stratLabel: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  timeText: { fontSize: 12, fontWeight: Type.weight.semibold },
  detailText: { opacity: Opacity.muted, fontSize: Type.size.sm },
  noteText: { opacity: 0.75, fontSize: Type.size.sm, fontStyle: 'italic', marginTop: 2 },
});
