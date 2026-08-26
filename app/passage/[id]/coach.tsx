// The coach — one suggestion read from the practice trail, above the menu.
//
// This replaces the questionnaire (the fixed question tree in
// lib/coach/engine.ts) as the coach's face. The August live-practice sessions
// showed the interview asks for facts the app already knows and can't tell
// day one from day two — the differentiator lives in the TRAIL. So "How
// should I practice?" now answers immediately: a suggestion card with a
// plain-language why, a Practice-this button, and the full strategy list
// right below it (the coach suggests; it never decides).
//
// A never-practiced passage routes to the first-practice evaluation instead —
// measurements before advice.

import Feather from '@expo/vector-icons/Feather';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { StrategyDemoModal, type StrategyDemoId } from '@/components/onboarding/StrategyDemoModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { TOOL_ROUTE, type ToolKey } from '@/lib/coach/engine';
import { CARD_TOOL_NAME, suggestFromTrail, type CoachCard, type LadderSnapshot } from '@/lib/coach/suggest';
import { getOrCreateExercise } from '@/lib/db/repos/exercises';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { getPracticeLogForPassage } from '@/lib/db/repos/practiceLog';
import { setSetting } from '@/lib/db/repos/settings';
import { getTempoLadder } from '@/lib/db/repos/tempoLadder';

// The coach's last suggestion for a piece, stored in settings so the return
// visit can ask "did it help?". helpful: undefined = unrated; true/false =
// thumbs; null = skipped. Read by analytics off `coach:lastRec:*` rows.
type PendingRec = {
  // 'icu2' sits outside ToolKey (multi-passage tool) but rates like any other
  // suggestion — analytics reads the string as-is.
  tool: ToolKey | 'icu2';
  challenge: string;
  at: number;
  helpful?: boolean | null;
  ratedAt?: number;
};
const recKey = (pieceId: string) => 'coach:lastRec:' + pieceId;

// ToolKey → the strategy-demo id used by StrategyDemoModal. Only 'ladder'
// differs (its demo id is 'tempo'); the rest match by name.
const DEMO_FOR_TOOL: Record<ToolKey, StrategyDemoId> = {
  ladder: 'tempo',
  icu: 'icu',
  rep: 'rep',
  rv: 'rv',
  micro: 'micro',
  macro: 'macro',
};

// The self-pick list under the card — same six tools as the passage hub, in
// the hub's order.
const PICK_LIST: ToolKey[] = ['ladder', 'icu', 'rv', 'micro', 'macro', 'rep'];

export default function CoachScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [card, setCard] = useState<CoachCard | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<PendingRec | null>(null);
  // The suggestion we just launched — set on "Practice this", read when the
  // finished session navigates back here so we can ask "did that help?".
  const launchedRecRef = useRef<PendingRec | null>(null);
  const [demoId, setDemoId] = useState<StrategyDemoId | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [p, entries] = await Promise.all([
          getPassage(id),
          getPracticeLogForPassage(id).catch(() => []),
        ]);
        if (cancelled) return;
        setPassage(p);
        // Ladder snapshot for the card's numbers ("banked you at 85"). The
        // exercise row exists for any passage that laddered; getOrCreate is
        // the established read path (the hub uses it the same way).
        let ladder: LadderSnapshot = null;
        try {
          const ex = await getOrCreateExercise(id, 'tempo_ladder');
          const tl = await getTempoLadder(ex.id);
          if (tl) ladder = { current: tl.current_tempo, goal: tl.goal_tempo };
        } catch {
          // no ladder yet — the card just speaks without numbers
        }
        if (cancelled) return;
        const suggestion = suggestFromTrail(entries, ladder);
        if (suggestion.kind === 'evaluate') {
          // Never practiced → measurements first. Replace so Back from the
          // evaluation lands on the passage, not this interstitial.
          router.replace({ pathname: '/passage/[id]/evaluate', params: { id } });
          return;
        }
        setCard(suggestion);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  // When a coach-launched session finishes, the tool does a normal "back" and
  // lands us here again — that's the moment to ask whether the suggestion
  // helped. (No-op on the first focus, when nothing has been launched yet.)
  useFocusEffect(
    useCallback(() => {
      const rec = launchedRecRef.current;
      if (rec) {
        launchedRecRef.current = null;
        setPendingFeedback(rec);
      }
    }, []),
  );

  const openTool = useCallback(
    (tool: ToolKey | 'icu2') => {
      if (!passage) return;
      if (tool === 'rep') {
        router.push({ pathname: '/interleaved', params: { seedPassageId: passage.id } });
        return;
      }
      if (tool === 'icu2') {
        // Multi-passage tool — lives at /icu2, seeded like Rep Rotator.
        router.push({ pathname: '/icu2', params: { seedPassageId: passage.id } });
        return;
      }
      if (tool === 'rv') {
        // Rhythmic Variation needs a note-grouping; default to 4 (changeable
        // in-tool). Bypasses the mode/grouping chooser sheet.
        router.push({
          pathname: '/passage/[id]/rhythmic',
          params: { id: passage.id, grouping: '4' },
        });
        return;
      }
      router.push(`/passage/${passage.id}/${TOOL_ROUTE[tool]}`);
    },
    [passage, router],
  );

  // "Practice this" — launches AND stamps the suggestion so the return visit
  // asks "did that help?". Self-picks from the list below launch unstamped:
  // the coach only gets rated on advice that was actually followed.
  const followSuggestion = useCallback(() => {
    if (!passage || !card || card.kind === 'evaluate') return;
    const tool = card.kind === 'icu2' ? 'icu2' : card.tool;
    const rec: PendingRec = { tool, challenge: 'trail', at: Date.now() };
    launchedRecRef.current = rec;
    setSetting(recKey(passage.id), JSON.stringify(rec)).catch(() => {});
    openTool(tool);
  }, [passage, card, openTool]);

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

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StrategyDemoModal demoId={demoId} onClose={() => setDemoId(null)} />

      {/* Big-title header (DESIGN_RULES §3 — left-aligned page title) */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={styles.backLink}>‹ Back</ThemedText>
        </Pressable>
        <ThemedText type="title">Practice coach · beta</ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <ThemedText style={styles.muted}>Loading…</ThemedText>
        ) : !passage ? (
          <ThemedText>Passage not found.</ThemedText>
        ) : pendingFeedback ? (
          <View style={styles.section}>
            <ThemedText style={styles.lead}>
              How did that go? You just worked on this with{' '}
              <ThemedText style={styles.leadStrong}>
                {pendingFeedback.tool === 'icu2'
                  ? 'Interleaved Click-Up 2'
                  : CARD_TOOL_NAME[pendingFeedback.tool]}
              </ThemedText>
              . Did it help?
            </ThemedText>
            <View style={styles.thumbRow}>
              <Pressable
                onPress={() => rateFeedback(true)}
                style={({ pressed }) => [styles.thumb, pressed && styles.pressed]}>
                <Feather name="thumbs-up" size={26} color={Palette.text} />
                <ThemedText style={styles.thumbLabel}>Helped</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => rateFeedback(false)}
                style={({ pressed }) => [styles.thumb, pressed && styles.pressed]}>
                <Feather name="thumbs-down" size={26} color={Palette.text} />
                <ThemedText style={styles.thumbLabel}>Not really</ThemedText>
              </Pressable>
            </View>
            <Pressable onPress={() => rateFeedback(null)} hitSlop={8} style={styles.ghost}>
              <ThemedText style={styles.ghostText}>skip</ThemedText>
            </Pressable>
          </View>
        ) : card && card.kind !== 'evaluate' ? (
          <View style={styles.section}>
            <View style={styles.card}>
              <ThemedText style={styles.eyebrow}>🎯 Coach’s suggestion</ThemedText>
              <ThemedText style={styles.cardTitle}>{card.title}</ThemedText>
              <ThemedText style={styles.cardWhy}>{card.why}</ThemedText>
              <View style={styles.cardBtnRow}>
                <View style={{ flex: 1 }}>
                  <Button label="Practice this" onPress={followSuggestion} fullWidth />
                </View>
                <Pressable
                  onPress={() => router.back()}
                  style={({ pressed }) => [styles.noThanks, pressed && styles.pressed]}>
                  <ThemedText style={styles.noThanksText}>No thanks</ThemedText>
                </Pressable>
              </View>
              {/* ICU2 has no strategy demo yet — the badge only renders for
                  the six ToolKey tools. */}
              {card.kind === 'tool' && (
                <Pressable
                  onPress={() => setDemoId(DEMO_FOR_TOOL[card.tool])}
                  hitSlop={8}
                  style={styles.seeDemo}>
                  <ThemedText style={styles.seeDemoText}>▷ See how it works</ThemedText>
                </Pressable>
              )}
            </View>

            <ThemedText style={styles.pickHeading}>
              Or pick your own — same list as always:
            </ThemedText>
            {PICK_LIST.map((tool) => (
              <Pressable
                key={tool}
                onPress={() => openTool(tool)}
                style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}>
                <ThemedText style={styles.pickLabel}>{CARD_TOOL_NAME[tool]}</ThemedText>
                <ThemedText style={styles.pickChevron}>›</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : (
          <ThemedText style={styles.muted}>Loading…</ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  backLink: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
  },
  body: { padding: Spacing.lg, gap: Spacing.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  section: { gap: Spacing.sm },
  muted: { color: Palette.textMuted },
  lead: { fontSize: Type.size.lg, lineHeight: 26, color: Palette.text },
  leadStrong: { fontWeight: Type.weight.bold, color: Palette.text },
  thumbRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  thumb: {
    flex: 1,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii['2xl'],
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
    ...Lift,
  },
  thumbLabel: { fontSize: Type.size.sm, color: Palette.textSecondary },
  pressed: { transform: [{ scale: 0.985 }] },
  card: {
    backgroundColor: Palette.accentSoft,
    borderWidth: Borders.thin,
    borderColor: Palette.accent,
    borderRadius: Radii['2xl'],
    padding: Spacing.md,
    gap: 6,
    ...Lift,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: Type.weight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Palette.accent,
  },
  cardTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.2,
  },
  cardWhy: { fontSize: Type.size.md, lineHeight: 22, color: Palette.textSecondary },
  cardBtnRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginTop: 4 },
  noThanks: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radii['2xl'],
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  noThanksText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold, color: Palette.text },
  seeDemo: { alignSelf: 'center', paddingVertical: 6 },
  seeDemoText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold, color: Palette.accent },
  pickHeading: {
    fontSize: Type.size.sm,
    color: Palette.textMuted,
    marginTop: Spacing.sm,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii['2xl'],
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 44,
    ...Lift,
  },
  pickLabel: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, color: Palette.text },
  pickChevron: { fontSize: Type.size.lg, color: Palette.textMuted },
  ghost: { alignSelf: 'flex-start', paddingVertical: 8 },
  ghostText: { fontSize: Type.size.sm, color: Palette.textMuted },
});
