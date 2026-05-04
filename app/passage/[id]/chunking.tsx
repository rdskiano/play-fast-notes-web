import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/Button';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';

const STEPS = [
  {
    title: 'Play the Chunk',
    body:
      'Play a small group of beamed notes (typically four or six notes, or about an "inch" of music) smoothly on one even blow of air.',
  },
  {
    title: 'Shape the Phrase',
    body:
      'Play the first note of the chunk the loudest, and let the following notes naturally fade or get softer.',
  },
  {
    title: 'Take a "Sip Breath"',
    body:
      'Stop and insert a rest before the next downbeat. Use this rest to take a quick "sip breath" — like taking a quick sip of soda from a straw — and move your eyes and fingers to the first note of the next chunk as quickly as you can before starting the next chunk.',
  },
];

export default function ChunkingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [passage, setPassage] = useState<Passage | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    getPassage(id).then(setPassage);
  }, [id]);

  function onDone() {
    setNotePromptVisible(true);
  }

  async function finishLog(mood: string | null, note: string | null) {
    setNotePromptVisible(false);
    if (id) {
      await stampLastUsed(id, 'chunking');
      const data: Record<string, unknown> = {};
      if (mood) data.mood = mood;
      if (note) data.note = note;
      await logPractice(
        id,
        'chunking',
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
            Chunking
          </ThemedText>
        }
        right={
          <View style={styles.rightRow}>
            <Pressable
              onPress={() => setHelpOpen(true)}
              hitSlop={6}
              style={[styles.helpBtn, { borderColor: C.icon }]}>
              <ThemedText style={[styles.helpBtnText, { color: C.icon }]}>How to chunk</ThemedText>
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

      <ChunkingHelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} />

      <PracticeLogNotePrompt
        visible={notePromptVisible}
        emoji="🎉"
        title="Chunking — session complete"
        subtitle={passage?.title ?? undefined}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note }) => finishLog(mood, note)}
        onSkip={() => finishLog(null, null)}
      />
    </ThemedView>
  );
}

function ChunkingHelpModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: C.background }]}>
          <ThemedText type="title" style={{ textAlign: 'center' }}>
            Chunking
          </ThemedText>
          <ThemedText style={[styles.intro, { color: C.icon }]}>
            Master difficult passages by breaking the music down into small,
            manageable groups of notes called &ldquo;chunks.&rdquo; For your
            first pass through the music, follow these three simple steps:
          </ThemedText>

          <ScrollView contentContainerStyle={{ gap: 12 }}>
            {STEPS.map((s, i) => (
              <View
                key={s.title}
                style={[styles.stepCard, { borderColor: C.icon + '55', backgroundColor: C.icon + '0a' }]}>
                <View style={[styles.stepBullet, { backgroundColor: C.tint }]}>
                  <ThemedText style={styles.stepBulletText}>{i + 1}</ThemedText>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText style={styles.stepTitle}>{s.title}</ThemedText>
                  <ThemedText style={[styles.stepBody, { color: C.text }]}>
                    {s.body}
                  </ThemedText>
                </View>
              </View>
            ))}
          </ScrollView>

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
  stepTitle: { fontWeight: Type.weight.heavy, fontSize: 15 },
  stepBody: { fontSize: Type.size.md, lineHeight: 20 },
});
