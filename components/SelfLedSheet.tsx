// Bottom sheet that opens from the passage screen's "Self-Led" pill.
// Lists every entry from SELF_LED_STRATEGIES. Tap a card body to start that
// session; tap the ⓘ chevron to expand the same card inline with the long
// description and steps. One card may be expanded at a time.

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  SELF_LED_STRATEGIES,
  type SelfLedKey,
  type SelfLedStrategy,
} from '@/lib/strategies/selfLed';

const ICONS: Record<SelfLedKey, string> = {
  chunking: '🧩',
  add_a_note: '➕',
  pitch: '🎯',
  phrasing: '🎵',
  recording: '🎙',
  freeform: '✏️',
};

type Props = {
  visible: boolean;
  onPick: (key: SelfLedKey) => void;
  onCancel: () => void;
};

export function SelfLedSheet({ visible, onPick, onCancel }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [expanded, setExpanded] = useState<SelfLedKey | null>(null);

  function close() {
    setExpanded(null);
    onCancel();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable
          style={[styles.card, { backgroundColor: C.background }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <ThemedText style={[styles.title, { color: C.text }]}>
              Self-Led practice
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: C.icon }]}>
              Pick a way to work this passage
            </ThemedText>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {SELF_LED_STRATEGIES.map((s) => (
              <SelfLedCard
                key={s.key}
                strategy={s}
                expanded={expanded === s.key}
                onToggleInfo={() =>
                  setExpanded((prev) => (prev === s.key ? null : s.key))
                }
                onPick={() => {
                  setExpanded(null);
                  onPick(s.key);
                }}
              />
            ))}
          </ScrollView>
          <Pressable
            onPress={close}
            style={({ pressed }) => [
              styles.cancel,
              {
                borderTopColor: C.icon + '33',
                backgroundColor: pressed ? C.icon + '11' : 'transparent',
              },
            ]}>
            <ThemedText style={[styles.cancelText, { color: C.tint }]}>
              Cancel
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type CardProps = {
  strategy: SelfLedStrategy;
  expanded: boolean;
  onToggleInfo: () => void;
  onPick: () => void;
};

function SelfLedCard({ strategy, expanded, onToggleInfo, onPick }: CardProps) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <View style={[styles.cardItem, { borderBottomColor: C.icon + '22' }]}>
      <View style={styles.cardRow}>
        <Pressable
          onPress={onPick}
          style={({ pressed }) => [
            styles.cardBody,
            { backgroundColor: pressed ? C.icon + '11' : 'transparent' },
          ]}>
          <ThemedText style={styles.cardIcon}>{ICONS[strategy.key]}</ThemedText>
          <View style={styles.cardText}>
            <ThemedText style={[styles.cardTitle, { color: C.text }]}>
              {strategy.title}
            </ThemedText>
            <ThemedText style={[styles.cardTagline, { color: C.icon }]}>
              {strategy.shortDescription}
            </ThemedText>
          </View>
        </Pressable>
        <Pressable
          onPress={onToggleInfo}
          hitSlop={8}
          style={({ pressed }) => [
            styles.infoBtn,
            { backgroundColor: pressed ? C.icon + '22' : C.icon + '11' },
          ]}
          accessibilityLabel={
            expanded ? 'Hide description' : 'Show description'
          }>
          <ThemedText style={[styles.infoBtnText, { color: C.tint }]}>
            {expanded ? '−' : 'ⓘ'}
          </ThemedText>
        </Pressable>
      </View>
      {expanded && (
        <View style={[styles.expandPanel, { backgroundColor: C.icon + '08' }]}>
          <ThemedText style={[styles.longDesc, { color: C.text }]}>
            {strategy.longDescription}
          </ThemedText>
          {strategy.steps.length > 0 && (
            <View style={styles.stepsList}>
              {strategy.steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <ThemedText style={[styles.stepBullet, { color: C.tint }]}>
                    {i + 1}.
                  </ThemedText>
                  <ThemedText style={[styles.stepText, { color: C.text }]}>
                    {step}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
          {strategy.attribution && (
            <ThemedText style={[styles.attribution, { color: C.icon }]}>
              {strategy.attribution}
            </ThemedText>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Overlays.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    borderRadius: Radii['2xl'],
    overflow: 'hidden',
    borderWidth: Borders.thin,
    borderColor: '#0001',
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 2,
  },
  title: {
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
  },
  subtitle: {
    fontSize: Type.size.sm,
  },
  list: {
    paddingBottom: Spacing.md,
  },
  cardItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  cardIcon: {
    fontSize: 22,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
  },
  cardTagline: {
    fontSize: Type.size.sm,
  },
  infoBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: {
    fontSize: 18,
    fontWeight: Type.weight.heavy,
  },
  expandPanel: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  longDesc: {
    fontSize: Type.size.sm,
    lineHeight: 20,
  },
  stepsList: {
    gap: 6,
  },
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  stepBullet: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
    minWidth: 18,
  },
  stepText: {
    flex: 1,
    fontSize: Type.size.sm,
    lineHeight: 19,
  },
  attribution: {
    fontSize: Type.size.xs,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  cancel: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: Type.weight.bold,
  },
});
