import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { PromptModal } from '@/components/PromptModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getFolderPath,
  insertFolder,
  listFoldersInParent,
  rehomeOrphans,
  renameFolder,
  softDeleteFolder,
  updateFolderSortOrder,
  type Folder,
} from '@/lib/db/repos/folders';
import {
  listPiecesInFolder,
  renamePiece,
  softDeletePiece,
  updatePieceSortOrder,
  type Piece,
} from '@/lib/db/repos/pieces';
import { getTempoLadderProgressForPieces } from '@/lib/db/repos/tempoLadder';

type ListRow =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'piece'; piece: Piece };

type Prompt =
  | { kind: 'new_folder' }
  | { kind: 'rename_folder'; id: string; initial: string }
  | { kind: 'rename_piece'; id: string; initial: string }
  | null;

function confirmDelete(label: string, message: string): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(`Delete "${label}"?\n\n${message}`);
  }
  return true;
}

type FolderCardProps = {
  folder: Folder;
  borderColor: string;
  tintColor: string;
  moreColor: string;
  editMode: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEnter: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: () => void;
  onDelete: () => void;
};

function FolderCard({
  folder,
  borderColor,
  tintColor,
  moreColor,
  editMode,
  canMoveUp,
  canMoveDown,
  onEnter,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
}: FolderCardProps) {
  return (
    <Pressable
      onPress={editMode ? undefined : onEnter}
      style={[styles.card, { borderColor }]}>
      <View style={[styles.folderIcon, { backgroundColor: tintColor + '22' }]}>
        <IconSymbol name="folder.fill" size={44} color={tintColor} />
      </View>
      <ThemedView style={styles.cardText}>
        <ThemedText type="defaultSemiBold">{folder.name}</ThemedText>
        <ThemedText style={{ opacity: Opacity.muted, fontSize: Type.size.xs }}>
          Folder
        </ThemedText>
      </ThemedView>
      {editMode && (
        <View style={styles.editActions}>
          <View style={styles.reorderColumn}>
            <Pressable
              hitSlop={6}
              onPress={canMoveUp ? onMoveUp : undefined}
              disabled={!canMoveUp}
              style={[styles.reorderBtn, { opacity: canMoveUp ? 1 : 0.25 }]}>
              <ThemedText style={[styles.reorderArrow, { color: moreColor }]}>↑</ThemedText>
            </Pressable>
            <Pressable
              hitSlop={6}
              onPress={canMoveDown ? onMoveDown : undefined}
              disabled={!canMoveDown}
              style={[styles.reorderBtn, { opacity: canMoveDown ? 1 : 0.25 }]}>
              <ThemedText style={[styles.reorderArrow, { color: moreColor }]}>↓</ThemedText>
            </Pressable>
          </View>
          <View style={styles.editActionsColumn}>
            <Pressable hitSlop={6} onPress={onRename} style={styles.editActionBtn}>
              <ThemedText style={[styles.editActionText, { color: tintColor }]}>Rename</ThemedText>
            </Pressable>
            <Pressable hitSlop={6} onPress={onDelete} style={styles.editActionBtn}>
              <ThemedText style={[styles.editActionText, { color: '#c0392b' }]}>Delete</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

type PieceCardProps = {
  piece: Piece;
  borderColor: string;
  tintColor: string;
  moreColor: string;
  editMode: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  scuPct: number | null;
  onOpen: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: () => void;
  onDelete: () => void;
};

function PieceCard({
  piece,
  borderColor,
  tintColor,
  moreColor,
  editMode,
  canMoveUp,
  canMoveDown,
  scuPct,
  onOpen,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
}: PieceCardProps) {
  return (
    <Pressable
      onPress={editMode ? undefined : onOpen}
      style={[styles.card, { borderColor }]}>
      {piece.thumbnail_uri ? (
        <Image
          source={{ uri: piece.thumbnail_uri }}
          style={styles.thumb}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.thumb, { backgroundColor: tintColor + '11' }]} />
      )}
      <ThemedView style={styles.cardText}>
        <ThemedText type="defaultSemiBold">{piece.title}</ThemedText>
        {piece.composer && (
          <ThemedText style={{ opacity: Opacity.muted }}>{piece.composer}</ThemedText>
        )}
      </ThemedView>
      {!editMode && scuPct !== null && (
        <View style={[styles.scuBadge, { backgroundColor: tintColor }]}>
          <ThemedText style={styles.scuBadgeText}>Tempo {scuPct}%</ThemedText>
        </View>
      )}
      {editMode && (
        <View style={styles.editActions}>
          <View style={styles.reorderColumn}>
            <Pressable
              hitSlop={6}
              onPress={canMoveUp ? onMoveUp : undefined}
              disabled={!canMoveUp}
              style={[styles.reorderBtn, { opacity: canMoveUp ? 1 : 0.25 }]}>
              <ThemedText style={[styles.reorderArrow, { color: moreColor }]}>↑</ThemedText>
            </Pressable>
            <Pressable
              hitSlop={6}
              onPress={canMoveDown ? onMoveDown : undefined}
              disabled={!canMoveDown}
              style={[styles.reorderBtn, { opacity: canMoveDown ? 1 : 0.25 }]}>
              <ThemedText style={[styles.reorderArrow, { color: moreColor }]}>↓</ThemedText>
            </Pressable>
          </View>
          <View style={styles.editActionsColumn}>
            <Pressable hitSlop={6} onPress={onRename} style={styles.editActionBtn}>
              <ThemedText style={[styles.editActionText, { color: tintColor }]}>Rename</ThemedText>
            </Pressable>
            <Pressable hitSlop={6} onPress={onDelete} style={styles.editActionBtn}>
              <ThemedText style={[styles.editActionText, { color: '#c0392b' }]}>Delete</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [path, setPath] = useState<Folder[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [scuProgress, setScuProgress] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [progressionOpen, setProgressionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      await rehomeOrphans();
      const [f, p, pathF] = await Promise.all([
        listFoldersInParent(currentFolderId),
        listPiecesInFolder(currentFolderId),
        getFolderPath(currentFolderId),
      ]);
      setFolders(f);
      setPieces(p);
      setPath(pathF);
      if (p.length > 0) {
        const rows = await getTempoLadderProgressForPieces(p.map((x) => x.id));
        const map: Record<string, number> = {};
        for (const r of rows) {
          if (r.goal_tempo > 0) {
            map[r.piece_id] = Math.max(
              0,
              Math.min(100, Math.round((r.current_tempo / r.goal_tempo) * 100)),
            );
          }
        }
        setScuProgress(map);
      } else {
        setScuProgress({});
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [currentFolderId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const q = searchQuery.trim().toLowerCase();
  const filteredFolders = q
    ? folders.filter((f) => f.name.toLowerCase().includes(q))
    : folders;
  const filteredPieces = q
    ? pieces.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.composer ?? '').toLowerCase().includes(q),
      )
    : pieces;
  const rows: ListRow[] = [
    ...filteredFolders.map((folder) => ({ kind: 'folder' as const, folder })),
    ...filteredPieces.map((piece) => ({ kind: 'piece' as const, piece })),
  ];

  function goUp() {
    const parent = path.length >= 2 ? path[path.length - 2].id : null;
    setCurrentFolderId(parent);
    setEditMode(false);
  }

  function enterFolder(id: string) {
    setCurrentFolderId(id);
    setEditMode(false);
  }

  async function moveItem(
    kind: 'folder' | 'piece',
    id: string,
    direction: -1 | 1,
  ) {
    const list = kind === 'folder' ? folders.map((f) => f.id) : pieces.map((p) => p.id);
    const idx = list.indexOf(id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    for (let i = 0; i < reordered.length; i++) {
      if (kind === 'folder') {
        await updateFolderSortOrder(reordered[i], i);
      } else {
        await updatePieceSortOrder(reordered[i], i);
      }
    }
    refresh();
  }

  async function onPromptSubmit(value: string) {
    if (!prompt) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setPrompt(null);
      return;
    }
    if (prompt.kind === 'new_folder') {
      await insertFolder(trimmed, currentFolderId);
    } else if (prompt.kind === 'rename_folder') {
      await renameFolder(prompt.id, trimmed);
    } else if (prompt.kind === 'rename_piece') {
      await renamePiece(prompt.id, trimmed);
    }
    setPrompt(null);
    refresh();
  }

  function onDeleteFolder(f: Folder) {
    if (
      !confirmDelete(
        f.name,
        'The folder will be removed. Anything inside will move up to the parent level — nothing is deleted with it.',
      )
    )
      return;
    softDeleteFolder(f.id).then(refresh).catch(() => undefined);
  }

  function onDeletePiece(p: Piece) {
    if (!confirmDelete(p.title, 'This removes the piece from your library.')) return;
    softDeletePiece(p.id).then(refresh).catch(() => undefined);
  }

  const isAtRoot = path.length === 0;
  const currentFolderName = isAtRoot ? 'Play Fast Notes' : path[path.length - 1].name;

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          {path.length > 0 && (
            <Pressable onPress={goUp} hitSlop={8} style={styles.backBtn}>
              <ThemedText style={[styles.backArrow, { color: C.tint }]}>‹</ThemedText>
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <ThemedText type="title" numberOfLines={1}>
              {currentFolderName}
            </ThemedText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          {editMode ? (
            <Button label="Done" size="sm" onPress={() => setEditMode(false)} />
          ) : (
            <>
              <Button
                label="Practice Log"
                variant="outline"
                size="sm"
                onPress={() => router.push('/library-log')}
              />
              <Button
                label="⚙"
                variant="outline"
                size="sm"
                onPress={() => router.push('/settings')}
              />
              <Button
                label="Edit"
                variant="outline"
                size="sm"
                onPress={() => setEditMode(true)}
              />
              <Button label="+ Add" size="sm" onPress={() => setAddOpen(true)} />
            </>
          )}
        </View>
      </ThemedView>

      {isAtRoot && !editMode && (
        <View style={styles.hintBlock}>
          <ThemedText style={styles.tagline}>
            Crop difficult passages from your music and practice them with guided strategies.
          </ThemedText>
          <ThemedText style={styles.hint}>
            Organize by repertoire title, concert, lesson, audition list — whatever helps you practice.
          </ThemedText>
          <ThemedText style={styles.hint}>
            Name passages specifically and keep it positive — a measure range, section name, or a fun label.
          </ThemedText>
        </View>
      )}

      {editMode && (
        <View style={[styles.editHintBanner, { borderColor: C.tint + '44', backgroundColor: C.tint + '11' }]}>
          <ThemedText style={[styles.editHintText, { color: C.text }]}>
            Tap <ThemedText style={styles.editHintBold}>↑ ↓</ThemedText> to reorder ·{' '}
            <ThemedText style={styles.editHintBold}>Rename</ThemedText> /{' '}
            <ThemedText style={styles.editHintBold}>Delete</ThemedText> as needed
          </ThemedText>
          <ThemedText style={[styles.editHintSub, { color: C.icon }]}>
            Outside Edit: tap a folder or piece to open it.
          </ThemedText>
        </View>
      )}

      <View style={styles.modeRow}>
        <View style={styles.modeSegments}>
          <Pressable
            disabled
            style={[styles.modeSeg, styles.modeSegActive, { backgroundColor: C.tint }]}>
            <ThemedText style={styles.modeSegActiveText}>Blocked</ThemedText>
          </Pressable>
          <Pressable
            disabled
            style={[styles.modeSeg, { borderColor: C.tint, opacity: Opacity.muted }]}>
            <ThemedText style={[styles.modeSegText, { color: C.tint }]}>
              Serial Practice
            </ThemedText>
          </Pressable>
        </View>
        <Pressable
          onPress={() => setProgressionOpen(true)}
          hitSlop={6}
          style={[styles.modeHelpBtn, { borderColor: C.icon }]}>
          <ThemedText style={[styles.modeHelpText, { color: C.icon }]}>?</ThemedText>
        </Pressable>
      </View>

      <View style={[styles.searchWrap, { borderColor: C.icon + '66' }]}>
        <ThemedText style={[styles.searchIcon, { color: C.icon }]}>⌕</ThemedText>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search folders and pieces"
          placeholderTextColor={C.icon}
          style={[styles.searchInput, { color: C.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <ThemedText style={[styles.searchClear, { color: C.icon }]}>✕</ThemedText>
          </Pressable>
        )}
      </View>

      {error ? (
        <ThemedView style={styles.empty}>
          <ThemedText style={{ color: '#c0392b', textAlign: 'center' }}>
            Could not load your library: {error}
          </ThemedText>
          <Button label="Retry" variant="outline" size="sm" onPress={refresh} />
        </ThemedView>
      ) : rows.length === 0 ? (
        <ThemedView style={styles.empty}>
          <ThemedText style={{ opacity: Opacity.muted, textAlign: 'center' }}>
            {q
              ? 'Nothing matches that search.'
              : currentFolderId
                ? 'This folder is empty.'
                : 'Create a folder for each piece of repertoire, then add the passages you want to practice inside it.'}
          </ThemedText>
          {!q && (
            <ThemedText style={{ opacity: Opacity.muted }}>
              Tap "+ Add" to get started.
            </ThemedText>
          )}
        </ThemedView>
      ) : (
        <FlatList
          data={rows}
          extraData={editMode}
          keyExtractor={(row) =>
            row.kind === 'folder' ? `f:${row.folder.id}` : `p:${row.piece.id}`
          }
          contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing.xl }}
          renderItem={({ item }) => {
            if (item.kind === 'folder') {
              const folderIdx = filteredFolders.findIndex((f) => f.id === item.folder.id);
              return (
                <FolderCard
                  folder={item.folder}
                  borderColor={C.icon}
                  tintColor={C.tint}
                  moreColor={C.icon}
                  editMode={editMode}
                  canMoveUp={folderIdx > 0}
                  canMoveDown={folderIdx >= 0 && folderIdx < filteredFolders.length - 1}
                  onEnter={() => enterFolder(item.folder.id)}
                  onMoveUp={() => moveItem('folder', item.folder.id, -1)}
                  onMoveDown={() => moveItem('folder', item.folder.id, 1)}
                  onRename={() =>
                    setPrompt({ kind: 'rename_folder', id: item.folder.id, initial: item.folder.name })
                  }
                  onDelete={() => onDeleteFolder(item.folder)}
                />
              );
            }
            const pieceIdx = filteredPieces.findIndex((p) => p.id === item.piece.id);
            return (
              <PieceCard
                piece={item.piece}
                borderColor={C.icon}
                tintColor={C.tint}
                moreColor={C.icon}
                editMode={editMode}
                canMoveUp={pieceIdx > 0}
                canMoveDown={pieceIdx >= 0 && pieceIdx < filteredPieces.length - 1}
                scuPct={scuProgress[item.piece.id] ?? null}
                onOpen={() => router.push(`/piece/${item.piece.id}`)}
                onMoveUp={() => moveItem('piece', item.piece.id, -1)}
                onMoveDown={() => moveItem('piece', item.piece.id, 1)}
                onRename={() =>
                  setPrompt({ kind: 'rename_piece', id: item.piece.id, initial: item.piece.title })
                }
                onDelete={() => onDeletePiece(item.piece)}
              />
            );
          }}
        />
      )}

      <PromptModal
        visible={prompt !== null}
        title={
          prompt?.kind === 'new_folder'
            ? 'New folder'
            : prompt?.kind === 'rename_folder'
              ? 'Rename folder'
              : 'Rename piece'
        }
        initialValue={prompt && 'initial' in prompt ? prompt.initial : ''}
        placeholder={prompt?.kind === 'new_folder' ? 'Folder name' : 'New name'}
        submitLabel="Save"
        onSubmit={onPromptSubmit}
        onCancel={() => setPrompt(null)}
      />

      <AddChooserModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onPickPiece={() => {
          setAddOpen(false);
          router.push({
            pathname: '/upload',
            params: { folder: currentFolderId ?? '' },
          });
        }}
        onPickFolder={() => {
          setAddOpen(false);
          setPrompt({ kind: 'new_folder' });
        }}
      />

      <PracticeProgressionModal
        visible={progressionOpen}
        onClose={() => setProgressionOpen(false)}
      />
    </ThemedView>
  );
}

function AddChooserModal({
  visible,
  onClose,
  onPickPiece,
  onPickFolder,
}: {
  visible: boolean;
  onClose: () => void;
  onPickPiece: () => void;
  onPickFolder: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: C.background }]}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            Add
          </ThemedText>
          <Button label="+ New piece" onPress={onPickPiece} fullWidth />
          <Button label="+ New folder" variant="outline" onPress={onPickFolder} fullWidth />
          <Button label="Cancel" variant="ghost" onPress={onClose} fullWidth />
        </View>
      </View>
    </Modal>
  );
}

function PracticeProgressionModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const steps = [
    {
      title: 'Blocked',
      body:
        'What most people do all the time: one piece at a time, over and over. Great for starting out. The key is making sure the passage stays PLAYABLE — slow the tempo enough or shrink the chunk enough that you can play it cleanly.',
    },
    {
      title: 'Serial Practice',
      body:
        'Drill several pieces in a single session — spend a fixed amount of time or a fixed number of repetitions on each, then move on. Inside, you pick an order: Serial (same rotation each time, predictable) or Interleaved (random rotation across selected passages — tests whether you can perform on the first try, like an audition).',
    },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.progressionCard, { backgroundColor: C.background }]}>
          <ThemedText type="title" style={{ textAlign: 'center' }}>
            Practice progression
          </ThemedText>
          <ThemedText style={[styles.progressionIntro, { color: C.icon }]}>
            Blocked practice is generally more beneficial early in the learning
            process; Serial Practice — especially in interleaved order — becomes
            more helpful closer to performance.
          </ThemedText>
          {steps.map((s, i) => (
            <View key={s.title} style={styles.progressionStep}>
              <View style={[styles.progressionBullet, { backgroundColor: C.tint }]}>
                <ThemedText style={styles.progressionBulletText}>{i + 1}</ThemedText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText style={styles.progressionTitle}>{s.title}</ThemedText>
                <ThemedText style={[styles.progressionBody, { color: C.icon }]}>
                  {s.body}
                </ThemedText>
              </View>
            </View>
          ))}
          <Button label="Close" onPress={onClose} fullWidth />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backBtn: { paddingHorizontal: Spacing.xs },
  backArrow: { fontSize: 32, fontWeight: '400', lineHeight: 34 },
  hintBlock: { gap: Spacing.xs, marginTop: -8 },
  tagline: {
    opacity: Opacity.subtle,
    fontSize: Type.size.md,
    lineHeight: 20,
  },
  hint: {
    opacity: Opacity.faint,
    fontSize: Type.size.xs,
    lineHeight: 16,
  },
  editHintBanner: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.xs,
    marginTop: -8,
  },
  editHintText: { fontSize: Type.size.sm, lineHeight: 18 },
  editHintSub: { fontSize: Type.size.xs, lineHeight: 15 },
  editHintBold: { fontWeight: Type.weight.heavy },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  modeSegments: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  modeSeg: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 10,
    borderRadius: Radii.md,
    borderWidth: Borders.medium,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  modeSegActive: { borderWidth: 0 },
  modeSegActiveText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.sm },
  modeSegText: { fontWeight: Type.weight.heavy, fontSize: Type.size.sm },
  modeHelpBtn: {
    width: 36,
    height: 36,
    borderRadius: Radii['2xl'],
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeHelpText: { fontWeight: Type.weight.heavy, fontSize: 15 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchIcon: { fontSize: Type.size.xl, fontWeight: Type.weight.bold },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 2 },
  searchClear: { fontSize: Type.size.md, fontWeight: Type.weight.heavy },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    gap: Spacing.md,
    borderWidth: Borders.thin,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    alignItems: 'center',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: Radii.sm,
    backgroundColor: '#0002',
  },
  folderIcon: {
    width: 72,
    height: 72,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: Spacing.xs },
  scuBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.md,
  },
  scuBadgeText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.xs },
  editActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  editActionsColumn: { alignItems: 'flex-end', gap: 6 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: Overlays.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  progressionCard: {
    width: '100%',
    maxWidth: 500,
    borderRadius: Radii['2xl'],
    padding: 20,
    gap: 14,
  },
  progressionIntro: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    lineHeight: 18,
    marginTop: -6,
  },
  progressionStep: { flexDirection: 'row', gap: Spacing.md },
  progressionBullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  progressionBulletText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  progressionTitle: { fontWeight: Type.weight.heavy, fontSize: 15 },
  progressionBody: { fontSize: Type.size.sm, lineHeight: 18 },
});
