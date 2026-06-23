// Practice log scoped to a single document (the "full part").
//
// Reached from the document viewer's idle toolbar. Mirrors folder-log.tsx
// shape but groups Day -> Section -> Passage (the document itself is the
// scope, so no document sub-group is needed).

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

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
import {
  deletePracticeLog,
  getPracticeLogForDocument,
  updatePracticeLogMoodNote,
  type PracticeLogWithTitle,
} from '@/lib/db/repos/practiceLog';
import { formatPracticeDetail, strategyLabel } from '@/lib/practiceLog/format';

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

function parseRemindNext(entry: PracticeLogWithTitle): boolean {
  if (!entry.data_json) return false;
  try {
    const data = JSON.parse(entry.data_json);
    return data?.remindNext === true;
  } catch {
    return false;
  }
}

function recordingUri(entry: PracticeLogWithTitle): string | null {
  if (!entry.data_json) return null;
  try {
    const data = JSON.parse(entry.data_json);
    return typeof data.recording_uri === 'string' ? data.recording_uri : null;
  } catch {
    return null;
  }
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
  const insets = useSafeAreaInsets();
  const { colors: STRATEGY_COLORS } = useStrategyColors();
  // Phone: stack passage cards single-column so each pill (e.g.
  // "Interleaved Click-Up 130/130") gets the full row width instead of
  // ~half — chips were overflowing the card boundary at 2-column.
  const { width, height } = useWindowDimensions();
  const isPhone = Math.min(width, height) < 600;

  const [days, setDays] = useState<DayGroup[]>([]);
  const [editing, setEditing] = useState<PracticeLogWithTitle | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<PracticeLogWithTitle | null>(null);

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

  const renderPassage = (pg: PassageGroup, pi: number) => (
    <View
      key={pi}
      style={[
        styles.passageCard,
        isPhone && styles.passageCardPhone,
      ]}>
      <ThemedText style={styles.passageName} numberOfLines={1}>
        {pg.passageTitle}
      </ThemedText>
      {/* DESIGN_RULES §2: strategies render as neutral rows with a small
          colored dot + ink label, not fully-saturated filled pills. */}
      <View style={styles.entryList}>
        {pg.entries.map((e) => {
          const label = strategyLabel(e);
          const detail = formatPracticeDetail(e, { compact: true });
          const exerciseName =
            e.exercise_name && e.exercise_name.trim().length > 0
              ? e.exercise_name
              : null;
          const { mood, note } = parseMoodNote(e);
          return (
            <View key={e.id} style={styles.entry}>
              <Pressable
                onPress={() => setEditing(e)}
                style={styles.entryRow}>
                <View
                  style={[
                    styles.entryDot,
                    { backgroundColor: STRATEGY_COLORS[e.strategy] ?? Palette.textMuted },
                  ]}
                />
                <ThemedText style={styles.entryRowLabel} numberOfLines={2}>
                  {label}
                  {exerciseName ? ` · ${exerciseName}` : ''}
                  {detail ? ` ${detail}` : ''}
                  {mood ? ` ${mood}` : ''}
                </ThemedText>
              </Pressable>
              {note && (
                <ThemedText style={styles.noteText} numberOfLines={2}>
                  {note}
                </ThemedText>
              )}
            </View>
          );
        })}
      </View>
      {pg.entries.map((e) => {
        const uri = recordingUri(e);
        if (!uri) return null;
        return <RecordingPlayer key={`rec-${e.id}`} uri={uri} />;
      })}
    </View>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={styles.backLink}>‹ Document</ThemedText>
        </Pressable>
        <ThemedText type="title">{title} — Practice Log</ThemedText>
      </View>
      {days.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ color: Palette.textMuted, textAlign: 'center' }}>
            No practice sessions recorded yet.
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {days.map((day) => (
            <View
              key={day.dateLabel}
              style={styles.dayBlock}>
              <View style={styles.dayHeaderBar}>
                <ThemedText style={styles.dayHeaderText}>{day.dateLabel}</ThemedText>
              </View>
              <View style={styles.dayBody}>
                {day.sectionGroups.map((sg, si) => (
                  <View key={si} style={styles.sectionGroup}>
                    {sg.sectionName && (
                      <View style={styles.sectionLabelRow}>
                        <View style={styles.sectionBar} />
                        <ThemedText
                          style={styles.sectionName}
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
        id="document-log"
        visible={false}
        title="This PDF's practice log"
        body={
          "Every session you've run on any passage in this PDF, grouped by section (if you've marked them).\n\n" +
          "Sections you marked on the PDF show up here as headers, making it easy to see at a glance which movements you've been drilling and which ones you've been skipping.\n\n" +
          "Tap any entry to edit its note and mood, play back a recording, or delete it — just like the other practice-log screens."
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.xs },
  backLink: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, color: Palette.accent },
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'], gap: 18 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  dayBlock: {
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    backgroundColor: Palette.inset,
    borderRadius: Radii.xl,
    overflow: 'hidden',
  },
  dayHeaderBar: {
    backgroundColor: Palette.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dayHeaderText: {
    fontFamily: Fonts.rounded,
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
    backgroundColor: Palette.accent,
  },
  sectionName: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
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
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    padding: 10,
    gap: 6,
    ...Lift,
    // overflow:hidden clips any pill that's still wider than the card
    // (rare after `pill.maxWidth: 100%` below, but a belt-and-braces
    // guard so a long exercise_name can never bleed into a neighbor).
    overflow: 'hidden',
  },
  passageCardPhone: {
    // Full-row card on phone — at flexBasis 48% the chips overflowed.
    flexBasis: '100%',
  },
  passageName: {
    fontWeight: Type.weight.bold,
    fontSize: Type.size.sm,
    color: Palette.text,
  },
  entryList: { gap: 2 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, minHeight: 32 },
  entryDot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  entryRowLabel: { flex: 1, fontSize: Type.size.sm, fontWeight: Type.weight.semibold, color: Palette.text },
  entry: { gap: 2 },
  noteText: {
    fontSize: Type.size.xs,
    color: Palette.textSecondary,
    marginLeft: Spacing.xs,
    fontStyle: 'italic',
  },
});
