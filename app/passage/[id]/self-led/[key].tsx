// Generic Self-Led session screen.
//
// Mirrors the Chunking screen skeleton: passage image + DONE button + the
// existing mood/note prompt → log entry. The strategy key (chunking,
// add_a_note, pitch, phrasing, freeform) comes from the URL. Recording
// has its own dedicated route at ./recording.tsx because it needs the
// MediaRecorder state machine.

import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { getSelfLedStrategy } from '@/lib/strategies/selfLed';

export default function SelfLedSessionScreen() {
  const { id, key } = useLocalSearchParams<{ id: string; key: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const strategy = key ? getSelfLedStrategy(key) : null;

  const [passage, setPassage] = useState<Passage | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    // Defensive: anyone landing on /self-led/recording via this generic
    // route gets bumped to the dedicated screen.
    if (key === 'recording' && id) {
      router.replace(`/passage/${id}/self-led/recording` as never);
    }
  }, [key, id, router]);

  useEffect(() => {
    if (!id) return;
    getPassage(id).then(setPassage);
  }, [id]);

  if (!strategy) {
    return (
      <ThemedView style={styles.empty}>
        <Stack.Screen options={{ headerShown: false }} />
        <ThemedText style={{ opacity: 0.6 }}>Unknown strategy.</ThemedText>
        <Pressable onPress={() => router.back()} style={{ marginTop: Spacing.lg }}>
          <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
            ‹ Back
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  function onDone() {
    setNotePromptVisible(true);
  }

  async function finishLog(mood: string | null, note: string | null) {
    setNotePromptVisible(false);
    if (id && strategy) {
      await stampLastUsed(id, strategy.key);
      const data: Record<string, unknown> = {};
      if (mood) data.mood = mood;
      if (note) data.note = note;
      await logPractice(
        id,
        strategy.key,
        Object.keys(data).length > 0 ? data : undefined,
      );
    }
    router.back();
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Back"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            {strategy.title}
          </ThemedText>
        }
        right={
          <View style={styles.rightRow}>
            <Pressable
              onPress={() => setHelpOpen(true)}
              hitSlop={6}
              style={[styles.helpBtn, { borderColor: C.icon }]}>
              <ThemedText style={[styles.helpBtnText, { color: C.icon }]}>
                How to
              </ThemedText>
            </Pressable>
            <Button label="DONE" size="sm" onPress={onDone} />
          </View>
        }
        sub={<PracticeTimersPill />}
      />

      {passage?.source_uri ? (
        <Image
          source={{ uri: passage.source_uri }}
          style={styles.scoreFill}
          contentFit="contain"
        />
      ) : (
        <View style={styles.empty}>
          <ThemedText style={{ opacity: 0.6, textAlign: 'center' }}>
            Loading…
          </ThemedText>
        </View>
      )}

      <SelfLedHelpModal
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
        strategy={strategy}
      />

      <PracticeLogNotePrompt
        visible={notePromptVisible}
        emoji="🎉"
        title={`${strategy.title} — session complete`}
        subtitle={passage?.title ?? undefined}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note }) => finishLog(mood, note)}
        onSkip={() => finishLog(null, null)}
      />
    </ThemedView>
  );
}

function SelfLedHelpModal({
  visible,
  onClose,
  strategy,
}: {
  visible: boolean;
  onClose: () => void;
  strategy: ReturnType<typeof getSelfLedStrategy>;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  if (!strategy) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: C.background }]}>
          <ThemedText type="title" style={{ textAlign: 'center' }}>
            {strategy.title}
          </ThemedText>
          <ThemedText style={[styles.intro, { color: C.icon }]}>
            {strategy.longDescription}
          </ThemedText>

          <ScrollView contentContainerStyle={{ gap: 12 }}>
            {strategy.steps.map((s, i) => (
              <View
                key={i}
                style={[
                  styles.stepCard,
                  { borderColor: C.icon + '55', backgroundColor: C.icon + '0a' },
                ]}>
                <View style={[styles.stepBullet, { backgroundColor: C.tint }]}>
                  <ThemedText style={styles.stepBulletText}>{i + 1}</ThemedText>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText style={[styles.stepBody, { color: C.text }]}>
                    {s}
                  </ThemedText>
                </View>
              </View>
            ))}
          </ScrollView>

          {strategy.attribution && (
            <ThemedText
              style={[styles.attribution, { color: C.icon }]}>
              {strategy.attribution}
            </ThemedText>
          )}

          <Button label="Got it" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  helpBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: Borders.medium,
  },
  helpBtnText: { fontWeight: Type.weight.heavy, fontSize: Type.size.sm },
  scoreFill: { flex: 1, width: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backdrop: {
    flex: 1,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    borderRadius: Radii['2xl'],
    padding: 20,
    gap: 14,
  },
  intro: {
    fontSize: Type.size.md,
    lineHeight: 21,
    textAlign: 'center',
  },
  stepCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    padding: 14,
    alignItems: 'flex-start',
  },
  stepBullet: {
    width: 28,
    height: 28,
    borderRadius: Radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepBulletText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 15 },
  stepBody: { fontSize: Type.size.md, lineHeight: 20 },
  attribution: {
    fontSize: Type.size.sm,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
