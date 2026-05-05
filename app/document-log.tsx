// Practice log scoped to a single document (the "full part").
//
// Reached from the document viewer's idle toolbar. Mirrors folder-log.tsx
// shape but groups Day -> Section -> Passage (the document itself is the
// scope, so no document sub-group is needed).

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { SessionTopBar } from '@/components/SessionTopBar';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  deletePracticeLog,
  getPracticeLogForDocument,
  updatePracticeLogMoodNote,
  type PracticeLogWithTitle,
} from '@/lib/db/repos/practiceLog';

const STRATEGY_LABELS: Record<string, string> = {
  tempo_ladder: 'TL',
  click_up: 'ICU',
  rhythmic: 'RV',
  interleaved: 'Serial',
  chunking: 'Chunking',
  add_a_note: 'Add a Note',
  pitch: 'Pitch',
  phrasing: 'Phrasing',
  recording: 'Recording',
  freeform: 'Freeform',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

type DetailExtras = { mood: string | null; note: string | null };

function parseMoodNote(entry: PracticeLogWithTitle): DetailExtras {
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

function formatDetail(entry: PracticeLogWithTitle): string | null {
  if (!entry.data_json) return null;
  try {
    const data = JSON.parse(entry.data_json);
    if (entry.strategy === 'tempo_ladder' && data.tempo) return `${data.tempo} BPM`;
    if (entry.strategy === 'click_up' && data.step != null && data.totalSteps)
      return `${data.step + 1}/${data.totalSteps}`;
    if (entry.strategy === 'interleaved') {
      const parts: string[] = [];
      if (typeof data.tempo === 'number') parts.push(`${data.tempo} BPM`);
      if (data.completed) parts.push('✓');
      return parts.length > 0 ? parts.join(' ') : null;
    }
  } catch {
    // ignore
  }
  return null;
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type PassageGroup = {
  passageTitle: string;
  entries: PracticeLogWithTitle[];
};

type SectionSubGroup = {
  sectionName: string | null;
  passages: PassageGroup[];
};

type DayGroup = {
  dateLabel: string;
  sectionGroups: SectionSubGroup[];
};

export default function DocumentLogScreen() {
  const router = useRouter();
  const { documentId, documentTitle } = useLocalSearchParams<{
    documentId?: string;
    documentTitle?: string;
  }>();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors: STRATEGY_COLORS } = useStrategyColors();

  const [days, setDays] = useState<DayGroup[]>([]);
  const [editing, setEditing] = useState<PracticeLogWithTitle | null>(null);

  const title = documentTitle || 'Document';

  const refresh = useCallback(async () => {
    if (!documentId) {
      setDays([]);
      return;
    }
    const entries = await getPracticeLogForDocument(documentId);

    type DayBuilder = {
      dateLabel: string;
      sectionMap: Map<string, SectionSubGroup>;
    };
    const dayMap = new Map<string, DayBuilder>();

    for (const e of entries) {
      const dk = dateKey(e.practiced_at);
      if (!dayMap.has(dk)) {
        dayMap.set(dk, {
          dateLabel: formatDate(e.practiced_at),
          sectionMap: new Map(),
        });
      }
      const day = dayMap.get(dk)!;
      const sectionKey = e.section_name ?? '__nosection__';
      if (!day.sectionMap.has(sectionKey)) {
        day.sectionMap.set(sectionKey, { sectionName: e.section_name, passages: [] });
      }
      const section = day.sectionMap.get(sectionKey)!;
      let pg = section.passages.find((p) => p.entries[0]?.piece_id === e.piece_id);
      if (!pg) {
        pg = { passageTitle: e.piece_title || 'Untitled', entries: [] };
        section.passages.push(pg);
      }
      pg.entries.push(e);
    }

    const result: DayGroup[] = [];
    for (const day of dayMap.values()) {
      result.push({
        dateLabel: day.dateLabel,
        sectionGroups: Array.from(day.sectionMap.values()),
      });
    }
    setDays(result);
  }, [documentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  const renderPassage = (pg: PassageGroup, pi: number) => (
    <View
      key={pi}
      style={[styles.passageCard, { borderColor: C.icon + '33' }]}>
      <ThemedText style={styles.passageName} numberOfLines={1}>
        {pg.passageTitle}
      </ThemedText>
      <View style={styles.pillRow}>
        {pg.entries.map((e) => {
          const label = STRATEGY_LABELS[e.strategy] ?? e.strategy;
          const color = STRATEGY_COLORS[e.strategy] ?? C.icon;
          const detail = formatDetail(e);
          const exerciseName =
            e.exercise_name && e.exercise_name.trim().length > 0
              ? e.exercise_name
              : null;
          const { mood, note } = parseMoodNote(e);
          return (
            <Pressable
              key={e.id}
              onPress={() => setEditing(e)}
              style={styles.entry}>
              <View style={[styles.pill, { backgroundColor: color }]}>
                <ThemedText style={styles.pillText} numberOfLines={1}>
                  {label}
                  {exerciseName ? ` · ${exerciseName}` : ''}
                  {detail ? ` ${detail}` : ''}
                  {mood ? ` ${mood}` : ''}
                </ThemedText>
              </View>
              {note && (
                <ThemedText style={styles.noteText} numberOfLines={2}>
                  {note}
                </ThemedText>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Document"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            {title} — Practice Log
          </ThemedText>
        }
      />
      {days.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ opacity: 0.6, textAlign: 'center' }}>
            No practice sessions recorded yet.
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {days.map((day) => (
            <View
              key={day.dateLabel}
              style={[
                styles.dayBlock,
                { borderColor: C.icon + '55', backgroundColor: C.icon + '08' },
              ]}>
              <View style={[styles.dayHeaderBar, { backgroundColor: C.tint }]}>
                <ThemedText style={styles.dayHeaderText}>{day.dateLabel}</ThemedText>
              </View>
              <View style={styles.dayBody}>
                {day.sectionGroups.map((sg, si) => (
                  <View key={si} style={styles.sectionGroup}>
                    {sg.sectionName && (
                      <View style={styles.sectionLabelRow}>
                        <View
                          style={[styles.sectionBar, { backgroundColor: C.tint }]}
                        />
                        <ThemedText
                          style={[styles.sectionName, { color: C.text }]}
                          numberOfLines={1}>
                          {sg.sectionName}
                        </ThemedText>
                      </View>
                    )}
                    <View style={styles.passageGrid}>
                      {sg.passages.map(renderPassage)}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <PracticeLogNotePrompt
        visible={editing !== null}
        title="Edit log entry"
        subtitle={editing?.piece_title ?? undefined}
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
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'], gap: 18 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  dayBlock: {
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    overflow: 'hidden',
  },
  dayHeaderBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dayHeaderText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.3,
  },
  dayBody: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sectionGroup: {
    gap: Spacing.sm,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionBar: {
    width: Spacing.xs,
    height: 18,
    borderRadius: 2,
  },
  sectionName: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    flex: 1,
  },
  passageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  passageCard: {
    flexBasis: '48%',
    flexGrow: 1,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: 10,
    gap: 6,
  },
  passageName: {
    fontWeight: Type.weight.bold,
    fontSize: Type.size.sm,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  pill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.sm,
  },
  pillText: {
    color: '#fff',
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
  },
  entry: { gap: 2 },
  noteText: {
    fontSize: Type.size.xs,
    opacity: Opacity.subtle,
    marginLeft: Spacing.xs,
    fontStyle: 'italic',
  },
});
