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

import { ActionSheet } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { ClickUpCoach } from '@/components/ClickUpCoach';
import { CollapsibleHelp } from '@/components/CollapsibleHelp';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { ScoreWithMarkers } from '@/components/ScoreWithMarkers';
import { ZoomableImage } from '@/components/ZoomableImage';
import { SessionTopBar } from '@/components/SessionTopBar';
import { TempoConfigFields } from '@/components/TempoConfigFields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice';
import { useScoreAnnotation } from '@/hooks/useScoreAnnotation';
import { MIN_MARKERS, useClickUpSession } from '@/hooks/useClickUpSession';
import { countPracticeLogEntries } from '@/lib/db/repos/practiceLog';
import { TutorialStep } from '@/components/TutorialStep';
import { activePairMarkers } from '@/lib/strategies/clickUp';
import {
  actionButtonStyle,
  configColumnStyle,
  HELP_CLEARANCE,
  SCORE_SIDE_BUFFER,
  SCORE_VERT_BUFFER,
  SCORE_FRAME_BG,
} from '@/lib/layout/configForm';

function formatActiveUnits(activeUnits: number[]): string {
  if (activeUnits.length === 0) return '';
  if (activeUnits.length === 1) return `UNIT ${activeUnits[0]}`;
  return `UNITS ${activeUnits[0]}–${activeUnits[activeUnits.length - 1]}`;
}

export default function ClickUpScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isPhone = Math.min(winWidth, winHeight) < 600;
  const isTouch = useIsTouchDevice();
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);
  // Practice-log count for the first-time tutorial gate. Hoisted above
  // the phase-based early returns so the hook count stays stable.
  // null = still loading; 0 = first-timer.
  const [practiceLogCount, setPracticeLogCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    countPracticeLogEntries()
      .then((n) => {
        if (!cancelled) setPracticeLogCount(n);
      })
      .catch(() => {
        // count failing just suppresses the tutorial — not fatal
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const session = useClickUpSession(id);

  useEffect(() => {
    if (session.passage?.source_uri) {
      RNImage.getSize(
        session.passage.source_uri,
        (w, h) => {
          if (h > 0) setImageAspect(w / h);
        },
        () => setImageAspect(1.4),
      );
    }
  }, [session.passage?.source_uri]);

  const {
    phase,
    passage,
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
    goBackToConfig,
    resumePlaying,
  } = session;

  const ann = useScoreAnnotation(passage);

  // ── MARKING ────────────────────────────────────────────────────────────
  if (phase === 'marking') {
    if (!passage) return <ThemedView style={{ flex: 1 }} />;
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
          <CollapsibleHelp title="How it works">
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
            <ThemedText style={styles.blurbText}>
              During practice, tap{' '}
              <ThemedText style={styles.blurbBold}>NEXT →</ThemedText> (or press Space,
              Enter, or the right foot pedal) after each rep. To redo the previous step
              — say, you advanced too quickly and want to revisit that tempo — tap{' '}
              <ThemedText style={styles.blurbBold}>← BACK</ThemedText> (or press the
              left arrow, Backspace, or the left foot pedal). The metronome and the
              active units rewind with you.
            </ThemedText>
            <ThemedText style={styles.blurbText}>
              The session logs automatically when you reach the last step. To log
              earlier, tap <ThemedText style={styles.blurbBold}>DONE</ThemedText> at the
              top right.
            </ThemedText>
            <Pressable
              onPress={() => Linking.openURL('https://www.mollygebrian.com')}
              style={[styles.linkBtn, { borderColor: C.tint }]}>
              <ThemedText style={[styles.linkText, { color: C.tint }]}>
                Visit mollygebrian.com
              </ThemedText>
            </Pressable>
          </CollapsibleHelp>

          <View style={[styles.divider, { backgroundColor: C.icon + '33' }]} />

          <ThemedText style={styles.helper}>
            Tap just above the music to mark the beginning of each unit. You need at
            least {MIN_MARKERS} marks. Tap an existing mark to remove it.
          </ThemedText>
          {/* No overflow:hidden here — a tightly-cropped passage with a marker
              near the top edge would otherwise clip the marker. Play-mode
              triangles don't have a clipping wrapper, so we drop it here too
              to keep the two phases visually consistent. */}
          <View
            style={{
              height: imageAspect ? (winWidth - 32) / imageAspect : 500,
              borderRadius: 8,
            }}>
            <ScoreWithMarkers
              uri={passage.source_uri}
              markers={markers}
              mode="place"
              onTap={placeMarker}
              onRemoveMarker={removeMarker}
            />
          </View>
        </ScrollView>

        {/* Step 4 of the guided first-session flow. Fires on the
            Interleaved Click-Up marking screen while the user has
            never completed a practice session. The example image
            shows numbered markers above a scale — most novel UX
            in the app and the hardest to grok from copy alone. */}
        <TutorialStep
          id="click-up-marking"
          visible={practiceLogCount === 0}
          title="Mark your units"
          body={
            "Tap just above the music to mark the start of each unit (a beat, a measure — whatever feels like the smallest chunk you want to drill). Drop one extra mark at the end of the last unit so the app knows where it stops. You need at least " +
            String(MIN_MARKERS) +
            " marks total.\n\n" +
            "To fix a mistake: tap a marker again to remove it, tap UNDO to remove just the last one, or tap CLEAR to wipe them all and start over.\n\n" +
            "When you've placed your marks, tap NEXT → at the top right to set your tempo range."
          }
          image={{
            source: require('@/assets/images/tutorial-click-up-marking.png'),
            aspectRatio: 2727 / 549,
            caption: 'Example: 8 markers above a C-major scale.',
          }}
        />
      </ThemedView>
    );
  }

  // ── CONFIG ─────────────────────────────────────────────────────────────
  if (phase === 'config') {
    const derivedN = Math.max(0, markers.length - 1);
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView contentContainerStyle={[styles.configContainer, configColumnStyle, { paddingTop: 10 }]}>
          {/* Phone: drop the H1 (the user already sees "Set the tempo range"
              context from getting here via Start Practicing) and the long
              explanatory paragraph below — both eat half the screen on
              iPhone. Keep the unit count, which is actionable info. */}
          {!isPhone && (
            <ThemedText type="title">Set the tempo range</ThemedText>
          )}
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
          {!isPhone && (
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
          )}
        </ScrollView>

        <View style={{ padding: 20, gap: 10 }}>
          {/* "Resume" appears only when the user has mid-session progress
              (they tapped ← Setup partway through a practice run). Tapping
              it drops them back into the same step at the same tempo
              without regenerating the step sequence — useful if they
              opened Setup just to glance at their config and didn't
              actually want to restart. "Start practicing" stays available
              for when they DID want to reset (e.g., after adjusting
              tempos). */}
          {storedConfig && currentIndex > 0 && (
            <Button
              label={`Resume — Step ${currentIndex + 1} of ${storedConfig.steps.length}`}
              onPress={resumePlaying}
              style={actionButtonStyle}
            />
          )}
          <Button
            label={
              storedConfig && currentIndex > 0
                ? 'Start over from Step 1'
                : 'Start practicing'
            }
            variant={storedConfig && currentIndex > 0 ? 'outline' : 'primary'}
            onPress={startPlaying}
            style={actionButtonStyle}
          />
          <Button
            label="← Back to marking"
            variant="ghost"
            onPress={goBackToMarking}
            style={actionButtonStyle}
          />
        </View>

        <TutorialStep
          id="click-up-config"
          visible={false}
          title="Set the tempo range"
          body={
            "Start Tempo — well below your target. A good rule of thumb is half your performance tempo.\n\n" +
            "Performance Tempo — the speed you ultimately need to perform at.\n\n" +
            "Increment — how big each tempo bump is between stages.\n\n" +
            "When you start, the app walks you through every tempo in between, interleaving individual units with growing combinations.\n\n" +
            "Buttons: Resume picks up a prior session where you left off, at the same step and tempo. Start over (or Start practicing the first time) begins fresh from Step 1. ← Back to marking returns to editing your unit marks."
          }
        />
      </ThemedView>
    );
  }

  // ── PLAYING ────────────────────────────────────────────────────────────
  if (!storedConfig || !passage) return <ThemedView style={{ flex: 1 }} />;
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
        exitLabel={isPhone ? '←' : 'EXIT'}
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            {unitLabel} · {currentIndex + 1}/{storedConfig.steps.length}
          </ThemedText>
        }
        right={
          isPhone ? (
            // Phone: DONE stays as the primary save action; PEDAL toggle
            // and Setup move into a ⋯ menu so the header fits in one
            // row alongside the title.
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable
                onPress={() => setNotePromptVisible(true)}
                hitSlop={6}
                style={[styles.topBtn, styles.doneBtn]}>
                <ThemedText style={[styles.topBtnText, { color: '#fff' }]}>
                  DONE
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setPhoneMenuOpen(true)}
                hitSlop={6}
                accessibilityLabel="More actions"
                style={styles.topBtn}>
                <ThemedText style={[styles.topBtnText, { color: C.tint }]}>
                  ⋯
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable
                onPress={goBackToConfig}
                hitSlop={6}
                accessibilityLabel="Back to tempo setup"
                style={styles.topBtn}>
                <ThemedText style={[styles.topBtnText, { color: C.tint }]}>
                  ← Setup
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
          )
        }
      />

      <ThemedText style={styles.playHelper}>
        Play from one green arrow ▼ to the next.
      </ThemedText>

      {/* Keyboard / pedal capture is always live during the playing phase
          (gated only by note prompts + celebration overlays). Laptop
          users get Space/Enter, iPad users get the on-screen NEXT, and a
          BT foot pedal works on any platform without a toggle. */}
      <PedalCatcher
        active={!notePromptVisible && !celebrating}
        onAdvance={onNext}
        onBack={onPrev}
      />

      <View
        style={[
          styles.contentArea,
          // Laptop: pad the score frame so the music (and its pencil
          // overlay) is inset from the screen edges — clearing the
          // edge-docked tool tabs on the sides and giving top/bottom
          // breathing room. The score lives in an inner flex child
          // (scoreInner) because an absolutely-filled score ignores this
          // padding on web; PracticeToolsLayer stays a sibling so its tabs
          // sit at the true screen edge. Phone keeps its full-bleed zoom.
          !isPhone && {
            paddingHorizontal: SCORE_SIDE_BUFFER,
            paddingVertical: SCORE_VERT_BUFFER,
            backgroundColor: SCORE_FRAME_BG,
          },
        ]}>
        <View style={{ flex: 1, width: '100%', position: 'relative' }}>
          {isTouch ? (
            // Phone: wrap the score in a pinch+pan container so notes
            // are readable on a small screen. ScoreWithMarkers's ▼
            // arrow markers live inside the same transform, so they
            // zoom and pan in lockstep with the underlying image and
            // stay pinned to their correct positions on the staff.
            <ZoomableImage
              style={StyleSheet.absoluteFill}
              persistKey={passage.id}>
              <ScoreWithMarkers
                uri={passage.source_uri}
                markers={activeMarkers}
                mode="play"
                activePair={activePair}
              />
            </ZoomableImage>
          ) : (
            <ScoreWithMarkers
              uri={passage.source_uri}
              markers={activeMarkers}
              mode="play"
              activePair={activePair}
            />
          )}
          {ann.canvas}
        </View>
        <PracticeToolsLayer
          metronome={metronome}
          metronomeNote="Interleaved Click-Up sets the tempo for each step — just tap Next after each repetition."
          pencil={ann.pencil}
          recorderPassageId={passage?.id}
        />
      </View>

      <View style={styles.bottomBar}>
        {/* Phone hides the input-method hint — phones have no keyboard
            and no foot pedal in practice, so the line just eats two
            rows of vertical space we'd rather give back to the score.
            Laptop / desktop sees a single tidy line listing every way
            to move between steps. */}
        {!isPhone && (
          <ThemedText style={styles.pedalNote}>
            Space / Enter / right pedal = NEXT · ← / Backspace / left pedal = BACK
          </ThemedText>
        )}
        <View style={styles.navRow}>
          <Pressable
            onPress={currentIndex === 0 ? undefined : onPrev}
            disabled={currentIndex === 0}
            style={[styles.backBtn, { opacity: currentIndex === 0 ? 0.4 : 1 }]}>
            <ThemedText style={styles.backBtnText}>← BACK</ThemedText>
          </Pressable>
          <Pressable onPress={onNext} style={[styles.nextBtn, styles.nextBtnGrow]}>
            <ThemedText style={styles.nextBtnText}>NEXT →</ThemedText>
          </Pressable>
        </View>
      </View>

      <PracticeLogNotePrompt
        visible={celebrating || notePromptVisible}
        emoji={celebrating ? '🎉' : undefined}
        title={
          celebrating
            ? `Completed all ${storedConfig.steps.length} steps!`
            : 'How did that go?'
        }
        subtitle={passage?.title ?? 'Interleaved Click-Up'}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note, remindNext }) => {
          setNotePromptVisible(false);
          dismissCelebration();
          doneSession({ mood, note, remindNext });
        }}
        onSkip={() => {
          setNotePromptVisible(false);
          dismissCelebration();
          doneSession();
        }}
      />

      <ActionSheet
        visible={phoneMenuOpen}
        items={[
          // Pedal toggle removed — PedalCatcher is always live now, so
          // any BT foot pedal that emits arrow / Space / Enter / PageDn
          // keys works without a mode switch.
          {
            label: '← Back to tempo setup',
            onPress: () => {
              setPhoneMenuOpen(false);
              goBackToConfig();
            },
          },
        ]}
        onCancel={() => setPhoneMenuOpen(false)}
      />

      <ClickUpCoach />

      <TutorialStep
        id="click-up-play"
        visible={false}
        title="Running an Interleaved Click-Up"
        body={
          "The score highlights the unit (or pair of units) you're playing right now. Play it at the current tempo, then tap NEXT → to advance.\n\n" +
          "The sequence interleaves individual units with progressively larger combinations — single units first, then pairs, then triples — climbing through your tempo range. Don't try to remember where you are; the app drives the order.\n\n" +
          "← BACK steps you back one stage (handy if you advanced too soon and want to retake that tempo); the metronome and active units rewind with you.\n\n" +
          "Keyboard / pedal: Space / Enter / right pedal = NEXT, ← / Backspace / left pedal = BACK. The session logs itself when you reach the last step — tap DONE at the top right to log it early, or EXIT to leave without logging." +
          `\n\n${PRACTICE_TOOLS_HELP}`
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // paddingBottom lifts the last CTA above the global help button's corner
  // when the form is scrolled all the way down.
  configContainer: { flexGrow: 1, padding: 20, gap: 14, paddingBottom: HELP_CLEARANCE + 20 },
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
  // Symmetric side padding (= the help-button corner reserve) keeps the
  // centred NEXT/BACK row clear of the bottom-right "?" button on a narrow
  // viewport while staying centred on the window.
  bottomBar: {
    paddingHorizontal: HELP_CLEARANCE,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  pedalNote: {
    textAlign: 'center',
    fontSize: 12,
    opacity: Opacity.muted,
  },
  nextBtn: {
    backgroundColor: '#2ecc71',
    paddingVertical: 16,
    borderRadius: Radii.md,
    alignItems: 'center',
  },
  nextBtnGrow: { flex: 1 },
  nextBtnText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.lg,
  },
  navRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  backBtn: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Borders.medium,
    borderColor: '#bbb',
    backgroundColor: 'transparent',
  },
  backBtnText: {
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.lg,
  },
  contentArea: { flex: 1 },
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
