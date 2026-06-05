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
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { ZoomableImage } from '@/components/ZoomableImage';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import {
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';
import { getSelfLedStrategy } from '@/lib/strategies/selfLed';

export default function SelfLedSessionScreen() {
  const { id, key } = useLocalSearchParams<{ id: string; key: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  const isTouch = useIsTouchDevice();

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

  const ann = useScoreAnnotation(passage);

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

  async function finishLog(
    mood: string | null,
    note: string | null,
    remindNext: boolean = false,
  ) {
    setNotePromptVisible(false);
    if (id && strategy) {
      await stampLastUsed(id, strategy.key);
      const data: Record<string, unknown> = {};
      if (mood) data.mood = mood;
      if (note) data.note = note;
      if (remindNext) data.remindNext = true;
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
      />

      <View
        style={[
          styles.contentArea,
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
        <PracticeToolsLayer pencil={ann.pencil} recorderPassageId={passage?.id} />
      </View>

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
        onSubmit={({ mood, note, remindNext }) => finishLog(mood, note, remindNext)}
        onSkip={() => finishLog(null, null)}
      />

      <TutorialStep
        id="self-led-play"
        visible={false}
        title="Self-led practice"
        body={
          "A loose-structure session for the strategies that don't need the app driving every rep. You play; the app keeps the score in front of you and logs the session when you're done.\n\n" +
          "How to — opens step-by-step guidance for this specific technique, including what to focus on and why it works.\n\n" +
          "DONE — ends the session and logs it. You can attach a mood and a note, or skip and just log the session.\n\n" +
          "To capture audio, use the 🎤 Recorder practice tool while you play — saved takes attach to your practice log.\n\n" +
          `${PRACTICE_TOOLS_HELP}`
        }
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
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
  contentArea: { flex: 1 },
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
