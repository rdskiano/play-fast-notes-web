import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { Button } from '@/components/Button';
import { FloatingMetronome } from '@/components/FloatingMetronome';
import { FloatingRhythmCard } from '@/components/FloatingRhythmCard';
import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { useMicrobreakTimer } from '@/components/PracticeTimersContext';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { ScoreWithMarkers } from '@/components/ScoreWithMarkers';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { useMetronome } from '@/lib/audio/useMetronome';
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

  async function finishLog(mood: string | null, note: string | null) {
    setNotePromptVisible(false);
    if (id) {
      await stampLastUsed(id, 'rhythmic');
      const data: Record<string, unknown> = {};
      if (mood) data.mood = mood;
      if (note) data.note = note;
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
              <PracticeTimersPill />
              <Button label="DONE" variant="danger" size="sm" onPress={doneSession} />
            </View>
          ) : (
            <PracticeTimersPill />
          )
        }
      />

      {phase === 'playing' && (
        <ThemedText style={styles.playHelper}>
          Apply the rhythm pattern shown in the floating card to your passage. Tap
          Loop to hear it, then play along with the metronome. Use ← → to cycle
          patterns. Long-press either card to drag, or pinch to resize.
        </ThemedText>
      )}

      <ScoreWithMarkers uri={passage.source_uri} markers={[]} mode="play" activePair={null} />

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
            style={[styles.pickerCard, { backgroundColor: C.background, borderColor: C.icon }]}
            onPress={(e) => e.stopPropagation()}>
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              {pickerOpen && phase === 'playing' ? 'Change note grouping' : 'Choose a note grouping'}
            </ThemedText>
            <ThemedText style={styles.pickerHelp}>
              Each grouping shows rhythms of that note count from the pattern library.
            </ThemedText>
            <View style={styles.groupingGrid}>
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
                  <AbcStaffView abc={abc} width={w} height={60} hideStaffLines centered />
                  <ThemedText style={styles.groupingNum}>{n}</ThemedText>
                  <ThemedText style={[styles.groupingCount, { color: C.icon }]}>
                    {counts[n]} patterns
                  </ThemedText>
                </Pressable>
              ))}
            </View>
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

      {phase === 'playing' && grouping && patterns.length > 0 && (
        <>
          <FloatingMetronome
            bpm={metronome.bpm}
            subdivision={metronome.subdivision}
            running={metronome.running}
            volume={metronome.volume}
            onBpm={metronome.setBpm}
            onSubdivision={metronome.setSubdivision}
            onVolume={metronome.setVolume}
            onToggle={metronome.toggle}
            initialX={16}
            initialY={120}
          />
          <FloatingRhythmCard
            pattern={patterns[currentIndex]}
            patternIndex={currentIndex}
            patternCount={patterns.length}
            rhythmLooping={metronome.rhythmLooping}
            onToggleRhythm={toggleRhythm}
            onPrev={onPrev}
            onNext={onNext}
            canPrev={currentIndex > 0}
            canNext={currentIndex < patterns.length - 1}
          />
        </>
      )}

      <PracticeLogNotePrompt
        visible={notePromptVisible}
        emoji="🎉"
        title="Rhythmic Variation — session complete"
        subtitle={passage?.title ?? undefined}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note }) => finishLog(mood, note)}
        onSkip={() => finishLog(null, null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.sm, textAlign: 'center' },
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
    // Sit above FloatingRhythmCard (zIndex 200) and FloatingMetronome
    // (zIndex 150) so the picker modal cleanly covers them.
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
