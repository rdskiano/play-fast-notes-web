import { Image } from 'expo-image';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { ZoomableImage } from '@/components/ZoomableImage';
import { Button } from '@/components/Button';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { useMetronome } from '@/lib/audio/useMetronome';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import {
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';

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
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  const isTouch = useIsTouchDevice();

  const [passage, setPassage] = useState<Passage | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Owned here (not inside PracticeToolsLayer) so the practice-log prompt can
  // silence a running click while it's open. 120 matches the layer's default.
  const metronome = useMetronome(120);

  useEffect(() => {
    if (!id) return;
    getPassage(id).then(setPassage);
  }, [id]);

  const ann = useScoreAnnotation(passage);

  function onDone() {
    setNotePromptVisible(true);
  }

  async function finishLog(
    mood: string | null,
    note: string | null,
    remindNext: boolean = false,
  ) {
    setNotePromptVisible(false);
    if (id) {
      await stampLastUsed(id, 'chunking');
      const data: Record<string, unknown> = {};
      if (mood) data.mood = mood;
      if (note) data.note = note;
      if (remindNext) data.remindNext = true;
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
        exitLabel="EXIT"
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
      />

      <View
        style={[
          { flex: 1 },
          // Laptop: inset the score from the screen edges so it clears the
          // edge-docked tool tabs and gets top/bottom breathing room. The
          // score lives in an inner flex child (an absolutely-filled score
          // ignores this padding on web); PracticeToolsLayer stays a
          // sibling at the true screen edge. Phone keeps full-bleed zoom.
          !isPhone && {
            paddingHorizontal: SCORE_SIDE_BUFFER,
            paddingVertical: SCORE_VERT_BUFFER,
            backgroundColor: SCORE_FRAME_BG,
          },
        ]}>
        <View style={{ flex: 1, width: '100%', position: 'relative' }}>
          {passage?.source_uri ? (
            isTouch ? (
              <ZoomableImage
                uri={passage.source_uri}
                style={styles.scoreFill}
                persistKey={passage.id}
              />
            ) : (
              <Image
                source={{ uri: passage.source_uri }}
                style={styles.scoreFill}
                contentFit="contain"
              />
            )
          ) : (
            <View style={styles.empty}>
              <ThemedText style={{ opacity: 0.6, textAlign: 'center' }}>
                Loading…
              </ThemedText>
            </View>
          )}
          {ann.canvas}
        </View>
        <PracticeToolsLayer
          metronome={metronome}
          pencil={ann.pencil}
          recorderPassageId={passage?.id}
        />
      </View>

      <ChunkingHelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} />

      <PracticeLogNotePrompt
        metronome={metronome}
        visible={notePromptVisible}
        emoji="🎉"
        title="Chunking — session complete"
        subtitle={passage?.title ?? undefined}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note, remindNext }) => finishLog(mood, note, remindNext)}
        onSkip={() => finishLog(null, null)}
      />

      <TutorialStep
        id="chunking-play"
        visible={false}
        title="Chunking"
        body={
          'Drill the passage one chunk at a time — a small group of beamed notes on one breath — instead of facing it as one wall of notes.\n\n' +
          'Tap How to chunk (top-right) for the three-step method: play the chunk, shape the phrase, then take a quick "sip breath" before the next one.\n\n' +
          "Work through the passage chunk by chunk at your own pace, then tap DONE to log the session. ‹ Back leaves without logging.\n\n" +
          PRACTICE_TOOLS_HELP
        }
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
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
