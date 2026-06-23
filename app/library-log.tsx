import { Stack, useRouter } from 'expo-router';
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
import { listAllFolders, type Folder } from '@/lib/db/repos/folders';
import {
  deletePracticeLog,
  getPracticeLogForLibrary,
  updatePracticeLogMoodNote,
  type LibraryPracticeLogEntry,
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

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function recordingUri(entry: LibraryPracticeLogEntry): string | null {
  if (!entry.data_json) return null;
  try {
    const data = JSON.parse(entry.data_json);
    return typeof data.recording_uri === 'string' ? data.recording_uri : null;
  } catch {
    return null;
  }
}

function entryLabel(e: LibraryPracticeLogEntry): string {
  const label = strategyLabel(e);
  const exercise =
    e.exercise_name && e.exercise_name.trim().length > 0 ? e.exercise_name : null;
  const detail = formatPracticeDetail(e, { compact: true });
  const { mood } = parseMoodNote(e);
  const parts = [label];
  if (exercise) parts.push(exercise);
  if (detail) parts.push(detail);
  if (mood) parts.push(mood);
  return parts.join(' · ');
}

function parseMoodNote(entry: LibraryPracticeLogEntry): {
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

function parseRemindNext(entry: LibraryPracticeLogEntry): boolean {
  if (!entry.data_json) return false;
  try {
    const data = JSON.parse(entry.data_json);
    return data?.remindNext === true;
  } catch {
    return false;
  }
}

type PassageGroup = {
  passageTitle: string;
  folderName: string | null;
  entries: LibraryPracticeLogEntry[];
};

// Card label inside by-date view. The PDF title is now a header above the
// cards, so we omit document_title here to avoid the same name repeating on
// every card. Section name (movement) stays inline: "IV. Adagio · bars 281-291".
function dateCardLabel(e: LibraryPracticeLogEntry): string {
  const title = e.piece_title || 'Untitled';
  const parts: string[] = [];
  if (e.section_name) parts.push(e.section_name);
  parts.push(title);
  return parts.join(' · ');
}

type DateDocGroup = {
  documentId: string;
  documentTitle: string;
  passages: PassageGroup[];
};

type DayFolderGroup = {
  folderId: string | null;
  folderName: string;
  documentGroups: DateDocGroup[];
  standalonePassages: PassageGroup[];
};

type DayGroup = { dateLabel: string; folders: DayFolderGroup[] };

function renderDateCard(
  pg: PassageGroup,
  key: number,
  STRATEGY_COLORS: Record<string, string>,
  setEditing: (e: LibraryPracticeLogEntry) => void,
  isPhone: boolean,
) {
  const isDeleted = pg.entries.some((e) => e.is_deleted);
  return (
    <View
      key={key}
      style={[styles.card, isPhone && styles.cardPhone]}>
      <View style={styles.nameRow}>
        <ThemedText
          style={[styles.passageName, isDeleted && { color: Palette.textMuted }]}
          numberOfLines={1}>
          {pg.passageTitle}
        </ThemedText>
        {isDeleted && (
          <ThemedText style={styles.deletedTag}>
            deleted
          </ThemedText>
        )}
      </View>
      {/* DESIGN_RULES §2: strategies render as neutral rows with a small
          colored dot + ink label, not fully-saturated filled pills. */}
      <View style={styles.entryList}>
        {pg.entries.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => setEditing(e)}
            style={styles.entryRow}>
            <View
              style={[
                styles.entryDot,
                { backgroundColor: STRATEGY_COLORS[e.strategy] ?? Palette.textMuted },
              ]}
            />
            <ThemedText style={styles.entryRowLabel} numberOfLines={2}>
              {entryLabel(e)}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      {pg.entries.some((e) => parseMoodNote(e).note) && (
        <View style={styles.notesList}>
          {pg.entries.map((e) => {
            const { note } = parseMoodNote(e);
            if (!note) return null;
            return (
              <ThemedText
                key={e.id}
                style={styles.noteText}
                numberOfLines={2}>
                {note}
              </ThemedText>
            );
          })}
        </View>
      )}
      {pg.entries.map((e) => {
        const uri = recordingUri(e);
        if (!uri) return null;
        return <RecordingPlayer key={`rec-${e.id}`} uri={uri} />;
      })}
    </View>
  );
}

export default function LibraryLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: STRATEGY_COLORS } = useStrategyColors();
  const { width, height } = useWindowDimensions();
  const isPhone = Math.min(width, height) < 600;

  const [entries, setEntries] = useState<LibraryPracticeLogEntry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [editing, setEditing] = useState<LibraryPracticeLogEntry | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<LibraryPracticeLogEntry | null>(null);

  const refresh = useCallback(async () => {
    const [ents, flds] = await Promise.all([
      getPracticeLogForLibrary(),
      listAllFolders(),
    ]);
    setEntries(ents);
    setFolders(flds);
  }, []);

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
    // Stage the target and let ConfirmModal take it from here. iPad Safari
    // suppresses window.confirm in modal contexts, so the in-app modal is
    // the only reliable confirmation surface.
    setDeleteConfirmFor(editing);
    setEditing(null);
  }

  async function performDelete() {
    if (!deleteConfirmFor) return;
    await deletePracticeLog(deleteConfirmFor.id);
    setDeleteConfirmFor(null);
    refresh();
  }

  // ── By-date grouping: day → folder → (document → passages) + standalones ──
  // Folder order within a day follows the Library's folder sort order;
  // "Unfiled" (folder_id = null) comes last. Within a folder, passages that
  // came from a PDF cluster under their document title so the PDF name is
  // shown once as a heading instead of repeated on every card.
  const folderOrderIndex = new Map<string | null, number>();
  folders.forEach((f, idx) => folderOrderIndex.set(f.id, idx));
  folderOrderIndex.set(null, folders.length);

  const dayGroups: DayGroup[] = [];
  {
    type DateFolderBuilder = {
      folderName: string;
      docMap: Map<string, { documentTitle: string; passageMap: Map<string, PassageGroup> }>;
      standaloneMap: Map<string, PassageGroup>;
    };
    const dayMap = new Map<
      string,
      {
        dateLabel: string;
        folderMap: Map<string | null, DateFolderBuilder>;
      }
    >();
    for (const e of entries) {
      const dk = dateKey(e.practiced_at);
      if (!dayMap.has(dk)) {
        dayMap.set(dk, {
          dateLabel: formatDate(e.practiced_at),
          folderMap: new Map(),
        });
      }
      const day = dayMap.get(dk)!;
      const fKey = e.folder_id ?? null;
      if (!day.folderMap.has(fKey)) {
        day.folderMap.set(fKey, {
          folderName:
            fKey === null
              ? 'Unfiled'
              : e.folder_name || folders.find((f) => f.id === fKey)?.name || 'Folder',
          docMap: new Map(),
          standaloneMap: new Map(),
        });
      }
      const folder = day.folderMap.get(fKey)!;
      if (e.document_id && e.document_title) {
        if (!folder.docMap.has(e.document_id)) {
          folder.docMap.set(e.document_id, {
            documentTitle: e.document_title,
            passageMap: new Map(),
          });
        }
        const doc = folder.docMap.get(e.document_id)!;
        if (!doc.passageMap.has(e.piece_id)) {
          doc.passageMap.set(e.piece_id, {
            passageTitle: dateCardLabel(e),
            folderName: e.folder_name,
            entries: [],
          });
        }
        doc.passageMap.get(e.piece_id)!.entries.push(e);
      } else {
        if (!folder.standaloneMap.has(e.piece_id)) {
          folder.standaloneMap.set(e.piece_id, {
            passageTitle: e.piece_title || 'Untitled',
            folderName: e.folder_name,
            entries: [],
          });
        }
        folder.standaloneMap.get(e.piece_id)!.entries.push(e);
      }
    }
    for (const day of dayMap.values()) {
      const folderKeys = Array.from(day.folderMap.keys()).sort(
        (a, b) =>
          (folderOrderIndex.get(a) ?? 9999) - (folderOrderIndex.get(b) ?? 9999),
      );
      const dayFolders: DayFolderGroup[] = folderKeys.map((fKey) => {
        const f = day.folderMap.get(fKey)!;
        return {
          folderId: fKey,
          folderName: f.folderName,
          documentGroups: Array.from(f.docMap.entries()).map(([docId, doc]) => ({
            documentId: docId,
            documentTitle: doc.documentTitle,
            passages: Array.from(doc.passageMap.values()),
          })),
          standalonePassages: Array.from(f.standaloneMap.values()),
        };
      });
      dayGroups.push({
        dateLabel: day.dateLabel,
        folders: dayFolders,
      });
    }
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={styles.backLink}>‹ Library</ThemedText>
        </Pressable>
        <ThemedText type="title">Practice log</ThemedText>
      </View>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ color: Palette.textMuted, textAlign: 'center' }}>
            No practice sessions recorded yet.
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {dayGroups.map((day, i) => (
            <View key={i} style={styles.dayBlock}>
              <View style={styles.dayHeaderBar}>
                <ThemedText style={styles.dayHeaderText}>
                  {day.dateLabel}
                </ThemedText>
              </View>
              {day.folders.map((folder, fi) => (
                <View
                  key={fi}
                  style={[
                    styles.folderSection,
                    fi > 0 && { borderTopColor: Palette.border, borderTopWidth: 1 },
                  ]}>
                  {folder.folderName !== 'Unfiled' && (
                    <View style={styles.folderLabelRow}>
                      <View style={styles.folderBar} />
                      <ThemedText style={styles.folderLabel} numberOfLines={1}>
                        {folder.folderName}
                      </ThemedText>
                    </View>
                  )}
                  {folder.documentGroups.map((docGroup) => (
                    <View key={docGroup.documentId} style={styles.documentGroup}>
                      <ThemedText style={styles.documentTitle} numberOfLines={1}>
                        {docGroup.documentTitle}
                      </ThemedText>
                      <View style={styles.grid}>
                        {docGroup.passages.map((pg, j) =>
                          renderDateCard(pg, j, STRATEGY_COLORS, setEditing, isPhone),
                        )}
                      </View>
                    </View>
                  ))}
                  {folder.standalonePassages.length > 0 && (
                    <View style={styles.grid}>
                      {folder.standalonePassages.map((pg, j) =>
                        renderDateCard(pg, j, STRATEGY_COLORS, setEditing, isPhone),
                      )}
                    </View>
                  )}
                </View>
              ))}
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
        id="library-log"
        visible={false}
        title="Your practice log"
        body={
          "Every session you've ever run, grouped by day so you can spot patterns — what you've been drilling, what you've been ignoring.\n\n" +
          'Tap any entry to open it — add or change its mood and note, play back a recording you made during the session, or delete the entry.'
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.xs },
  backLink: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, color: Palette.accent },
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'], gap: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'] },
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
    letterSpacing: 0.2,
  },
  folderSection: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  folderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  folderBar: {
    width: Spacing.xs,
    height: 18,
    borderRadius: 2,
    backgroundColor: Palette.accent,
  },
  folderLabel: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  card: {
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
  cardPhone: {
    flexBasis: '100%',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  passageName: { fontWeight: Type.weight.bold, fontSize: Type.size.sm, color: Palette.text, flexShrink: 1 },
  deletedTag: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: Palette.textMuted,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  entryList: { gap: 2 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    minHeight: 32,
  },
  entryDot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  entryRowLabel: { flex: 1, fontSize: Type.size.sm, fontWeight: Type.weight.semibold, color: Palette.text },
  notesList: { gap: 2, marginTop: Spacing.xs },
  noteText: { fontSize: Type.size.xs, fontStyle: 'italic', color: Palette.textSecondary },
  documentGroup: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  documentTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    paddingBottom: Spacing.xs,
    borderBottomWidth: Borders.thin,
    borderBottomColor: Palette.accent + '55',
    marginTop: Spacing.xs,
  },
});
