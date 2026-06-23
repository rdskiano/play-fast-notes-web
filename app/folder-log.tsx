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
  getPracticeLogForFolder,
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

function parseRemindNext(entry: PracticeLogWithTitle): boolean {
  if (!entry.data_json) return false;
  try {
    const data = JSON.parse(entry.data_json);
    return data?.remindNext === true;
  } catch {
    return false;
  }
}

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

type DocumentSubGroup = {
  documentId: string;
  documentTitle: string;
  sectionGroups: SectionSubGroup[];
};

type DayGroup = {
  dateLabel: string;
  documentGroups: DocumentSubGroup[];
  standalonePassages: PassageGroup[];
};

export default function FolderLogScreen() {
  const router = useRouter();
  const { folderId, folderName } = useLocalSearchParams<{
    folderId?: string;
    folderName?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { colors: STRATEGY_COLORS } = useStrategyColors();
  const { width, height } = useWindowDimensions();
  const isPhone = Math.min(width, height) < 600;

  const [days, setDays] = useState<DayGroup[]>([]);
  const [editing, setEditing] = useState<PracticeLogWithTitle | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<PracticeLogWithTitle | null>(null);

  const resolvedFolderId = folderId === '' ? null : folderId ?? null;
  const title = folderName || 'Library';

  const refresh = useCallback(async () => {
    const entries = await getPracticeLogForFolder(resolvedFolderId);

    type DayBuilder = {
      dateLabel: string;
      docMap: Map<
        string,
        { documentTitle: string; sectionMap: Map<string, SectionSubGroup> }
      >;
      standaloneMap: Map<string, PassageGroup>;
    };
    const dayMap = new Map<string, DayBuilder>();

    for (const e of entries) {
      const dk = dateKey(e.practiced_at);
      if (!dayMap.has(dk)) {
        dayMap.set(dk, {
          dateLabel: formatDate(e.practiced_at),
          docMap: new Map(),
          standaloneMap: new Map(),
        });
      }
      const day = dayMap.get(dk)!;

      if (e.document_id && e.document_title) {
        if (!day.docMap.has(e.document_id)) {
          day.docMap.set(e.document_id, {
            documentTitle: e.document_title,
            sectionMap: new Map(),
          });
        }
        const doc = day.docMap.get(e.document_id)!;
        const sectionKey = e.section_name ?? '__nosection__';
        if (!doc.sectionMap.has(sectionKey)) {
          doc.sectionMap.set(sectionKey, {
            sectionName: e.section_name,
            passages: [],
          });
        }
        const section = doc.sectionMap.get(sectionKey)!;
        let pg = section.passages.find((p) => p.entries[0]?.piece_id === e.piece_id);
        if (!pg) {
          pg = { passageTitle: e.piece_title || 'Untitled', entries: [] };
          section.passages.push(pg);
        }
        pg.entries.push(e);
      } else {
        if (!day.standaloneMap.has(e.piece_id)) {
          day.standaloneMap.set(e.piece_id, {
            passageTitle: e.piece_title || 'Untitled',
            entries: [],
          });
        }
        day.standaloneMap.get(e.piece_id)!.entries.push(e);
      }
    }

    const result: DayGroup[] = [];
    for (const day of dayMap.values()) {
      result.push({
        dateLabel: day.dateLabel,
        documentGroups: Array.from(day.docMap.entries()).map(([docId, doc]) => ({
          documentId: docId,
          documentTitle: doc.documentTitle,
          sectionGroups: Array.from(doc.sectionMap.values()),
        })),
        standalonePassages: Array.from(day.standaloneMap.values()),
      });
    }
    setDays(result);
  }, [resolvedFolderId]);

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

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={styles.backLink}>‹ Library</ThemedText>
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
          {days.map((day) => {
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
              <View key={day.dateLabel}>
                <ThemedText style={styles.dateHeader}>{day.dateLabel}</ThemedText>

                {day.documentGroups.map((doc) => (
                  <View key={doc.documentId} style={styles.documentGroup}>
                    <ThemedText
                      style={styles.documentTitle}
                      numberOfLines={1}>
                      {doc.documentTitle}
                    </ThemedText>
                    {doc.sectionGroups.map((sg, si) => (
                      <View key={si} style={styles.sectionGroup}>
                        {sg.sectionName && (
                          <ThemedText
                            style={styles.sectionName}
                            numberOfLines={1}>
                            {sg.sectionName}
                          </ThemedText>
                        )}
                        <View style={styles.passageGrid}>
                          {sg.passages.map(renderPassage)}
                        </View>
                      </View>
                    ))}
                  </View>
                ))}

                {day.standalonePassages.length > 0 && (
                  <View style={styles.passageGrid}>
                    {day.standalonePassages.map(renderPassage)}
                  </View>
                )}
              </View>
            );
          })}
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
        id="folder-log"
        visible={false}
        title="Folder practice log"
        body={
          "Every session you've run on any passage inside this folder. Useful for tracking progress on a single work or student.\n\n" +
          "Tap any entry to edit its note and mood, play back any recording, or delete it."
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.xs },
  backLink: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, color: Palette.accent },
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'] },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  dateHeader: {
    fontFamily: Fonts.rounded,
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.lg,
    color: Palette.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
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
    overflow: 'hidden',
    ...Lift,
  },
  passageCardPhone: {
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
  documentGroup: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  documentTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    marginTop: Spacing.xs,
  },
  sectionGroup: {
    gap: Spacing.xs,
    marginLeft: Spacing.md,
  },
  sectionName: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.bold,
    color: Palette.textMuted,
    letterSpacing: 0.5,
  },
});
