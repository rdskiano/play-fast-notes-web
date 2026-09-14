// The free plan's "swap this one in" sheet. Shown when a free user taps a
// locked photo passage in the library: instead of a flat paywall, they can
// trade one of their three free slots for the passage they actually want to
// practice (lock-don't-lose stays true — the benched one locks, nothing is
// deleted). Same modal shell as PaywallModal/ConfirmModal so it fits visually.
// Shared web + native.

import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import {
  KEEP_SWAP_FOOTNOTE,
  KEEP_SWAP_TITLE,
  KEEP_SWAP_UPGRADE_LABEL,
  keepSwapIntro,
} from '@/constants/billing';
import { Colors } from '@/constants/theme';
import { Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Passage } from '@/lib/db/repos/passages';

type Props = {
  /** The locked passage the user tapped. Null = sheet hidden. */
  passage: Passage | null;
  /** The passages currently occupying the free slots (the bench candidates). */
  freePassages: Passage[];
  /** A swap is being written — disable inputs, keep the sheet up. */
  busy: boolean;
  /** User picked which free passage to bench in favor of `passage`. */
  onPickBench: (benchId: string) => void;
  /** User chose the upgrade path instead. */
  onUpgrade: () => void;
  onClose: () => void;
};

export function KeepSwapModal({
  passage,
  freePassages,
  busy,
  onPickBench,
  onUpgrade,
  onClose,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      visible={passage !== null}
      transparent
      animationType="fade"
      onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable
          style={[styles.card, { backgroundColor: C.background }]}
          onPress={(e) => e.stopPropagation()}>
          {/* Scroll inside the card so phone-landscape (short viewport)
              can reach the title and the bottom buttons. */}
          <ScrollView
            contentContainerStyle={styles.cardContent}
            showsVerticalScrollIndicator={false}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            {KEEP_SWAP_TITLE}
          </ThemedText>
          {passage && (
            <ThemedText style={[styles.intro, { color: C.icon }]}>
              {keepSwapIntro(passage.title)}
            </ThemedText>
          )}

          <View style={styles.benchList}>
            {freePassages.map((p) => (
              <Pressable
                key={p.id}
                disabled={busy}
                onPress={() => onPickBench(p.id)}
                style={({ pressed }) => [
                  styles.benchRow,
                  { borderColor: C.icon + '55' },
                  pressed && { backgroundColor: C.tint + '18' },
                  busy && { opacity: 0.5 },
                ]}>
                <ThemedText type="defaultSemiBold" numberOfLines={1}>
                  {p.title}
                </ThemedText>
                {p.composer ? (
                  <ThemedText style={[styles.benchComposer, { color: C.icon }]} numberOfLines={1}>
                    {p.composer}
                  </ThemedText>
                ) : null}
              </Pressable>
            ))}
          </View>

          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator />
              <ThemedText style={[styles.footnote, { color: C.icon }]}>Swapping…</ThemedText>
            </View>
          ) : (
            <ThemedText style={[styles.footnote, { color: C.icon }]}>
              {KEEP_SWAP_FOOTNOTE}
            </ThemedText>
          )}

          <Button label={KEEP_SWAP_UPGRADE_LABEL} onPress={onUpgrade} disabled={busy} />
          <Button label="Not now" variant="outline" size="sm" onPress={close} disabled={busy} />
          </ScrollView>
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
    maxWidth: 440,
    maxHeight: '100%',
    borderRadius: Radii.lg,
    padding: Spacing.lg,
  },
  cardContent: {
    gap: Spacing.md,
  },
  intro: {
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
  benchList: {
    gap: Spacing.xs,
  },
  benchRow: {
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  benchComposer: {
    fontSize: Type.size.sm,
  },
  busyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  footnote: {
    textAlign: 'center',
    fontSize: Type.size.xs,
  },
});
