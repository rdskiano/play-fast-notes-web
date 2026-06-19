import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPassage, updatePassageDueDate, type Passage } from '@/lib/db/repos/passages';
import {
  getPracticeLogForPassage,
  listPassageReminders,
} from '@/lib/db/repos/practiceLog';
import { setSetting } from '@/lib/db/repos/settings';
import {
  CHALLENGES,
  FOLLOW_REROUTE,
  FOLLOWUPS,
  recommend,
  summarizeHistory,
  TOOL_NAME,
  TOOL_ROUTE,
  type ChallengeKey,
  type HistorySummary,
  type ToolKey,
} from '@/lib/coach/engine';

type Step = 'feedback' | 'due' | 'challenge' | 'follow' | 'rec';

// The coach's last suggestion for a piece, stored in settings so the NEXT visit
// can ask "did it help?". helpful: undefined = unrated; true/false = thumbs;
// null = skipped. Read by analytics off `coach:lastRec:*` settings rows.
type PendingRec = {
  tool: ToolKey;
  challenge: string;
  at: number;
  helpful?: boolean | null;
  ratedAt?: number;
};
const recKey = (pieceId: string) => 'coach:lastRec:' + pieceId;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const DUE_OPTIONS: { label: string; weeks: number | null }[] = [
  { label: 'No deadline', weeks: null },
  { label: 'This week', weeks: 1 },
  { label: 'In a couple of weeks', weeks: 2 },
  { label: 'In a month', weeks: 4 },
  { label: 'Further off', weeks: 9 },
];

export default function CoachScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [reminder, setReminder] = useState<string | null>(null);
  const [dueWeeks, setDueWeeks] = useState<number | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<PendingRec | null>(null);
  // The suggestion we just launched — set on "Start", read when the finished
  // session navigates back here so we can ask "did that help?".
  const launchedRecRef = useRef<PendingRec | null>(null);

  const [step, setStep] = useState<Step>('challenge');
  const [challenge, setChallenge] = useState<ChallengeKey | null>(null);
  const [follow, setFollow] = useState<string | undefined>(undefined);
  const [special, setSpecial] = useState<'maint' | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [p, entries, reminders] = await Promise.all([
          getPassage(id),
          getPracticeLogForPassage(id).catch(() => []),
          listPassageReminders(id).catch(() => []),
        ]);
        if (cancelled) return;
        setPassage(p);
        setSummary(summarizeHistory(entries));
        setReminder(reminders[0]?.note ?? null);
        // due_date: null/undefined = never asked; 0 = "no deadline";
        // >0 = a real date we turn into weeks-remaining for the urgency read.
        const due = p?.due_date;
        if (due != null && due > 0) {
          setDueWeeks(Math.max(0, Math.ceil((due - Date.now()) / WEEK_MS)));
        }
        setStep(due == null ? 'due' : 'challenge');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // When a coach-launched session finishes, the tool does a normal "back" and
  // lands us here again — that's the moment to ask whether the suggestion
  // helped. (No-op on the first focus, when nothing has been launched yet.)
  useFocusEffect(
    useCallback(() => {
      const rec = launchedRecRef.current;
      if (rec) {
        launchedRecRef.current = null;
        setPendingFeedback(rec);
        setStep('feedback');
      }
    }, []),
  );

  const reset = useCallback(() => {
    setStep('challenge');
    setChallenge(null);
    setFollow(undefined);
    setSpecial(undefined);
  }, []);

  const pickChallenge = useCallback((c: ChallengeKey) => {
    setSpecial(undefined);
    setFollow(undefined);
    setChallenge(c);
    // Coordination and "just getting started" have no follow-up — they go
    // straight to a recommendation.
    setStep(c === 'e' || c === 'g' ? 'rec' : 'follow');
  }, []);

  const pickFollow = useCallback(
    (c: ChallengeKey, value: string) => {
      if (c === 'f') {
        const next = FOLLOW_REROUTE[value];
        if (next === 'maint') {
          setSpecial('maint');
          setStep('rec');
          return;
        }
        // Re-route into the matching branch and ask ITS follow-up.
        setChallenge(next);
        setFollow(undefined);
        setStep('follow');
        return;
      }
      setFollow(value);
      setStep('rec');
    },
    [],
  );

  const pickDue = useCallback(
    (weeks: number | null) => {
      if (!passage) return;
      setDueWeeks(weeks);
      const value = weeks == null ? 0 : Date.now() + weeks * WEEK_MS;
      // Tolerate the column not existing yet (migration not run) — the coach
      // still works, it just won't persist the date.
      updatePassageDueDate(passage.id, value).catch(() => {});
      setStep('challenge');
    },
    [passage],
  );

  const rec = useMemo(() => {
    if (step !== 'rec' || !summary) return null;
    if (!challenge && special !== 'maint') return null;
    return recommend({
      challenge: challenge ?? 'a',
      follow,
      history: summary,
      dueWeeks,
      special,
    });
  }, [step, summary, challenge, follow, special, dueWeeks]);

  const launch = useCallback(
    (tool: ToolKey) => {
      if (!passage) return;
      // Stash this suggestion so we can ask "did that help?" the instant the
      // finished session navigates back here, and persist it (unrated) for
      // analytics.
      const rec: PendingRec = {
        tool,
        challenge: special === 'maint' ? 'maint' : challenge ?? 'unknown',
        at: Date.now(),
      };
      launchedRecRef.current = rec;
      setSetting(recKey(passage.id), JSON.stringify(rec)).catch(() => {});
      if (tool === 'rep') {
        router.push({ pathname: '/interleaved', params: { seedPassageId: passage.id } });
        return;
      }
      if (tool === 'rv') {
        // Rhythm Variations needs a note-grouping; default to 4 (the user can
        // change it in-tool). Bypasses the mode/grouping chooser sheet.
        router.push({
          pathname: '/passage/[id]/rhythmic',
          params: { id: passage.id, grouping: '4' },
        });
        return;
      }
      router.push(`/passage/${passage.id}/${TOOL_ROUTE[tool]}`);
    },
    [passage, router, challenge, special],
  );

  const rateFeedback = useCallback(
    (helpful: boolean | null) => {
      if (passage && pendingFeedback) {
        setSetting(
          recKey(passage.id),
          JSON.stringify({ ...pendingFeedback, helpful, ratedAt: Date.now() }),
        ).catch(() => {});
      }
      setPendingFeedback(null);
      // Session's done and rated — head back to the passage.
      router.back();
    },
    [passage, pendingFeedback, router],
  );

  function Option({ label, onPress }: { label: string; onPress: () => void }) {
    return (
      <Pressable onPress={onPress} style={[styles.option, { borderColor: C.icon }]} hitSlop={4}>
        <ThemedText style={styles.optionText}>{label}</ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { borderBottomColor: C.icon + '44', paddingTop: insets.top + 14 }]}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.backBtn}>
          <ThemedText style={[styles.backArrow, { color: C.tint }]}>‹</ThemedText>
        </Pressable>
        <ThemedText style={styles.topTitle} numberOfLines={1}>
          Practice coach · beta
        </ThemedText>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <ThemedText style={{ opacity: Opacity.muted }}>Loading…</ThemedText>
        ) : !passage ? (
          <ThemedText>Passage not found.</ThemedText>
        ) : step === 'feedback' && pendingFeedback ? (
          <View style={styles.section}>
            <ThemedText style={styles.lead}>
              How did that go? You just worked on this with{' '}
              <ThemedText style={styles.leadStrong}>
                {TOOL_NAME[pendingFeedback.tool]}
              </ThemedText>
              . Did it help?
            </ThemedText>
            <View style={styles.thumbRow}>
              <Pressable
                onPress={() => rateFeedback(true)}
                style={[styles.thumb, { borderColor: C.icon }]}>
                <ThemedText style={styles.thumbGlyph}>👍</ThemedText>
                <ThemedText style={styles.thumbLabel}>Helped</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => rateFeedback(false)}
                style={[styles.thumb, { borderColor: C.icon }]}>
                <ThemedText style={styles.thumbGlyph}>👎</ThemedText>
                <ThemedText style={styles.thumbLabel}>Not really</ThemedText>
              </Pressable>
            </View>
            <Pressable onPress={() => rateFeedback(null)} hitSlop={8} style={styles.startOver}>
              <ThemedText style={[styles.startOverText, { color: C.icon }]}>skip</ThemedText>
            </Pressable>
          </View>
        ) : step === 'due' ? (
          <View style={styles.section}>
            <ThemedText style={styles.lead}>
              First — when do you need{' '}
              <ThemedText style={styles.leadStrong}>{passage.title}</ThemedText> ready?
            </ThemedText>
            <ThemedText style={styles.subtle}>
              It helps me tell whether to build it up or get it performance-ready.
            </ThemedText>
            {DUE_OPTIONS.map((o) => (
              <Option key={o.label} label={o.label} onPress={() => pickDue(o.weeks)} />
            ))}
          </View>
        ) : step === 'challenge' ? (
          <View style={styles.section}>
            <ThemedText style={styles.lead}>
              Let’s figure out what to work on for{' '}
              <ThemedText style={styles.leadStrong}>{passage.title}</ThemedText>.
            </ThemedText>
            {reminder ? (
              <View style={[styles.noteCard, { backgroundColor: C.icon + '18' }]}>
                <ThemedText style={styles.noteLabel}>Last time you noted</ThemedText>
                <ThemedText style={styles.noteText}>“{reminder}”</ThemedText>
              </View>
            ) : null}
            <ThemedText style={styles.question}>What’s getting in your way right now?</ThemedText>
            {CHALLENGES.map((ch) => (
              <Option key={ch.key} label={ch.label} onPress={() => pickChallenge(ch.key)} />
            ))}
          </View>
        ) : step === 'follow' && challenge && FOLLOWUPS[challenge] ? (
          <View style={styles.section}>
            <ThemedText style={styles.question}>{FOLLOWUPS[challenge].q}</ThemedText>
            {FOLLOWUPS[challenge].options.map((opt) => (
              <Option
                key={opt.value}
                label={opt.label}
                onPress={() => pickFollow(challenge, opt.value)}
              />
            ))}
            <Pressable onPress={reset} hitSlop={8} style={styles.startOver}>
              <ThemedText style={[styles.startOverText, { color: C.icon }]}>‹ start over</ThemedText>
            </Pressable>
          </View>
        ) : step === 'rec' && rec ? (
          <View style={styles.section}>
            <View style={[styles.recCard, { backgroundColor: C.icon + '14' }]}>
              <ThemedText style={styles.recLead}>{rec.lead}</ThemedText>
              <ThemedText style={styles.recCall}>{rec.call}</ThemedText>
            </View>
            {rec.startTool ? (
              <Button
                label={`Start ${TOOL_NAME[rec.startTool]}`}
                onPress={() => launch(rec.startTool!)}
                style={{ backgroundColor: C.tint }}
                fullWidth
              />
            ) : null}
            {rec.escape ? (
              <ThemedText style={[styles.escape, { color: C.icon }]}>{rec.escape}</ThemedText>
            ) : null}
            <Pressable onPress={reset} hitSlop={8} style={styles.startOver}>
              <ThemedText style={[styles.startOverText, { color: C.icon }]}>‹ start over</ThemedText>
            </Pressable>
          </View>
        ) : (
          <ThemedText style={{ opacity: Opacity.muted }}>Loading…</ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  backBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 6, minWidth: 44 },
  backArrow: { fontSize: 30, fontWeight: '400', lineHeight: 32 },
  topTitle: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: Type.weight.bold, textAlign: 'center' },
  body: { padding: Spacing.lg, gap: Spacing.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  section: { gap: Spacing.sm },
  lead: { fontSize: Type.size.lg, lineHeight: 26 },
  leadStrong: { fontWeight: Type.weight.bold },
  question: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, marginTop: Spacing.sm },
  subtle: { fontSize: Type.size.sm, opacity: Opacity.muted },
  thumbRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  thumb: {
    flex: 1,
    borderWidth: Borders.thin,
    borderRadius: Radii.lg,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
  },
  thumbGlyph: { fontSize: 32, lineHeight: 38 },
  thumbLabel: { fontSize: Type.size.sm },
  option: {
    borderWidth: Borders.thin,
    borderRadius: Radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionText: { fontSize: Type.size.md },
  noteCard: { borderRadius: Radii.lg, padding: 12, gap: 2 },
  noteLabel: { fontSize: 12, opacity: Opacity.muted, textTransform: 'lowercase' },
  noteText: { fontSize: Type.size.md, fontStyle: 'italic' },
  recCard: { borderRadius: Radii.lg, padding: 16, gap: 8 },
  recLead: { fontSize: Type.size.md, lineHeight: 24 },
  recCall: { fontSize: Type.size.md, lineHeight: 24 },
  escape: { fontSize: Type.size.sm, marginTop: 2, paddingHorizontal: 2 },
  startOver: { alignSelf: 'flex-start', paddingVertical: 8 },
  startOverText: { fontSize: Type.size.sm },
});
