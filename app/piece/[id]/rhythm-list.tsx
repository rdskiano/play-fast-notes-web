import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { PromptModal } from '@/components/PromptModal';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  insertExercise,
  listExercisesForPiece,
  renameExercise,
  softDeleteExercise,
  updateExerciseSortOrder,
  type Exercise,
} from '@/lib/db/repos/exercises';
import { getPiece, type Piece } from '@/lib/db/repos/pieces';

function parseGrouping(config_json: string): number | null {
  try {
    const parsed = JSON.parse(config_json);
    const g = parsed?.grouping;
    if (typeof g === 'number' && g >= 3 && g <= 8) return g;
  } catch {
    // ignore
  }
  return null;
}

function parsePitchCount(config_json: string): number {
  try {
    const parsed = JSON.parse(config_json);
    if (Array.isArray(parsed?.pitches)) return parsed.pitches.length;
  } catch {
    // ignore
  }
  return 0;
}

function displayName(ex: Exercise, fallbackIndex: number): string {
  if (ex.name && ex.name.trim().length > 0) return ex.name;
  return `Rhythmic ${fallbackIndex + 1}`;
}

type Prompt =
  | { kind: 'new' }
  | { kind: 'rename'; id: string; initial: string }
  | null;

export default function RhythmListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [piece, setPiece] = useState<Piece | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    const [p, ex] = await Promise.all([
      getPiece(id),
      listExercisesForPiece(id, 'rhythmic'),
    ]);
    setPiece(p);
    setExercises(ex);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function openExercise(exerciseId: string) {
    if (!id) return;
    router.push({
      pathname: '/piece/[id]/rhythm-builder',
      params: { id, exerciseId },
    });
  }

  async function onCreateSubmit(value: string) {
    setPrompt(null);
    if (!id) return;
    const name = value.trim() || `Rhythmic ${exercises.length + 1}`;
    const created = await insertExercise(id, 'rhythmic', name, '{}');
    await refresh();
    router.push({
      pathname: '/piece/[id]/rhythm-builder',
      params: { id, exerciseId: created.id },
    });
  }

  async function onRenameSubmit(value: string) {
    const current = prompt;
    setPrompt(null);
    if (!current || current.kind !== 'rename') return;
    const name = value.trim();
    if (!name) return;
    await renameExercise(current.id, name);
    refresh();
  }

  async function moveExercise(exerciseId: string, direction: -1 | 1) {
    const list = exercises.map((e) => e.id);
    const idx = list.indexOf(exerciseId);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    try {
      await Promise.all(
        reordered.map((rid, i) => updateExerciseSortOrder(rid, i)),
      );
    } catch (e) {
      console.warn('[rhythm-list] reorder failed', e);
    }
    refresh();
  }

  function confirmDelete(ex: Exercise, label: string) {
    const performDelete = async () => {
      await softDeleteExercise(ex.id);
      refresh();
    };
    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined' &&
        window.confirm(
          `Delete "${label}"? This removes the exercise. You can still find past practice logs on the piece history.`,
        );
      if (ok) performDelete();
      return;
    }
    Alert.alert(
      `Delete "${label}"?`,
      'This removes the exercise. You can still find past practice logs on the piece history.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ],
    );
  }

  const title = piece?.title ?? 'Rhythmic exercises';

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Back"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Rhythmic exercises
          </ThemedText>
        }
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Button
              label={editMode ? 'Done' : 'Edit'}
              variant="outline"
              size="sm"
              onPress={() => setEditMode((v) => !v)}
            />
            <Button label="+ New" size="sm" onPress={() => setPrompt({ kind: 'new' })} />
          </View>
        }
      />

      <View style={styles.pieceLabel}>
        <ThemedText style={{ opacity: 0.7 }} numberOfLines={1}>
          {title}
        </ThemedText>
      </View>

      {exercises.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={styles.emptyTitle}>No exercises yet.</ThemedText>
          <ThemedText style={styles.emptyBody}>
            Name each exercise something specific and positive — you can have more than
            one exercise per passage.
          </ThemedText>
          <Pressable
            onPress={() => setPrompt({ kind: 'new' })}
            style={[styles.emptyCta, { backgroundColor: C.tint }]}>
            <ThemedText style={styles.emptyCtaText}>+ New rhythmic exercise</ThemedText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={exercises}
          extraData={editMode}
          keyExtractor={(ex) => ex.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
          renderItem={({ item, index }) => {
            const label = displayName(item, index);
            const grouping = parseGrouping(item.config_json);
            const pitchCount = parsePitchCount(item.config_json);
            const parts: string[] = [];
            if (grouping) parts.push(`${grouping}-note grouping`);
            parts.push(`${pitchCount} ${pitchCount === 1 ? 'pitch' : 'pitches'}`);
            const subtitle = parts.join(' · ');
            return (
              <Pressable
                onPress={editMode ? undefined : () => openExercise(item.id)}
                style={[styles.card, { borderColor: C.icon }]}>
                <View style={[styles.iconWrap, { backgroundColor: '#9b59b622' }]}>
                  <ThemedText style={[styles.iconText, { color: '#9b59b6' }]}>♩</ThemedText>
                </View>
                <View style={styles.cardText}>
                  <ThemedText type="defaultSemiBold" numberOfLines={1}>
                    {label}
                  </ThemedText>
                  <ThemedText style={{ opacity: 0.6, fontSize: 12 }}>
                    {subtitle}
                  </ThemedText>
                </View>
                {editMode && (
                  <View style={styles.editActionsRow}>
                    <View style={styles.reorderColumn}>
                      <Pressable
                        hitSlop={6}
                        onPress={index > 0 ? () => moveExercise(item.id, -1) : undefined}
                        disabled={index === 0}
                        style={[styles.reorderBtn, { opacity: index > 0 ? 1 : 0.25 }]}>
                        <ThemedText style={[styles.reorderArrow, { color: C.icon }]}>↑</ThemedText>
                      </Pressable>
                      <Pressable
                        hitSlop={6}
                        onPress={
                          index < exercises.length - 1
                            ? () => moveExercise(item.id, 1)
                            : undefined
                        }
                        disabled={index >= exercises.length - 1}
                        style={[
                          styles.reorderBtn,
                          { opacity: index < exercises.length - 1 ? 1 : 0.25 },
                        ]}>
                        <ThemedText style={[styles.reorderArrow, { color: C.icon }]}>↓</ThemedText>
                      </Pressable>
                    </View>
                    <View style={styles.editActions}>
                      <Pressable
                        hitSlop={6}
                        onPress={() =>
                          setPrompt({ kind: 'rename', id: item.id, initial: label })
                        }
                        style={styles.editActionBtn}>
                        <ThemedText style={[styles.editActionText, { color: '#9b59b6' }]}>
                          Rename
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        hitSlop={6}
                        onPress={() => confirmDelete(item, label)}
                        style={styles.editActionBtn}>
                        <ThemedText style={[styles.editActionText, { color: '#c0392b' }]}>
                          Delete
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      <PromptModal
        visible={prompt?.kind === 'new'}
        title="New rhythmic exercise"
        message="Name it something specific and positive — you can have more than one exercise per passage."
        initialValue={`Rhythmic ${exercises.length + 1}`}
        placeholder="Exercise name"
        submitLabel="Create"
        onSubmit={onCreateSubmit}
        onCancel={() => setPrompt(null)}
      />
      <PromptModal
        visible={prompt?.kind === 'rename'}
        title="Rename exercise"
        initialValue={prompt?.kind === 'rename' ? prompt.initial : ''}
        placeholder="Exercise name"
        submitLabel="Save"
        onSubmit={onRenameSubmit}
        onCancel={() => setPrompt(null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  pieceLabel: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    paddingBottom: Spacing.xs,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: { fontSize: Type.size.lg, fontWeight: Type.weight.bold },
  emptyBody: { textAlign: 'center', opacity: 0.65, fontSize: Type.size.md, lineHeight: 20 },
  emptyCta: {
    marginTop: Spacing.sm,
    paddingHorizontal: 18,
    paddingVertical: Spacing.md,
    borderRadius: Radii.lg,
  },
  emptyCtaText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 15 },
  card: {
    flexDirection: 'row',
    gap: Spacing.md,
    borderWidth: Borders.thin,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: Type.size['3xl'], fontWeight: Type.weight.heavy },
  cardText: { flex: 1, gap: Spacing.xs },
  editActionsRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  editActions: { alignItems: 'flex-end', gap: 6 },
  editActionBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  editActionText: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  reorderColumn: { alignItems: 'center', gap: 2 },
  reorderBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  reorderArrow: { fontSize: Type.size.xl, fontWeight: Type.weight.heavy },
});
