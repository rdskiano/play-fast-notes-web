import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image as RNImage,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { FloatingClickUpControls } from '@/components/FloatingClickUpControls';
import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { ScoreWithMarkers } from '@/components/ScoreWithMarkers';
import { SessionTopBar } from '@/components/SessionTopBar';
import { TempoConfigFields } from '@/components/TempoConfigFields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MIN_MARKERS, useClickUpSession } from '@/hooks/useClickUpSession';
import { activePairMarkers } from '@/lib/strategies/clickUp';

function formatActiveUnits(activeUnits: number[]): string {
  if (activeUnits.length === 0) return '';
  if (activeUnits.length === 1) return `UNIT ${activeUnits[0]}`;
  return `UNITS ${activeUnits[0]}–${activeUnits[activeUnits.length - 1]}`;
}

export default function ClickUpScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width: winWidth } = useWindowDimensions();
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const session = useClickUpSession(id);

  useEffect(() => {
    if (session.piece?.source_uri) {
      RNImage.getSize(
        session.piece.source_uri,
        (w, h) => {
          if (h > 0) setImageAspect(w / h);
        },
        () => setImageAspect(1.4),
      );
    }
  }, [session.piece?.source_uri]);

  const {
    phase,
    piece,
    markers,
    storedConfig,
    currentIndex,
    startTempo,
    goalTempo,
    increment,
    celebrating,
    metronome,
    setStartTempo,
    setGoalTempo,
    setIncrement,
    placeMarker,
    removeMarker,
    undoMarker,
    clearMarkers,
    commitMarkersAndConfigure,
    startPlaying,
    onNext,
    onPrev,
    exitSession,
    doneSession,
    dismissCelebration,
    goBackToMarking,
  } = session;

  // ── MARKING ────────────────────────────────────────────────────────────
  if (phase === 'marking') {
    if (!piece) return <ThemedView style={{ flex: 1 }} />;
    const canContinue = markers.length >= MIN_MARKERS;
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SessionTopBar
          onExit={exitSession}
          center={
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              Mark units — {markers.length} placed
            </ThemedText>
          }
          right={
            <>
              <PracticeTimersPill />
              <Pressable
                onPress={undoMarker}
                hitSlop={6}
                disabled={markers.length === 0}
                style={[
                  styles.topBtn,
                  { opacity: markers.length === 0 ? 0.35 : 1 },
                ]}>
                <ThemedText style={[styles.topBtnText, { color: C.tint }]}>
                  UNDO
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={clearMarkers}
                hitSlop={6}
                disabled={markers.length === 0}
                style={[
                  styles.topBtn,
                  { opacity: markers.length === 0 ? 0.35 : 1 },
                ]}>
                <ThemedText style={[styles.topBtnText, { color: '#c0392b' }]}>
                  CLEAR
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={canContinue ? commitMarkersAndConfigure : undefined}
                hitSlop={6}
                disabled={!canContinue}
                style={[
                  styles.topBtn,
                  {
                    backgroundColor: canContinue ? '#2ecc71' : C.icon + '55',
                  },
                ]}>
                <ThemedText style={[styles.topBtnText, { color: '#fff' }]}>
                  NEXT →
                </ThemedText>
              </Pressable>
            </>
          }
        />
        <ScrollView contentContainerStyle={styles.markingContent}>
          <ThemedText type="subtitle">How it works</ThemedText>
          <ThemedText style={styles.blurbText}>
            Interleaved Click-Up is a structured practice strategy developed by{' '}
            <ThemedText
              style={styles.blurbBold}
              onPress={() => Linking.openURL('https://www.mollygebrian.com')}>
              Molly Gebrian
            </ThemedText>
            , a viola professor and expert in the science of practice. The strategy is
            detailed in her book{' '}
            <ThemedText style={styles.blurbItalic}>
              Learn Faster, Perform Better — A Musician&apos;s Guide to the Neuroscience
              of Practicing
            </ThemedText>
            .
          </ThemedText>
          <ThemedText style={styles.blurbText}>
            Break the passage into small units (like beats or measures) by tapping the
            score to mark the beginning of each unit. Tap just above the music so the
            notes are still visible. The app then walks you through a carefully ordered
            sequence that interleaves individual units with progressively larger
            combinations — and at each stage the tempo climbs from your start BPM to
            your goal. This forces your brain to constantly retrieve and reconnect
            sections, producing deeper learning and more reliable performances under
            pressure.
          </ThemedText>
          <Pressable
            onPress={() => Linking.openURL('https://www.mollygebrian.com')}
            style={[styles.linkBtn, { borderColor: C.tint }]}>
            <ThemedText style={[styles.linkText, { color: C.tint }]}>
              Visit mollygebrian.com
            </ThemedText>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: C.icon + '33' }]} />

          <ThemedText style={styles.helper}>
            Tap just above the music to mark the beginning of each unit. You need at
            least {MIN_MARKERS} marks. Tap an existing mark to remove it.
          </ThemedText>
          <View
            style={{
              height: imageAspect ? (winWidth - 32) / imageAspect : 500,
              borderRadius: 8,
              overflow: 'hidden',
            }}>
            <ScoreWithMarkers
              uri={piece.source_uri}
              markers={markers}
              mode="place"
              onTap={placeMarker}
              onRemoveMarker={removeMarker}
            />
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // ── CONFIG ─────────────────────────────────────────────────────────────
  if (phase === 'config') {
    const derivedN = Math.max(0, markers.length - 1);
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.configHeader}>
          <PracticeTimersPill />
        </View>
        <ScrollView contentContainerStyle={[styles.configContainer, { paddingTop: 10 }]}>
          <ThemedText type="title">Set the tempo range</ThemedText>
          <ThemedText style={{ opacity: 0.7 }}>
            {derivedN} units defined from your {markers.length} marks.
          </ThemedText>
          <TempoConfigFields
            startLabel="Start Tempo"
            goalLabel="Performance Tempo"
            startValue={startTempo}
            goalValue={goalTempo}
            increment={increment}
            onStart={setStartTempo}
            onGoal={setGoalTempo}
            onIncrement={setIncrement}
            metronome={metronome}
          />
          <View style={{ marginTop: 10 }}>
            <ThemedText style={styles.blurbText}>
              Set your <ThemedText style={styles.blurbBold}>Start Tempo</ThemedText> to
              a speed where you can play the passage comfortably and accurately — a
              good rule of thumb is to start at half the performance tempo. Set the{' '}
              <ThemedText style={styles.blurbBold}>Performance Tempo</ThemedText> to
              the speed you ultimately need to perform at. The app will walk through
              every tempo in between, climbing by the increment you choose above.
            </ThemedText>
          </View>
        </ScrollView>

        <View style={{ padding: 20, gap: 10 }}>
          <Button label="Start practicing" onPress={startPlaying} fullWidth />
          <Button label="← Back to marking" variant="ghost" onPress={goBackToMarking} fullWidth />
        </View>
      </ThemedView>
    );
  }

  // ── PLAYING ────────────────────────────────────────────────────────────
  if (!storedConfig || !piece) return <ThemedView style={{ flex: 1 }} />;
  const step = storedConfig.steps[currentIndex];
  const activePair = step ? activePairMarkers(step.activeUnits) : null;
  const activeMarkers =
    activePair != null
      ? markers.filter((m) => m.index === activePair[0] || m.index === activePair[1])
      : [];
  const unitLabel = step ? formatActiveUnits(step.activeUnits) : '';

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={exitSession}
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            {unitLabel} · Step {currentIndex + 1}/{storedConfig.steps.length}
          </ThemedText>
        }
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <PracticeTimersPill />
            <Pressable onPress={onPrev} hitSlop={6} style={styles.topBtn}>
              <ThemedText style={[styles.topBtnText, { color: C.tint }]}>
                ← Prev
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setNotePromptVisible(true)}
              hitSlop={6}
              style={[styles.topBtn, styles.doneBtn]}>
              <ThemedText style={[styles.topBtnText, { color: '#fff' }]}>
                DONE
              </ThemedText>
            </Pressable>
          </View>
        }
      />

      <ThemedText style={styles.playHelper}>
        Play from one green arrow ▼ to the next. Tap{' '}
        <ThemedText style={{ fontWeight: '800' }}>NEXT →</ThemedText> on the metronome
        when ready to advance. Long-press the metronome to drag it, or pinch to resize.
      </ThemedText>

      <ScoreWithMarkers
        uri={piece.source_uri}
        markers={activeMarkers}
        mode="play"
        activePair={activePair}
      />

      <FloatingClickUpControls
        bpm={metronome.bpm}
        subdivision={metronome.subdivision}
        running={metronome.running}
        volume={metronome.volume}
        onSubdivision={metronome.setSubdivision}
        onVolume={metronome.setVolume}
        onToggle={metronome.toggle}
        onNext={onNext}
      />

      <PracticeLogNotePrompt
        visible={celebrating || notePromptVisible}
        emoji={celebrating ? '🎉' : undefined}
        title={
          celebrating
            ? `Completed all ${storedConfig.steps.length} steps!`
            : 'How did that go?'
        }
        subtitle={piece?.title ?? 'Interleaved Click-Up'}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note }) => {
          setNotePromptVisible(false);
          dismissCelebration();
          doneSession({ mood, note });
        }}
        onSkip={() => {
          setNotePromptVisible(false);
          dismissCelebration();
          doneSession();
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  configContainer: { flexGrow: 1, padding: 20, gap: 14, paddingBottom: Spacing['2xl'] },
  configHeader: {
    paddingTop: Spacing.md,
    paddingHorizontal: 10,
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  topBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.md },
  topBtnText: { fontWeight: Type.weight.heavy, fontSize: Type.size.sm },
  topCenter: { textAlign: 'center', fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  markingContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['2xl'] },
  helper: {
    textAlign: 'center',
    fontSize: 12,
    opacity: Opacity.muted,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  playHelper: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    opacity: Opacity.muted,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    lineHeight: 18,
  },
  doneBtn: { backgroundColor: Status.danger },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
  blurbText: { opacity: Opacity.muted, fontSize: Type.size.lg, lineHeight: 23 },
  blurbBold: { fontWeight: Type.weight.heavy, opacity: 1 },
  blurbItalic: { fontStyle: 'italic', opacity: 1 },
  linkBtn: {
    borderWidth: Borders.medium,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  linkText: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
});
