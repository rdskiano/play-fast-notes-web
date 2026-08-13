// Library-header bell with a quiet "unread" dot. Tapping it opens the
// "What's new" sheet — short plain-English notes about recent updates and
// fixes (constants/whatsNew.ts). Opening the sheet marks everything read via
// the settings repo, so on web the read-state follows the account across
// devices; on iPad it lives in the local database.
//
// Deliberately quiet by design (Ralph's call, 2026-07-22): a dot, never a
// popup — nothing may interrupt practice. Shared across platforms; only RN
// primitives here.

import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Borders, Radii, Spacing } from '@/constants/tokens';
import { Palette } from '@/constants/palette';
import {
  LATEST_WHATS_NEW_ID,
  WHATS_NEW,
  WHATS_NEW_SEEN_KEY,
} from '@/constants/whatsNew';
import { getSetting, setSetting } from '@/lib/db/repos/settings';
import Feather from '@expo/vector-icons/Feather';

const FEEDBACK_MAILTO =
  'mailto:rdskiano@gmail.com?subject=Play%20Fast%20Notes%20feedback';

export function WhatsNewButton() {
  const [unseen, setUnseen] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!LATEST_WHATS_NEW_ID) return;
    let cancelled = false;
    getSetting(WHATS_NEW_SEEN_KEY)
      .then((seen) => {
        if (!cancelled && seen !== LATEST_WHATS_NEW_ID) setUnseen(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function openSheet() {
    setOpen(true);
    setUnseen(false);
    // Best-effort — a failed write just means the dot shows again next visit.
    void setSetting(WHATS_NEW_SEEN_KEY, LATEST_WHATS_NEW_ID).catch(() => undefined);
  }

  return (
    <>
      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel="What's new"
        style={styles.bellBtn}>
        <Feather name="bell" size={18} color={Palette.text} />
        {unseen && <View style={styles.dot} />}
      </Pressable>

      <Modal
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <ThemedText type="subtitle" style={styles.heading}>
              What’s new
            </ThemedText>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {WHATS_NEW.map((entry) => (
                <View key={entry.id} style={styles.entry}>
                  <ThemedText style={styles.entryDate}>{entry.date}</ThemedText>
                  <ThemedText style={styles.entryTitle}>{entry.title}</ThemedText>
                  <ThemedText style={styles.entryBody}>{entry.body}</ThemedText>
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => Linking.openURL(FEEDBACK_MAILTO).catch(() => undefined)}
              accessibilityRole="button"
              style={styles.feedbackRow}>
              <ThemedText style={styles.feedbackText}>
                Something not working? Tell me →
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              style={styles.closeBtn}>
              <ThemedText style={styles.closeText}>Close</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Matches the library header's accountBtn chip so the bell reads as a peer.
  bellBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.md,
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.accent,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  heading: { textAlign: 'center' },
  // flexShrink is what makes the list scrollable: without it the ScrollView
  // grows to its full content height, blows past the card's maxHeight, and
  // just gets clipped — it thinks it's fully visible, so it never scrolls.
  // Invisible until the feed outgrew the card (5 entries, 2026-08-13).
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { gap: Spacing.lg, paddingVertical: Spacing.sm },
  entry: { gap: 2 },
  entryDate: { fontSize: 12, color: Palette.textMuted },
  entryTitle: { fontWeight: '700', color: Palette.text },
  entryBody: { fontSize: 14, lineHeight: 20, color: Palette.textSecondary },
  feedbackRow: { paddingVertical: Spacing.xs },
  feedbackText: { color: Palette.accent, fontWeight: '600', textAlign: 'center' },
  closeBtn: {
    alignSelf: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    backgroundColor: Palette.surfaceSunk,
  },
  closeText: { fontWeight: '600', color: Palette.text },
});
