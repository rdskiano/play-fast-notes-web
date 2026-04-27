import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getFolderPath,
  listFoldersInParent,
  type Folder,
} from '@/lib/db/repos/folders';
import {
  listPiecesInFolder,
  type Piece,
} from '@/lib/db/repos/pieces';
import { signOut } from '@/lib/supabase/auth';

type ListRow =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'piece'; piece: Piece };

export default function LibraryScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [path, setPath] = useState<Folder[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [f, p, pathF] = await Promise.all([
        listFoldersInParent(currentFolderId),
        listPiecesInFolder(currentFolderId),
        getFolderPath(currentFolderId),
      ]);
      setFolders(f);
      setPieces(p);
      setPath(pathF);
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
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Button
            label="Sign out"
            variant="outline"
            size="sm"
            onPress={() => {
              signOut().catch(() => {
                // ignore — auth state change will redirect on success or surface elsewhere
              });
            }}
          />
          <Button
            label="+ Add"
            size="sm"
            onPress={() =>
              router.push({
                pathname: '/upload',
                params: { folder: currentFolderId ?? '' },
              })
            }
          />
        </View>
      </ThemedView>

      {isAtRoot && (
        <View style={styles.hintBlock}>
          <ThemedText style={styles.tagline}>
            Crop difficult passages from your music and practice them with guided strategies.
          </ThemedText>
          <ThemedText style={styles.hint}>
            Organize by repertoire title, concert, lesson, audition list — whatever helps you practice.
          </ThemedText>
        </View>
      )}

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
          keyExtractor={(row) =>
            row.kind === 'folder' ? `f:${row.folder.id}` : `p:${row.piece.id}`
          }
          contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing.xl }}
          renderItem={({ item }) => {
            if (item.kind === 'folder') {
              return (
                <Pressable
                  onPress={() => setCurrentFolderId(item.folder.id)}
                  style={[styles.card, { borderColor: C.icon }]}>
                  <View
                    style={[
                      styles.folderIcon,
                      { backgroundColor: C.tint + '22' },
                    ]}>
                    <ThemedText style={{ fontSize: 32 }}>📁</ThemedText>
                  </View>
                  <ThemedView style={styles.cardText}>
                    <ThemedText type="defaultSemiBold">{item.folder.name}</ThemedText>
                    <ThemedText style={{ opacity: Opacity.muted, fontSize: Type.size.xs }}>
                      Folder
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              );
            }
            return (
              <Pressable
                onPress={() => router.push(`/piece/${item.piece.id}`)}
                style={[styles.card, { borderColor: C.icon }]}>
                {item.piece.thumbnail_uri && (
                  <Image
                    source={{ uri: item.piece.thumbnail_uri }}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                )}
                <ThemedView style={styles.cardText}>
                  <ThemedText type="defaultSemiBold">{item.piece.title}</ThemedText>
                  {item.piece.composer && (
                    <ThemedText style={{ opacity: Opacity.muted }}>
                      {item.piece.composer}
                    </ThemedText>
                  )}
                </ThemedView>
              </Pressable>
            );
          }}
        />
      )}
    </ThemedView>
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
});
