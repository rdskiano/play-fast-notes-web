import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { ActionSheet, type ActionSheetItem } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { MoveToPicker } from '@/components/MoveToPicker';
import { PromptModal } from '@/components/PromptModal';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getFolder,
  getFolderPath,
  insertFolder,
  listAllFolders,
  listFoldersInParent,
  moveFolder,
  rehomeOrphans,
  renameFolder,
  softDeleteFolder,
  updateFolderSortOrder,
  type Folder,
} from '@/lib/db/repos/folders';
import {
  getPassage,
  listPassagesInFolder,
  movePassage,
  renamePassage,
  softDeletePassage,
  updatePassageSortOrder,
  type Passage,
} from '@/lib/db/repos/passages';
import {
  getDocument,
  listDocumentsInFolder,
  moveDocument,
  parsePages,
  renameDocument,
  softDeleteDocument,
  updateDocumentSortOrder,
  type DocumentRow,
} from '@/lib/db/repos/documents';
import { getTempoLadderProgressForPassages } from '@/lib/db/repos/tempoLadder';
import { bmacUrl } from '@/lib/links';

type ListRow =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'passage'; passage: Passage }
  | { kind: 'document'; document: DocumentRow };

type Prompt =
  | { kind: 'new_folder' }
  | { kind: 'rename_folder'; id: string; initial: string }
  | { kind: 'rename_passage'; id: string; initial: string }
  | { kind: 'rename_document'; id: string; initial: string }
  | null;

type MoveTarget =
  | { kind: 'folder'; id: string }
  | { kind: 'passage'; id: string }
  | { kind: 'document'; id: string }
  | null;

type ActionTarget =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'passage'; passage: Passage }
  | { kind: 'document'; document: DocumentRow }
  | null;

type UndoMove = {
  kind: 'folder' | 'passage' | 'document';
  id: string;
  fromParent: string | null;
  label: string;
};

function confirmDelete(label: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(`Delete "${label}"?\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(`Delete "${label}"?`, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

type FolderCardProps = {
  folder: Folder;
  borderColor: string;
  tintColor: string;
  moreColor: string;
  editMode: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isPhone?: boolean;
  onEnter: () => void;
  onLongPress: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: () => void;
  onMove: () => void;
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
  isPhone,
  onEnter,
  onLongPress,
  onMoveUp,
  onMoveDown,
  onRename,
  onMove,
  onDelete,
}: FolderCardProps) {
  return (
    <Pressable
      onPress={editMode ? undefined : onEnter}
      onLongPress={editMode ? undefined : onLongPress}
      delayLongPress={400}
      style={[isPhone ? styles.cardPhone : styles.card, { borderColor }]}>
      <View
        style={[
          isPhone ? styles.folderIconPhone : styles.folderIcon,
          { backgroundColor: tintColor + '22' },
        ]}>
        <IconSymbol name="folder.fill" size={isPhone ? 28 : 44} color={tintColor} />
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
            <Pressable hitSlop={6} onPress={onMove} style={styles.editActionBtn}>
              <ThemedText style={[styles.editActionText, { color: tintColor }]}>Move</ThemedText>
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

type PassageCardProps = {
  passage: Passage;
  borderColor: string;
  tintColor: string;
  tempoColor: string;
  moreColor: string;
  editMode: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isPhone?: boolean;
  scuPct: number | null;
  onOpen: () => void;
  onLongPress: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
};

function PassageCard({
  passage,
  borderColor,
  tintColor,
  tempoColor,
  moreColor,
  editMode,
  canMoveUp,
  canMoveDown,
  isPhone,
  scuPct,
  onOpen,
  onLongPress,
  onMoveUp,
  onMoveDown,
  onRename,
  onMove,
  onDelete,
}: PassageCardProps) {
  const thumbStyle = isPhone ? styles.thumbPhone : styles.thumb;
  return (
    <Pressable
      onPress={editMode ? undefined : onOpen}
      onLongPress={editMode ? undefined : onLongPress}
      delayLongPress={400}
      style={[isPhone ? styles.cardPhone : styles.card, { borderColor }]}>
      {passage.thumbnail_uri ? (
        <Image
          source={{ uri: passage.thumbnail_uri }}
          style={thumbStyle}
          contentFit="cover"
        />
      ) : (
        <View style={[thumbStyle, { backgroundColor: tintColor + '11' }]} />
      )}
      <ThemedView style={styles.cardText}>
        <ThemedText type="defaultSemiBold">{passage.title}</ThemedText>
        {passage.composer && (
          <ThemedText style={{ opacity: Opacity.muted }}>{passage.composer}</ThemedText>
        )}
      </ThemedView>
      {!editMode && scuPct !== null && (
        <View style={[styles.scuBadge, { backgroundColor: tempoColor }]}>
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
            <Pressable hitSlop={6} onPress={onMove} style={styles.editActionBtn}>
              <ThemedText style={[styles.editActionText, { color: tintColor }]}>Move</ThemedText>
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

type DocumentCardProps = {
  document: DocumentRow;
  borderColor: string;
  tintColor: string;
  moreColor: string;
  editMode: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isPhone?: boolean;
  onOpen: () => void;
  onLongPress: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
};

function DocumentCard({
  document,
  borderColor,
  tintColor,
  moreColor,
  editMode,
  canMoveUp,
  canMoveDown,
  isPhone,
  onOpen,
  onLongPress,
  onMoveUp,
  onMoveDown,
  onRename,
  onMove,
  onDelete,
}: DocumentCardProps) {
  // Thumbnail = page 1 of the rendered pages_json. Fall back to a tinted block
  // until the first render lands.
  const pages = parsePages(document.pages_json);
  const thumbUri = pages.length > 0 ? pages[0].image_uri : null;
  const thumbStyle = isPhone ? styles.thumbPhone : styles.thumb;
  return (
    <Pressable
      onPress={editMode ? undefined : onOpen}
      onLongPress={editMode ? undefined : onLongPress}
      delayLongPress={400}
      style={[isPhone ? styles.cardPhone : styles.card, { borderColor }]}>
      {thumbUri ? (
        // Anchor the crop to the top so the title block + tempo / key markings
        // stay visible. The middle of an orchestral part is mostly notation
        // and looks like every other middle.
        <Image
          source={{ uri: thumbUri }}
          style={thumbStyle}
          contentFit="cover"
          contentPosition="top"
        />
      ) : (
        <View style={[thumbStyle, { backgroundColor: tintColor + '11' }]} />
      )}
      <ThemedView style={styles.cardText}>
        <ThemedText type="defaultSemiBold">{document.title}</ThemedText>
        {document.composer && (
          <ThemedText style={{ opacity: Opacity.muted }}>{document.composer}</ThemedText>
        )}
        <ThemedText style={{ opacity: Opacity.muted, fontSize: 12 }}>
          Full part · {document.page_count} page{document.page_count === 1 ? '' : 's'}
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
            <Pressable hitSlop={6} onPress={onMove} style={styles.editActionBtn}>
              <ThemedText style={[styles.editActionText, { color: tintColor }]}>Move</ThemedText>
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
  const { colors: strategyColors } = useStrategyColors();
  // Phone density: at narrow viewports we hide the intro copy, shrink the
  // header to icons, and use compact card art so more of the user's
  // actual library is above the fold. Either-axis check so landscape
  // phones also get the dense layout.
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  // Phone portrait gets a stacked header — title on its own row above
  // the action buttons — so a long folder/repertoire name isn't
  // ellipsized down to a few characters by the 5-button cluster on
  // the right. Phone landscape still single-rows because vertical
  // pixels are the scarce axis there.
  const isPhonePortrait = isPhone && vpH > vpW;

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [path, setPath] = useState<Folder[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [scuProgress, setScuProgress] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [progressionOpen, setProgressionOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MoveTarget>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget>(null);
  const [undoMove, setUndoMove] = useState<UndoMove | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      await rehomeOrphans();
      const [f, p, d, all, pathF] = await Promise.all([
        listFoldersInParent(currentFolderId),
        listPassagesInFolder(currentFolderId),
        listDocumentsInFolder(currentFolderId),
        listAllFolders(),
        getFolderPath(currentFolderId),
      ]);
      setFolders(f);
      setPassages(p);
      setDocuments(d);
      setAllFolders(all);
      setPath(pathF);
      if (p.length > 0) {
        const rows = await getTempoLadderProgressForPassages(p.map((x) => x.id));
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

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const filteredFolders = q
    ? folders.filter((f) => f.name.toLowerCase().includes(q))
    : folders;
  const filteredPassages = q
    ? passages.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.composer ?? '').toLowerCase().includes(q),
      )
    : passages;
  const filteredDocuments = q
    ? documents.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.composer ?? '').toLowerCase().includes(q),
      )
    : documents;
  const rows: ListRow[] = [
    ...filteredFolders.map((folder) => ({ kind: 'folder' as const, folder })),
    ...filteredDocuments.map((document) => ({ kind: 'document' as const, document })),
    ...filteredPassages.map((passage) => ({ kind: 'passage' as const, passage })),
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
    kind: 'folder' | 'passage' | 'document',
    id: string,
    direction: -1 | 1,
  ) {
    const list =
      kind === 'folder'
        ? folders.map((f) => f.id)
        : kind === 'passage'
          ? passages.map((p) => p.id)
          : documents.map((d) => d.id);
    const idx = list.indexOf(id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    try {
      const updateFn =
        kind === 'folder'
          ? updateFolderSortOrder
          : kind === 'passage'
            ? updatePassageSortOrder
            : updateDocumentSortOrder;
      await Promise.all(reordered.map((rid, i) => updateFn(rid, i)));
    } catch (e) {
      console.warn('[library] reorder failed', e);
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
    } else if (prompt.kind === 'rename_passage') {
      await renamePassage(prompt.id, trimmed);
    } else if (prompt.kind === 'rename_document') {
      await renameDocument(prompt.id, trimmed);
    }
    setPrompt(null);
    refresh();
  }

  async function onDeleteFolder(f: Folder) {
    if (
      !(await confirmDelete(
        f.name,
        'The folder will be removed. Anything inside will move up to the parent level — nothing is deleted with it.',
      ))
    )
      return;
    softDeleteFolder(f.id).then(refresh).catch(() => undefined);
  }

  async function onDeletePassage(p: Passage) {
    if (!(await confirmDelete(p.title, 'This removes the passage from your library.'))) return;
    softDeletePassage(p.id).then(refresh).catch(() => undefined);
  }

  async function onDeleteDocument(d: DocumentRow) {
    if (
      !(await confirmDelete(
        d.title,
        'This removes the full part and any passages you marked inside it. Practice history under those passages stays in your log.',
      ))
    )
      return;
    softDeleteDocument(d.id).then(refresh).catch(() => undefined);
  }

  function destinationLabel(targetFolderId: string | null): string {
    if (targetFolderId === null) return 'Library root';
    const f = allFolders.find((x) => x.id === targetFolderId);
    return f?.name ?? 'folder';
  }

  function scheduleUndoClear() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoMove(null), 5000);
  }

  async function performMoveWithUndo(
    dragged: { kind: 'folder' | 'passage' | 'document'; id: string },
    targetFolderId: string | null,
  ) {
    let fromParent: string | null = null;
    if (dragged.kind === 'folder') {
      if (dragged.id === targetFolderId) return;
      const f = await getFolder(dragged.id);
      if (!f) return;
      fromParent = f.parent_folder_id;
      if (fromParent === targetFolderId) return;
      await moveFolder(dragged.id, targetFolderId);
    } else if (dragged.kind === 'passage') {
      const p = await getPassage(dragged.id);
      if (!p) return;
      fromParent = p.folder_id;
      if (fromParent === targetFolderId) return;
      await movePassage(dragged.id, targetFolderId);
    } else {
      const d = await getDocument(dragged.id);
      if (!d) return;
      fromParent = d.folder_id;
      if (fromParent === targetFolderId) return;
      await moveDocument(dragged.id, targetFolderId);
    }
    setUndoMove({
      kind: dragged.kind,
      id: dragged.id,
      fromParent,
      label: `Moved to ${destinationLabel(targetFolderId)}`,
    });
    scheduleUndoClear();
    refresh();
  }

  async function onUndoMove() {
    if (!undoMove) return;
    const m = undoMove;
    setUndoMove(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (m.kind === 'folder') {
      await moveFolder(m.id, m.fromParent);
    } else if (m.kind === 'passage') {
      await movePassage(m.id, m.fromParent);
    } else {
      await moveDocument(m.id, m.fromParent);
    }
    refresh();
  }

  async function onPickMove(targetId: string | null) {
    if (!moveTarget) return;
    const target = moveTarget;
    setMoveTarget(null);
    await performMoveWithUndo(target, targetId);
  }

  const disabledIdsForMove =
    moveTarget?.kind === 'folder' ? new Set([moveTarget.id]) : undefined;

  function buildActionItems(): ActionSheetItem[] {
    if (!actionTarget) return [];
    const close = () => setActionTarget(null);

    if (actionTarget.kind === 'folder') {
      const f = actionTarget.folder;
      const idx = folders.findIndex((x) => x.id === f.id);
      const items: ActionSheetItem[] = [
        {
          label: 'Rename',
          onPress: () => {
            close();
            setPrompt({ kind: 'rename_folder', id: f.id, initial: f.name });
          },
        },
        {
          label: 'Move to…',
          onPress: () => {
            close();
            setMoveTarget({ kind: 'folder', id: f.id });
          },
        },
      ];
      if (idx > 0) {
        items.push({
          label: '↑ Move up',
          onPress: () => {
            close();
            moveItem('folder', f.id, -1);
          },
        });
      }
      if (idx >= 0 && idx < folders.length - 1) {
        items.push({
          label: '↓ Move down',
          onPress: () => {
            close();
            moveItem('folder', f.id, 1);
          },
        });
      }
      items.push({
        label: 'Delete',
        destructive: true,
        onPress: () => {
          close();
          onDeleteFolder(f);
        },
      });
      return items;
    }

    if (actionTarget.kind === 'passage') {
      const p = actionTarget.passage;
      const idx = passages.findIndex((x) => x.id === p.id);
      const items: ActionSheetItem[] = [
        {
          label: 'Rename',
          onPress: () => {
            close();
            setPrompt({ kind: 'rename_passage', id: p.id, initial: p.title });
          },
        },
        {
          label: 'Move to…',
          onPress: () => {
            close();
            setMoveTarget({ kind: 'passage', id: p.id });
          },
        },
        {
          label: 'Edit / Crop',
          onPress: () => {
            close();
            router.push(`/passage/${p.id}/crop`);
          },
        },
      ];
      if (idx > 0) {
        items.push({
          label: '↑ Move up',
          onPress: () => {
            close();
            moveItem('passage', p.id, -1);
          },
        });
      }
      if (idx >= 0 && idx < passages.length - 1) {
        items.push({
          label: '↓ Move down',
          onPress: () => {
            close();
            moveItem('passage', p.id, 1);
          },
        });
      }
      items.push({
        label: 'Delete',
        destructive: true,
        onPress: () => {
          close();
          onDeletePassage(p);
        },
      });
      return items;
    }

    // document
    const d = actionTarget.document;
    const idx = documents.findIndex((x) => x.id === d.id);
    const items: ActionSheetItem[] = [
      {
        label: 'Rename',
        onPress: () => {
          close();
          setPrompt({ kind: 'rename_document', id: d.id, initial: d.title });
        },
      },
      {
        label: 'Move to…',
        onPress: () => {
          close();
          setMoveTarget({ kind: 'document', id: d.id });
        },
      },
    ];
    if (idx > 0) {
      items.push({
        label: '↑ Move up',
        onPress: () => {
          close();
          moveItem('document', d.id, -1);
        },
      });
    }
    if (idx >= 0 && idx < documents.length - 1) {
      items.push({
        label: '↓ Move down',
        onPress: () => {
          close();
          moveItem('document', d.id, 1);
        },
      });
    }
    items.push({
      label: 'Delete',
      destructive: true,
      onPress: () => {
        close();
        onDeleteDocument(d);
      },
    });
    return items;
  }

  const isAtRoot = path.length === 0;
  const currentFolderName = isAtRoot ? 'Play Fast Notes' : path[path.length - 1].name;

  return (
    <ThemedView style={styles.container}>
      <ThemedView
        style={[
          styles.header,
          isPhonePortrait && styles.headerStacked,
        ]}>
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
        <View
          style={[
            { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
            // Stacked layout pushes the button cluster to the right
            // edge of its own row so the visual right-aligned weight
            // of the original single-row header is preserved.
            isPhonePortrait && { justifyContent: 'flex-end' },
          ]}>
          {editMode ? (
            <>
              {Platform.OS !== 'web' && (
                <Button
                  label="Import from Supabase"
                  variant="outline"
                  size="sm"
                  onPress={() => router.push('/import-supabase' as never)}
                />
              )}
              <Button label="Done" size="sm" onPress={() => setEditMode(false)} />
            </>
          ) : isPhone ? (
            // Phone: icon-only secondary actions on the left, primary
            // "+ Add" stays labeled on the right. Buttons sized like the
            // chevron / undo overlays used elsewhere in the app so the
            // header feels familiar.
            <>
              <Pressable
                onPress={() => Linking.openURL(bmacUrl())}
                accessibilityLabel="Support the developer"
                style={[styles.iconBtn, { borderColor: C.icon }]}>
                <ThemedText style={styles.iconBtnText}>☕</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (currentFolderId) {
                    router.push({
                      pathname: '/folder-log',
                      params: {
                        folderId: currentFolderId,
                        folderName: currentFolderName,
                      },
                    });
                  } else {
                    router.push('/library-log');
                  }
                }}
                accessibilityLabel="Practice log"
                style={[styles.iconBtn, { borderColor: C.icon }]}>
                <ThemedText style={styles.iconBtnText}>📋</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => router.push('/settings')}
                accessibilityLabel="Settings"
                style={[styles.iconBtn, { borderColor: C.icon }]}>
                <ThemedText style={styles.iconBtnText}>⚙</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setEditMode(true)}
                accessibilityLabel="Edit"
                style={[styles.iconBtn, { borderColor: C.icon }]}>
                <ThemedText style={styles.iconBtnText}>✎</ThemedText>
              </Pressable>
              <Button label="+ Add" size="sm" onPress={() => setAddOpen(true)} />
            </>
          ) : (
            <>
              <Button
                label="☕"
                variant="outline"
                size="sm"
                onPress={() => Linking.openURL(bmacUrl())}
              />
              <Button
                label="Practice Log"
                variant="outline"
                size="sm"
                onPress={() => {
                  if (currentFolderId) {
                    router.push({
                      pathname: '/folder-log',
                      params: {
                        folderId: currentFolderId,
                        folderName: currentFolderName,
                      },
                    });
                  } else {
                    router.push('/library-log');
                  }
                }}
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

      {/* One-line getting-started prompt at the library root. Replaces
          a previous three-line tagline + organizing-advice block that
          was making the page feel busy and burying the inline
          practice-progression guidance below the mode row. The line
          mirrors the two options inside the "+ Add" menu — uploading
          a PDF, or taking a photo of a passage — so a first-time
          user sees the obvious next action without scanning options. */}
      {isAtRoot && !editMode && (
        <ThemedText style={[styles.addHint, { color: C.icon }]}>
          Add full parts, or take a photo of a difficult passage.
        </ThemedText>
      )}

      {editMode && (
        <View style={[styles.editHintBanner, { borderColor: C.tint + '44', backgroundColor: C.tint + '11' }]}>
          <ThemedText style={[styles.editHintText, { color: C.text }]}>
            Tap <ThemedText style={styles.editHintBold}>↑ ↓</ThemedText> to reorder ·{' '}
            <ThemedText style={styles.editHintBold}>Move</ThemedText> to send to another folder ·{' '}
            <ThemedText style={styles.editHintBold}>Rename</ThemedText> /{' '}
            <ThemedText style={styles.editHintBold}>Delete</ThemedText> as needed
          </ThemedText>
          <ThemedText style={[styles.editHintSub, { color: C.icon }]}>
            Outside Edit: tap to open, or long-press for more options.
          </ThemedText>
        </View>
      )}

      {/* Practice-mode action row. Used to be a two-segment "Blocked /
          Serial" toggle, but friend-test feedback (2026-05-24) revealed
          the left segment — styled like an active filled button but
          actually disabled — was reading as "click me, why am I broken?",
          and the "Blocked" subtitle was being misread as a software state
          ("this button is blocked / disabled"). The default behavior of
          tapping a passage in the list IS the "practice one passage"
          mode; surfacing that as a fake button was creating ambiguity.
          Now: a small caption makes the implicit default explicit, and
          the only real action ("Practice a group of passages") stands
          alone as a real button. The "?" help modal still teaches the
          Blocked-vs-Serial vocabulary in context. */}
      <ThemedText style={[styles.modeCaption, { color: C.icon }]}>
        Tap a passage to practice it.
      </ThemedText>
      <View
        style={[
          styles.modeRow,
          isPhonePortrait && styles.modeRowStacked,
        ]}>
        <Pressable
          onPress={() => router.push('/interleaved')}
          style={[styles.groupBtn, { borderColor: C.tint }]}>
          <ThemedText style={[styles.groupBtnText, { color: C.tint }]}>
            Practice a group of passages  →
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setProgressionOpen(true)}
          hitSlop={6}
          style={[
            styles.modeHelpBtn,
            { borderColor: C.icon },
            isPhonePortrait && { alignSelf: 'center' },
          ]}>
          <ThemedText style={[styles.modeHelpText, { color: C.icon }]}>?</ThemedText>
        </Pressable>
      </View>
      {/* Inline gist of the practice-progression modal. Friend-test
          feedback (2026-05-24) was that the "?" help button is easy to
          glide past, so the key insight users would otherwise miss
          lives right here in plain sight. The "?" still opens the
          longer modal for anyone who wants the deeper explanation. */}
      <ThemedText style={[styles.modeFooter, { color: C.icon }]}>
        Solo practice helps most while you're still learning the notes.
        Rotating a group helps more as a performance gets closer.
      </ThemedText>

      <View style={[styles.searchWrap, { borderColor: C.icon + '66' }]}>
        <ThemedText style={[styles.searchIcon, { color: C.icon }]}>⌕</ThemedText>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search folders and passages"
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
                : 'Create a folder for each work in your repertoire, then add the passages you want to practice inside it.'}
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
            row.kind === 'folder'
              ? `f:${row.folder.id}`
              : row.kind === 'document'
                ? `d:${row.document.id}`
                : `p:${row.passage.id}`
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
                  isPhone={isPhone}
                  onEnter={() => enterFolder(item.folder.id)}
                  onLongPress={() => setActionTarget({ kind: 'folder', folder: item.folder })}
                  onMoveUp={() => moveItem('folder', item.folder.id, -1)}
                  onMoveDown={() => moveItem('folder', item.folder.id, 1)}
                  onRename={() =>
                    setPrompt({ kind: 'rename_folder', id: item.folder.id, initial: item.folder.name })
                  }
                  onMove={() => setMoveTarget({ kind: 'folder', id: item.folder.id })}
                  onDelete={() => onDeleteFolder(item.folder)}
                />
              );
            }
            if (item.kind === 'document') {
              const documentIdx = filteredDocuments.findIndex((d) => d.id === item.document.id);
              return (
                <DocumentCard
                  document={item.document}
                  borderColor={C.icon}
                  tintColor={C.tint}
                  moreColor={C.icon}
                  editMode={editMode}
                  canMoveUp={documentIdx > 0}
                  canMoveDown={documentIdx >= 0 && documentIdx < filteredDocuments.length - 1}
                  isPhone={isPhone}
                  onOpen={() => router.push(`/document/${item.document.id}` as never)}
                  onLongPress={() =>
                    setActionTarget({ kind: 'document', document: item.document })
                  }
                  onMoveUp={() => moveItem('document', item.document.id, -1)}
                  onMoveDown={() => moveItem('document', item.document.id, 1)}
                  onRename={() =>
                    setPrompt({
                      kind: 'rename_document',
                      id: item.document.id,
                      initial: item.document.title,
                    })
                  }
                  onMove={() => setMoveTarget({ kind: 'document', id: item.document.id })}
                  onDelete={() => onDeleteDocument(item.document)}
                />
              );
            }
            const passageIdx = filteredPassages.findIndex((p) => p.id === item.passage.id);
            return (
              <PassageCard
                passage={item.passage}
                borderColor={C.icon}
                tintColor={C.tint}
                tempoColor={strategyColors.tempo_ladder ?? C.tint}
                moreColor={C.icon}
                editMode={editMode}
                canMoveUp={passageIdx > 0}
                canMoveDown={passageIdx >= 0 && passageIdx < filteredPassages.length - 1}
                isPhone={isPhone}
                scuPct={scuProgress[item.passage.id] ?? null}
                onOpen={() => router.push(`/passage/${item.passage.id}`)}
                onLongPress={() => setActionTarget({ kind: 'passage', passage: item.passage })}
                onMoveUp={() => moveItem('passage', item.passage.id, -1)}
                onMoveDown={() => moveItem('passage', item.passage.id, 1)}
                onRename={() =>
                  setPrompt({ kind: 'rename_passage', id: item.passage.id, initial: item.passage.title })
                }
                onMove={() => setMoveTarget({ kind: 'passage', id: item.passage.id })}
                onDelete={() => onDeletePassage(item.passage)}
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
              : prompt?.kind === 'rename_document'
                ? 'Rename full part'
                : 'Rename passage'
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
        onPickPassage={() => {
          setAddOpen(false);
          router.push({
            pathname: '/upload',
            params: { folder: currentFolderId ?? '' },
          });
        }}
        onPickDocument={() => {
          setAddOpen(false);
          // Cast: expo-router typed routes are regenerated by the dev server;
          // until the next `playweb` start, /document-upload is not in the union.
          router.push({
            pathname: '/document-upload' as never,
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

      <MoveToPicker
        visible={moveTarget !== null}
        title={
          moveTarget?.kind === 'folder'
            ? 'Move folder to…'
            : moveTarget?.kind === 'document'
              ? 'Move full part to…'
              : 'Move passage to…'
        }
        folders={allFolders}
        disabledIds={disabledIdsForMove}
        onPick={onPickMove}
        onCancel={() => setMoveTarget(null)}
      />

      <ActionSheet
        visible={actionTarget !== null}
        title={
          actionTarget?.kind === 'folder'
            ? actionTarget.folder.name
            : actionTarget?.kind === 'passage'
              ? actionTarget.passage.title
              : actionTarget?.kind === 'document'
                ? actionTarget.document.title
                : undefined
        }
        items={buildActionItems()}
        onCancel={() => setActionTarget(null)}
      />

      {undoMove && (
        <View pointerEvents="box-none" style={styles.toastAnchor}>
          <View
            style={[
              styles.toast,
              {
                backgroundColor: scheme === 'dark' ? '#1f2123' : '#222',
                borderColor: C.tint,
              },
            ]}>
            <ThemedText style={styles.toastText}>{undoMove.label}</ThemedText>
            <Pressable onPress={onUndoMove} hitSlop={8} style={styles.toastBtn}>
              <ThemedText style={[styles.toastBtnText, { color: C.tint }]}>Undo</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

function AddChooserModal({
  visible,
  onClose,
  onPickPassage,
  onPickDocument,
  onPickFolder,
}: {
  visible: boolean;
  onClose: () => void;
  onPickPassage: () => void;
  onPickDocument: () => void;
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
          <Button label="Add image of passage" onPress={onPickPassage} fullWidth />
          <Button label="Add PDF" variant="outline" onPress={onPickDocument} fullWidth />
          <Button label="Add folder" variant="outline" onPress={onPickFolder} fullWidth />
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
  // Modal copy rewritten 2026-05-24 after friend-test feedback that the
  // music-pedagogy terms "Blocked" / "Serial" were confusing as primary
  // labels (one user thought "Blocked" meant the button was disabled).
  // We now lead with plain English — "Practice one passage at a time" /
  // "Practice a group of passages" — and introduce the pedagogy terms
  // parenthetically inside the body, where the user is already reading
  // an explanation.
  const steps = [
    {
      title: 'Practice one passage at a time',
      body:
        'What most people do all the time: one passage at a time, over and over. (In music pedagogy, this is called blocked practice.) Great for starting out. The key is making sure the passage stays PLAYABLE — slow the tempo enough or shrink the chunk enough that you can play it cleanly.',
    },
    {
      title: 'Practice a group of passages',
      body:
        'Drill several passages in a single session — a fixed number of clean repetitions on each, then move on. Inside, you pick an order: Serial (same rotation each time, predictable) or Interleaved (random rotation across selected passages — tests whether you can perform on the first try, like an audition).',
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
            Both approaches have their place. Working on one passage at a time
            tends to help most early on, while you're still learning the notes.
            Rotating through a group of passages becomes more useful as a
            performance gets closer — especially when the rotation order is
            random.
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
  // Phone portrait override — column stacking with cross-axis stretch
  // so both the title row and the button row span the full width of
  // the screen. Reduced cross-row gap because two rows already feel
  // taller than the original single row.
  headerStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  backBtn: { paddingHorizontal: Spacing.xs },
  backArrow: { fontSize: 32, fontWeight: '400', lineHeight: 34 },
  // One-line add-content prompt at the library root. Subtle weight so
  // it reads as guidance, not as a heading; lines up visually with
  // modeCaption / modeFooter below it.
  addHint: {
    fontSize: Type.size.xs,
    opacity: Opacity.subtle,
    marginTop: -8,
    marginBottom: 2,
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
  // Phone portrait override — stack so the button spans the full row
  // and the help "?" sits centered below.
  modeRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  // Caption above the modeRow that names the implicit default
  // (clicking a passage in the list = practice it solo). Subtle weight
  // so it reads as guidance, not as a heading.
  modeCaption: {
    fontSize: Type.size.xs,
    opacity: Opacity.subtle,
    marginBottom: 2,
  },
  // Footer line below the modeRow that inlines the gist of the
  // "Practice progression" help modal — so users who never tap "?"
  // still get the practical when-to-use-each guidance.
  modeFooter: {
    fontSize: Type.size.xs,
    opacity: Opacity.subtle,
    marginTop: 4,
    lineHeight: 17,
  },
  // The lone Serial Practice action button. Filled-by-border to match
  // the "?" help button's outline language. flex:1 so it stretches to
  // fill the row (the "?" is fixed-width on the right).
  groupBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.md,
    borderWidth: Borders.medium,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  groupBtnText: {
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
    textAlign: 'center',
  },
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
  // Phone density: shrink the leading thumbnail / folder icon so each
  // row uses roughly half the vertical space, letting ~4–5 entries fit
  // above the fold on an iPhone instead of ~2.
  thumbPhone: {
    width: 44,
    height: 44,
    borderRadius: Radii.sm,
    backgroundColor: '#0002',
  },
  folderIconPhone: {
    width: 44,
    height: 44,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhone: {
    flexDirection: 'row',
    gap: Spacing.sm,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  // Compact icon-only buttons in the phone header row.
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 18, lineHeight: 20 },
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
  toastAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: Borders.thin,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    maxWidth: 420,
  },
  toastText: { color: '#fff', fontWeight: Type.weight.semibold, fontSize: Type.size.md },
  toastBtn: { paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  toastBtnText: { fontWeight: Type.weight.heavy, fontSize: Type.size.md },
});
