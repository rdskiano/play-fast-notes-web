// Reminder banner on the passage detail screen.
//
// Pulls every flagged log entry (data.remindNext === true) for the passage,
// filters to ones whose practiced_at predates this mount (so a note flagged
// during this visit does not pop up immediately — it only appears when the
// user closes the passage and re-opens it), and renders them as a
// collapsible list. Each entry has a "Dismiss" button that clears the flag
// on that log row and removes it from the list.

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  clearReminder,
  listPassageReminders,
  type PassageReminder,
} from '@/lib/db/repos/practiceLog';
import { actionsForReminder } from '@/lib/practice/noteChips';

const STRATEGY_LABELS: Record<string, string> = {
  tempo_ladder: 'Tempo Ladder',
  click_up: 'Interleaved Click-Up',
  rhythmic: 'Rhythmic Variation',
  chunking: 'Chunking',
  micro_chaining: 'Micro-Chaining',
  macro_chaining: 'Macro-Chaining',
  add_a_note: 'Add a Note',
  pitch: 'Pitch',
  phrasing: 'Phrasing',
  recording: 'Recording',
  freeform: 'Freeform',
  interleaved: 'Rep Rotator',
  rep_rotator: 'Rep Rotator',
};

type Props = {
  passageId: string;
  // Gate for Pro-only action buttons (Exercise Builder). When the viewer
  // isn't Pro, tapping such a button calls onProBlocked (the passage screen
  // shows its paywall) instead of navigating.
  isPro?: boolean;
  onProBlocked?: () => void;
};

export function PassageReminders({ passageId, isPro, onProBlocked }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const router = useRouter();
  // Capture the screen's open time once. Notes whose practiced_at is at or
  // after this time were flagged in the current visit and should not appear
  // here — they will surface on the next re-open.
  const openedAtRef = useRef<number>(Date.now());
  const [reminders, setReminders] = useState<PassageReminder[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPassageReminders(passageId)
      .then((list) => {
        if (cancelled) return;
        const cutoff = openedAtRef.current;
        setReminders(list.filter((r) => r.practiced_at < cutoff));
      })
      .catch(() => {
        // ignore — banner stays hidden on error
      });
    return () => {
      cancelled = true;
    };
  }, [passageId]);

  async function dismiss(id: number) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    try {
      await clearReminder(id);
    } catch {
      // ignore — local state already updated; flag will retry on next visit
    }
  }

  if (reminders.length === 0) return null;

  return (
    <View style={[styles.card, { borderColor: C.tint + '55', backgroundColor: C.tint + '0d' }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.header}
        accessibilityRole="button">
        <ThemedText style={[styles.headerText, { color: C.text }]}>
          📌 Notes for next time ({reminders.length})
        </ThemedText>
        <ThemedText style={[styles.chevron, { color: C.icon }]}>
          {open ? '▾' : '▸'}
        </ThemedText>
      </Pressable>
      {open && (
        <View style={styles.list}>
          {reminders.map((r) => {
            const label = STRATEGY_LABELS[r.strategy] ?? r.strategy;
            const exerciseSuffix = r.exercise_name ? ` · ${r.exercise_name}` : '';
            // Chip-created notes are known strings, so the app can put the
            // matching tools right under the reminder. Free-text notes get no
            // buttons and stay display-only.
            const actions = actionsForReminder(r.strategy, r.note, r.data, r.exercise_id);
            return (
              <View
                key={r.id}
                style={[styles.item, { borderColor: C.icon + '33' }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText style={[styles.itemStrategy, { color: C.icon }]}>
                    {label}
                    {exerciseSuffix}
                  </ThemedText>
                  <ThemedText style={[styles.itemNote, { color: C.text }]}>
                    {r.note}
                  </ThemedText>
                  {actions.length > 0 && (
                    <View style={styles.actionRow}>
                      {actions.map((a) => (
                        <Pressable
                          key={`${a.label}|${a.path}`}
                          onPress={() => {
                            if (a.pro && !isPro && onProBlocked) {
                              onProBlocked();
                              return;
                            }
                            router.push(`/passage/${passageId}/${a.path}` as never);
                          }}
                          accessibilityRole="button"
                          style={[styles.actionBtn, { borderColor: C.tint }]}>
                          <ThemedText
                            style={[styles.actionText, { color: C.tint }]}>
                            {a.label}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
                <Pressable
                  onPress={() => dismiss(r.id)}
                  style={[styles.dismissBtn, { borderColor: C.tint }]}>
                  <ThemedText style={[styles.dismissText, { color: C.tint }]}>
                    Dismiss
                  </ThemedText>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerText: { flex: 1, fontSize: Type.size.md, fontWeight: Type.weight.bold },
  chevron: { fontSize: Type.size.lg, fontWeight: Type.weight.bold },
  list: { gap: Spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: Borders.thin,
    borderRadius: Radii.sm,
  },
  itemStrategy: { fontSize: Type.size.xs, fontWeight: Type.weight.semibold },
  itemNote: { fontSize: Type.size.md, lineHeight: 20 },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 2,
  },
  actionBtn: {
    borderWidth: Borders.thin,
    borderRadius: Radii.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  actionText: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  dismissBtn: {
    borderWidth: Borders.thin,
    borderRadius: Radii.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  dismissText: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
});
