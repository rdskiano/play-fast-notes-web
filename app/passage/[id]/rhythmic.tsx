import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { Button } from '@/components/Button';
import { RhythmBar } from '@/components/RhythmBar';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { ScoreWithMarkers } from '@/components/ScoreWithMarkers';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { ZoomableImage } from '@/components/ZoomableImage';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { useMetronome } from '@/lib/audio/useMetronome';
import {
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';
import {
  parseBeatDenominator,
  patternsByGrouping,
  RHYTHM_PATTERNS,
  type Grouping,
  type RhythmPattern,
} from '@/lib/strategies/rhythmPatterns';

const GROUPING_CHOICES: { n: Grouping; abc: string; w: number }[] = [
  { n: 3, abc: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB', w: 70 },
  { n: 4, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBB', w: 90 },
  { n: 5, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBB', w: 100 },
  { n: 6, abc: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB BBB', w: 120 },
  { n: 7, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBBBB', w: 130 },
  { n: 8, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBBBBB', w: 140 },
];

function groupingCounts(): Record<Grouping, number> {
  const out = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 } as Record<Grouping, number>;
  for (const p of RHYTHM_PATTERNS) out[p.grouping] += 1;
  return out;
}

export default function RhythmicScreen() {
  const params = useLocalSearchParams<{ id: string; grouping?: string }>();
  const id = params.id;
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  // Phone density flag — drives the scrollable score below.
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;
  const isTouch = useIsTouchDevice();

  const rawGrouping = Array.isArray(params.grouping)
    ? params.grouping[0]
    : params.grouping;
  const parsedGrouping = rawGrouping ? parseInt(rawGrouping, 10) : NaN;
  const initialGrouping =
    parsedGrouping >= 3 && parsedGrouping <= 8 ? (parsedGrouping as Grouping) : null;

  const [phase, setPhase] = useState<'config' | 'playing'>(
    initialGrouping ? 'playing' : 'config',
  );
  const [passage, setPassage] = useState<Passage | null>(null);
  const [grouping, setGrouping] = useState<Grouping | null>(initialGrouping);
  const [patterns, setPatterns] = useState<RhythmPattern[]>(
    initialGrouping ? patternsByGrouping(initialGrouping) : [],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  // When true, re-show the grouping picker overlay so the user can switch
  // groupings mid-session without leaving the screen.
  const [pickerOpen, setPickerOpen] = useState(false);

  const metronome = useMetronome(80);
  const microbreak = useMicrobreakTimer();

  const ann = useScoreAnnotation(passage);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPassage(id).then((p) => {
      if (!cancelled) setPassage(p);
    });
    return () => {
      cancelled = true;
      metronome.stop();
      metronome.stopRhythmLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (phase !== 'playing' || !microbreak.config.enabled) return;
    const handle = setInterval(() => microbreak.trigger(), 2 * 60 * 1000);
    return () => clearInterval(handle);
  }, [phase, microbreak.config.enabled, microbreak]);

  function startWithGrouping(g: Grouping) {
    const list = patternsByGrouping(g);
    if (list.length === 0) return;
    // Stop any in-flight rhythm loop — the pattern being looped is about
    // to disappear from the visible card.
    metronome.stopRhythmLoop();
    setGrouping(g);
    setPatterns(list);
    setCurrentIndex(0);
    setPhase('playing');
    setPickerOpen(false);
  }

  function doneSession() {
    setNotePromptVisible(true);
  }

  async function finishLog(
    mood: string | null,
    note: string | null,
    remindNext: boolean = false,
  ) {
    setNotePromptVisible(false);
    if (id) {
      await stampLastUsed(id, 'rhythmic');
      const data: Record<string, unknown> = {};
      if (mood) data.mood = mood;
      if (note) data.note = note;
      if (remindNext) data.remindNext = true;
      await logPractice(
        id,
        'rhythmic',
        Object.keys(data).length > 0 ? data : undefined,
      );
    }
    metronome.stop();
    metronome.stopRhythmLoop();
    router.back();
  }

  function exitSession() {
    metronome.stop();
    metronome.stopRhythmLoop();
    router.back();
  }

  function onPrev() {
    const next = Math.max(0, currentIndex - 1);
    if (next === currentIndex) return;
    setCurrentIndex(next);
    if (metronome.rhythmLooping && patterns[next]) {
      metronome.startRhythmLoop(
        patterns[next].notes,
        parseBeatDenominator(patterns[next].timeSig),
      );
    }
  }
  function onNext() {
    const next = Math.min(patterns.length - 1, currentIndex + 1);
    if (next === currentIndex) return;
    setCurrentIndex(next);
    if (metronome.rhythmLooping && patterns[next]) {
      metronome.startRhythmLoop(
        patterns[next].notes,
        parseBeatDenominator(patterns[next].timeSig),
      );
    }
  }

  function toggleRhythm() {
    const current = patterns[currentIndex];
    if (!current) return;
    metronome.toggleRhythmLoop(
      current.notes,
      parseBeatDenominator(current.timeSig),
    );
  }

  if (!passage) return <ThemedView style={{ flex: 1 }} />;

  const counts = groupingCounts();

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={phase === 'playing' ? exitSession : () => router.back()}
        center={
          phase === 'playing' && grouping ? (
            <View style={styles.titleRow}>
              <ThemedText style={styles.topCenter} numberOfLines={1}>
                Pattern {currentIndex + 1}/{patterns.length}
              </ThemedText>
              <Pressable
                onPress={() => setPickerOpen(true)}
                hitSlop={6}
                accessibilityLabel="Change note grouping"
                style={[styles.changeChip, { borderColor: C.tint, backgroundColor: C.tint + '15' }]}>
                <ThemedText style={[styles.changeChipText, { color: C.tint }]}>
                  {grouping}-note ▾
                </ThemedText>
                <ThemedText style={[styles.changeHint, { color: C.tint }]}>
                  change
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Rhythmic Variation
            </ThemedText>
          )
        }
        right={
          phase === 'playing' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Button label="DONE" variant="danger" size="sm" onPress={doneSession} />
            </View>
          ) : null
        }
      />

      {phase === 'playing' && grouping && patterns.length > 0 && (
        <RhythmBar
          pattern={patterns[currentIndex]}
          rhythmLooping={metronome.rhythmLooping}
          onToggleRhythm={toggleRhythm}
          onPrev={onPrev}
          onNext={onNext}
          canPrev={currentIndex > 0}
          canNext={currentIndex < patterns.length - 1}
          compact={isPhone}
        />
      )}

      {phase === 'playing' && !isPhone && (
        <ThemedText style={styles.playHelper}>
          Play your passage in this rhythm — ▶ Loop to hear it, ← → to change
          patterns, then play along with the metronome from the edge tab.
        </ThemedText>
      )}

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
          {isTouch ? (
            // Phone: show the full passage by default, let the user pinch
            // in (and one-finger pan) to read notes up close. Replaces the
            // earlier horizontal-scroll-only approach so the user can
            // also zoom vertically when a passage has tall barlines or
            // multi-line systems.
            <ZoomableImage
              uri={passage.source_uri}
              style={StyleSheet.absoluteFill}
              persistKey={passage.id}
            />
          ) : (
            <ScoreWithMarkers
              uri={passage.source_uri}
              markers={[]}
              mode="play"
              activePair={null}
            />
          )}
          {/* Annotation canvas stays mounted on tablet/desktop. On phone
              it's hidden during rhythmic — the canvas would have to scroll
              with the score to stay aligned, and the user's ask was about
              seeing notes clearly, not annotating in this flow. */}
          {!isPhone && ann.canvas}
        </View>
        {phase === 'playing' && (
          <PracticeToolsLayer
            metronome={metronome}
            pencil={ann.pencil}
            recorderPassageId={passage?.id}
          />
        )}
      </View>

      {(phase === 'config' || pickerOpen) && (
        <Pressable
          style={styles.overlay}
          onPress={() => {
            // Tapping the dim backdrop closes a re-opened picker. Don't
            // dismiss when the user is in the initial config phase — they
            // need to pick before they can practice.
            if (phase === 'playing') setPickerOpen(false);
          }}>
          <Pressable
            style={[
              styles.pickerCard,
              // Phone: cap the card to the viewport so the grid below can
              // scroll instead of the bottom choices falling off-screen with
              // no way to reach them (B-002).
              isPhone && styles.pickerCardPhone,
              { backgroundColor: C.background, borderColor: C.icon },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              {pickerOpen && phase === 'playing' ? 'Change note grouping' : 'Choose a note grouping'}
            </ThemedText>
            <ThemedText style={styles.pickerHelp}>
              Each grouping shows rhythms of that note count from the pattern library.
            </ThemedText>
            <ScrollView
              style={styles.groupingScroll}
              contentContainerStyle={styles.groupingGrid}
              showsVerticalScrollIndicator={isPhone}>
              {GROUPING_CHOICES.map(({ n, abc, w }) => (
                <Pressable
                  key={n}
                  onPress={() => startWithGrouping(n)}
                  style={[
                    styles.groupingChip,
                    {
                      borderColor: grouping === n ? C.tint : C.icon,
                      borderWidth: grouping === n ? 2 : 1,
                    },
                  ]}>
                  {/* Smaller illustration on phone so all six chips pack into
                      the bounded card with little or no scrolling. */}
                  <AbcStaffView
                    abc={abc}
                    width={w}
                    height={isPhone ? 44 : 60}
                    hideStaffLines
                    centered
                  />
                  <ThemedText style={styles.groupingNum}>{n}</ThemedText>
                  <ThemedText style={[styles.groupingCount, { color: C.icon }]}>
                    {counts[n]} patterns
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            {pickerOpen && phase === 'playing' && (
              <Pressable
                onPress={() => setPickerOpen(false)}
                style={styles.cancelChange}>
                <ThemedText style={[styles.cancelChangeText, { color: C.tint }]}>
                  Cancel
                </ThemedText>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      )}

      {/* Keyboard / foot-pedal advance: Space, Enter, Page Down, ArrowDown
          (or any pedal key) call onNext, the same action as the card's
          Next → button. Silent during the config / grouping-picker overlay
          and the practice-log prompt so it can't fire behind a modal.
          PedalCatcher already ignores keystrokes aimed at text inputs. */}
      <PedalCatcher
        active={phase === 'playing' && !notePromptVisible && !pickerOpen}
        onAdvance={onNext}
      />

      <PracticeLogNotePrompt
        visible={notePromptVisible}
        emoji="🎉"
        title="Rhythmic Variation — session complete"
        subtitle={passage?.title ?? undefined}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note, remindNext }) => finishLog(mood, note, remindNext)}
        onSkip={() => finishLog(null, null)}
      />

      {phase === 'config' ? (
        <TutorialStep
          id="rhythmic-config"
          visible={false}
          title="Rhythmic Variation — pick a grouping"
          body={
            "How many notes are in each rhythmic unit of your passage? Count the notes in one beat or one measure — whatever feels like a natural repeating chunk — then pick that number.\n\n" +
            "The app pulls every rhythm pattern matching that grouping from its library. You'll cycle through them on the next screen."
          }
        />
      ) : (
        <TutorialStep
          id="rhythmic-play"
          visible={false}
          title="Rhythmic Variation"
          body={
            "Play the passage with a different rhythm pattern each time — dotted, swung, reversed, anything that breaks your default groove. Strengthens internal pulse and exposes weak spots that playing as written can hide.\n\n" +
            "The rhythm bar across the top shows the current pattern: tap ▶ Loop to hear it (■ Stop to silence it), and ← / → to move through the patterns. The music fills the rest of the screen — pinch to zoom in on the notes.\n\n" +
            "Use the N-note ▾ chip in the top bar to switch to a different note grouping, and DONE to finish and log the session. Best when you already know the notes and want to even out your technique." +
            `\n\n${PRACTICE_TOOLS_HELP}`
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.sm, textAlign: 'center' },
  contentArea: { flex: 1 },
  playHelper: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    opacity: Opacity.muted,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    lineHeight: 18,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000066',
    padding: 20,
    // Sit above the rhythm bar and the floating practice tools so the
    // picker modal cleanly covers them.
    zIndex: 500,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 540,
    borderRadius: Radii['2xl'],
    borderWidth: Borders.thin,
    padding: 18,
    gap: Spacing.md,
  },
  // Phone caps the card to the viewport; the grouping grid scrolls inside.
  pickerCardPhone: { maxHeight: '85%' },
  // flexShrink lets the grid give up height to the title/help above when the
  // card is height-capped, so the ScrollView actually has something to scroll.
  groupingScroll: { alignSelf: 'stretch', flexShrink: 1 },
  pickerHelp: { opacity: 0.65, fontSize: 12, textAlign: 'center' },
  groupingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  groupingChip: {
    width: '47%',
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    paddingVertical: 6,
    alignItems: 'center',
  },
  groupingNum: { fontSize: Type.size.xl, fontWeight: Type.weight.heavy, marginTop: -4 },
  groupingCount: { fontSize: 10, marginTop: 2 },
  cancelChange: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  cancelChangeText: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  changeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
  },
  changeChipText: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
  },
  changeHint: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.8,
  },
});
