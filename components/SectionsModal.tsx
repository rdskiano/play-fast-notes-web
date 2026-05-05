// Sections / Movements panel for a document. Single entry point for both
// navigation (tap a section to jump to its start page) and management
// (rename, delete, add new). Adding a new section closes this modal and
// hands off to the tap-to-mark flow in the document viewer, which captures
// a precise (page, y) marker.

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { DocumentSection } from '@/lib/db/repos/documents';

type Props = {
  visible: boolean;
  documentTitle: string;
  sections: DocumentSection[];
  // When set, opens with the matching section already in rename mode.
  // Format: `${start_page}:${start_y}`. Cleared by the parent after the
  // modal opens (we read it once on becoming visible).
  pendingRenameKey?: string | null;
  onSectionsChange: (next: DocumentSection[]) => void;
  onJumpToSection: (section: DocumentSection) => void;
  onAddSection: () => void;
  onClose: () => void;
};

export function SectionsModal({
  visible,
  documentTitle,
  sections,
  pendingRenameKey,
  onSectionsChange,
  onJumpToSection,
  onAddSection,
  onClose,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // When the modal opens with a pendingRenameKey (i.e. user just marked a
  // section and is being prompted to name it), pre-arm rename mode for that
  // row so the input is focused without an extra tap.
  useEffect(() => {
    if (!visible) {
      setRenamingIndex(null);
      setRenameValue('');
      return;
    }
    if (!pendingRenameKey) return;
    const idx = sections.findIndex(
      (s) => `${s.start_page}:${s.start_y}` === pendingRenameKey,
    );
    if (idx >= 0) {
      setRenamingIndex(idx);
      setRenameValue(sections[idx].name);
    }
    // Intentionally only re-runs on `visible` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function deleteSection(idx: number) {
    onSectionsChange(sections.filter((_, i) => i !== idx));
  }

  function startRename(idx: number) {
    setRenamingIndex(idx);
    setRenameValue(sections[idx].name);
  }

  function commitRename() {
    if (renamingIndex === null) return;
    const name = renameValue.trim();
    if (!name) {
      setRenamingIndex(null);
      return;
    }
    const next = sections.map((s, i) => (i === renamingIndex ? { ...s, name } : s));
    onSectionsChange(next);
    setRenamingIndex(null);
    setRenameValue('');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: C.background }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            Sections / Movements
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: C.icon }]} numberOfLines={1}>
            {documentTitle}
          </ThemedText>

          {sections.length === 0 ? (
            <ThemedText style={[styles.empty, { color: C.icon }]}>
              No sections yet. Tap "+ Add section" then tap a page where the
              section starts. Sections show up in the practice log next to each
              passage.
            </ThemedText>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ gap: Spacing.xs }}>
              {sections.map((s, i) => {
                const isRenaming = renamingIndex === i;
                return (
                  <View
                    key={`${s.start_page}:${s.start_y}:${s.name}`}
                    style={[styles.row, { borderColor: C.icon + '33' }]}>
                    {isRenaming ? (
                      <TextInput
                        value={renameValue}
                        onChangeText={setRenameValue}
                        onSubmitEditing={commitRename}
                        autoFocus
                        style={[
                          styles.input,
                          styles.rowInput,
                          { borderColor: C.icon, color: C.text },
                        ]}
                      />
                    ) : (
                      <Pressable
                        style={{ flex: 1 }}
                        onPress={() => onJumpToSection(s)}
                        accessibilityLabel={`Jump to ${s.name}`}>
                        <ThemedText style={[styles.rowName, { color: C.tint }]}>
                          {s.name} ›
                        </ThemedText>
                        <ThemedText style={[styles.rowMeta, { color: C.icon }]}>
                          starts on p. {s.start_page}
                        </ThemedText>
                      </Pressable>
                    )}
                    <View style={styles.rowActions}>
                      {isRenaming ? (
                        <>
                          <Button label="Save" size="xs" onPress={commitRename} />
                          <Button
                            label="Cancel"
                            variant="ghost"
                            size="xs"
                            onPress={() => setRenamingIndex(null)}
                          />
                        </>
                      ) : (
                        <>
                          <Button
                            label="Rename"
                            variant="ghost"
                            size="xs"
                            onPress={() => startRename(i)}
                          />
                          <Button
                            label="Delete"
                            variant="danger"
                            size="xs"
                            onPress={() => deleteSection(i)}
                          />
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <Button label="+ Add section" variant="primary" onPress={onAddSection} fullWidth />
          <Button label="Done" variant="ghost" onPress={onClose} fullWidth />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Overlays.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    maxHeight: '85%',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    marginTop: -Spacing.xs,
  },
  empty: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    paddingVertical: Spacing.md,
  },
  list: {
    maxHeight: 280,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
  },
  rowName: { fontSize: Type.size.md, fontWeight: Type.weight.semibold },
  rowMeta: { fontSize: Type.size.xs, marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  rowInput: { flex: 1 },
  input: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    fontSize: Type.size.md,
  },
});
