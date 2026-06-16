import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image as RNImage,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { BpmStepper } from '@/components/BpmStepper';
import { ClickUpCoach } from '@/components/ClickUpCoach';
import { PedalCatcher } from '@/components/PedalCatcher';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import {
  ScoreWithMarkers,
  markerTapRadius,
  nearestMarkerNormalized,
} from '@/components/ScoreWithMarkers';
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
import { TutorialStep } from '@/components/TutorialStep';
import { useScreenTour } from '@/components/tour/TourContext';
import { tourTag, type TourStep } from '@/components/tour/types';
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

// Guided tour for the Click-Up marking screen (web only — see
// useScreenTour / TourContext.web). Module-level so the reference stays
// stable across renders.
const CU_MARKING_STEPS: TourStep[] = [
  {
    target: 'cu-score',
    title: 'Mark your units',
    body:
      'Interleaved Click-Up — developed by researcher Molly Gebrian — breaks your passage into small units and practices them at shuffled tempos, and in changing contexts, which builds more reliable playing under pressure.\n\n' +
      'The passage needs to be broken down into small, manageable units. You can decide to go by the single beat (usually a beat plus the first note of the next beat), or by the measure. If a single beat contains too many notes (like six to eight) and is too difficult, you should break it down further into half or a quarter of a beat. As you get better over multiple days, this can expand to every two bars or an entire line.\n\n' +
      'Tap just above the music to mark where each unit begins (a beat or a measure), and add one extra mark at the very end. Pinch to zoom in for accuracy. Tap a mark again to remove it, or use UNDO / CLEAR up top.',
    image: {
      source: require('@/assets/images/tutorial-click-up-marking.png'),
      aspectRatio: 2727 / 549,
      caption: 'Example: a mark above the start of each unit (and one at the end).',
    },
  },
  {
    target: 'cu-next',
    title: 'Set your tempo',
    hideDot: true,
    body:
      `You need at least ${MIN_MARKERS} marks. Once they’re placed, NEXT → lights up — tap it to choose your start and performance tempos.`,
  },
];

// Guided tour for the Click-Up tempo screen (the 'config' phase, after
// NEXT → on the marking screen).
const CU_CONFIG_STEPS: TourStep[] = [
  {
    target: 'cu-tempo',
    title: 'Set your tempo range',
    body:
      '**Start Tempo** — it must be set to a tempo that is so slow that you couldn’t possibly make a mistake, which is often half the goal tempo or slower. If you make even a small mistake, the start tempo is too fast.\n\n' +
      '**Performance Tempo** — the speed you ultimately need. **Ideally, set this 5 to 10 percent faster than the actual performance tempo.** If your maximum speed is the performance tempo, it will always feel scary on stage; practicing it faster ensures the performance tempo feels comfortable.\n\n' +
      '**Increment** — the change in tempo should feel only slightly faster, not significantly faster (but you should feel the increase).\n\n' +
      'The app climbs through every tempo in between, interleaving single units with growing combinations.',
  },
  {
    target: 'cu-start',
    title: 'Start practicing',
    hideDot: true,
    body:
      'Tap Start practicing to begin. Play the unit shown, mark each rep, and the tempo climbs toward your performance tempo.',
  },
];

export default function ClickUpScreen() {
  const { id, guided } = useLocalSearchParams<{ id: string; guided?: string }>();
  const isGuided = guided === '1';
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isPhone = Math.min(winWidth, winHeight) < 600;
  const insets = useSafeAreaInsets();
  // Phone landscape is where vertical space is scarce — fold the instruction
  // into the header there. Portrait keeps the readable standalone row.
  const isPhoneLandscape = isPhone && winWidth > winHeight;
  const isTouch = useIsTouchDevice();
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);
  const session = useClickUpSession(id, isGuided);

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
    confirmPerformanceTempo,
    commitMarkersAndStart,
    goBackToTempo,
    proceedToMarking,
    goBackToExample,
    finishGuidedToLibrary,
  } = session;

  const ann = useScoreAnnotation(passage);

  // Guided onboarding: a one-time reassurance the first time they tap Next in
  // the playing phase — confirms the button did something (the tempo climbed)
  // so a first-timer isn't left wondering whether it worked.
  const [firstNextSeen, setFirstNextSeen] = useState(false);
  const [nextCoachVisible, setNextCoachVisible] = useState(false);
  function handleNext() {
    onNext();
    if (isGuided && !firstNextSeen) {
      setFirstNextSeen(true);
      setNextCoachVisible(true);
    }
  }

  // Web-only guided tour of the marking screen. No-op on native, where the
  // help modal still covers Click-Up.
  useScreenTour(
    phase === 'config' ? 'click-up-config' : 'click-up-marking',
    // Guided onboarding suppresses the tour entirely — the quiz teaches
    // marking inline with the example picture, so the coachmark popups
    // (which were reading as "the wrong passage") never fire.
    isGuided
      ? null
      : phase === 'marking'
        ? CU_MARKING_STEPS
        : phase === 'config'
          ? CU_CONFIG_STEPS
          : null,
  );

  // ── PERFORMANCE TEMPO (guided onboarding only) ──────────────────────────
  // The quiz drops a brand-new user straight here. One friendly question —
  // how fast it ultimately needs to be — with a hear-it preview; start tempo
  // auto-sets to half and there's no other setup to face.
  if (phase === 'tempo') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: Spacing.lg }}>
          <Pressable onPress={exitSession} hitSlop={8}>
            <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
              ‹ Back
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.configContainer,
            configColumnStyle,
            { paddingTop: Spacing.md },
          ]}>
          <ThemedText type="title">How fast does it need to be?</ThemedText>
          <ThemedText style={{ opacity: 0.7 }}>
            Set your performance tempo — the speed you’ll play it for real. Press
            ▶ to hear it. We’ll start you at half that and climb from there.
          </ThemedText>
          <BpmStepper
            value={goalTempo}
            onChange={setGoalTempo}
            metronome={metronome}
          />
        </ScrollView>
        <View style={{ padding: 20, gap: 10 }}>
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Button
              label="Next: mark the beats →"
              onPress={confirmPerformanceTempo}
              style={actionButtonStyle}
            />
          </View>
        </View>
      </ThemedView>
    );
  }

  // ── MARKING ────────────────────────────────────────────────────────────
  // ── HOW-TO / EXAMPLE (guided onboarding only) ───────────────────────────
  // A standalone teaching screen: a direction + the marked example image +
  // "Got it →". Keeping it separate from the marking screen means the user's
  // own score is the only thing on the marking screen (no layout fight).
  if (phase === 'example') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: Spacing.lg }}>
          <Pressable onPress={goBackToTempo} hitSlop={8}>
            <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
              ‹ Back
            </ThemedText>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.sm }}>
          <ThemedText type="title">Here’s how you’ll mark it</ThemedText>
          <ThemedText
            style={[styles.helper, { opacity: 1, textAlign: 'left', paddingHorizontal: 0, paddingVertical: 0 }]}>
            You’ll tap above the start of each beat, in order — plus one mark at
            the very end. Like this:
          </ThemedText>
          {isPhone && winWidth < winHeight && (
            <View style={[styles.rotateHint, { backgroundColor: C.tint + '18' }]}>
              <ThemedText style={{ fontSize: 16 }}>↻</ThemedText>
              <ThemedText style={{ flex: 1, fontSize: 13 }}>
                Turn your phone sideways for a bigger view.
              </ThemedText>
            </View>
          )}
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
          }}>
          <RNImage
            source={require('@/assets/images/tutorial-click-up-marking.png')}
            style={{ width: '100%', height: '100%', borderRadius: 8 }}
            resizeMode="contain"
          />
        </View>
        <View style={{ padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Button
              label="Got it →"
              onPress={proceedToMarking}
              style={actionButtonStyle}
            />
          </View>
        </View>
      </ThemedView>
    );
  }

  if (phase === 'marking') {
    if (!passage) return <ThemedView style={{ flex: 1 }} />;
    const canContinue = markers.length >= MIN_MARKERS;
    // Guided onboarding: a clean, quiz-style marking screen — no app top-bar,
    // no tour. Example picture up top, then the user's own score to tap. Hands
    // off to actual practice (playing) only when they tap Start practicing.
    if (isGuided) {
      return (
        <ThemedView style={{ flex: 1 }}>
          <Stack.Screen options={{ headerShown: false }} />
          <View
            style={{
              paddingTop: insets.top + 10,
              paddingHorizontal: Spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <Pressable onPress={goBackToExample} hitSlop={8}>
              <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
                ‹ Back
              </ThemedText>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: Spacing.lg }}>
              <Pressable onPress={undoMarker} disabled={markers.length === 0} hitSlop={6}>
                <ThemedText
                  style={{
                    color: C.tint,
                    fontWeight: Type.weight.bold,
                    opacity: markers.length === 0 ? 0.35 : 1,
                  }}>
                  Undo
                </ThemedText>
              </Pressable>
              <Pressable onPress={clearMarkers} disabled={markers.length === 0} hitSlop={6}>
                <ThemedText
                  style={{
                    color: '#c0392b',
                    fontWeight: Type.weight.bold,
                    opacity: markers.length === 0 ? 0.35 : 1,
                  }}>
                  Clear
                </ThemedText>
              </Pressable>
            </View>
          </View>
          {/* One compact instruction line — title + how-to — so the score
              below keeps every spare vertical pixel (the cramped
              portrait-browser case Ralph hit on a small phone). */}
          <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs }}>
            <ThemedText style={{ fontWeight: Type.weight.bold, fontSize: Type.size.lg }}>
              Now mark your passage
            </ThemedText>
            <ThemedText
              style={[styles.helper, { opacity: 1, textAlign: 'left', paddingHorizontal: 0, paddingVertical: 2 }]}>
              Tap above each beat in order, plus one at the very end. Pinch to
              zoom.{isPhone && winWidth < winHeight ? '  ↻ Turn sideways for more room.' : ''}
            </ThemedText>
          </View>
          {/* Score fills all remaining space, contained + pinch-zoomable, so a
              tall or multi-line crop is panned (not truncated) and there's no
              page scroll fighting the pan gesture. */}
          <View
            style={{
              flex: 1,
              marginTop: Spacing.xs,
              marginHorizontal: Spacing.lg,
              borderRadius: 8,
              overflow: 'hidden',
            }}>
            <ZoomableImage
              style={StyleSheet.absoluteFill}
              persistKey={passage.id}
              tapAspectRatio={imageAspect ?? undefined}
              onTapPoint={(point, scale) => {
                const hit = nearestMarkerNormalized(
                  markers,
                  point,
                  markerTapRadius(winWidth - 32, scale),
                );
                if (hit != null) removeMarker(hit);
                else placeMarker(point);
              }}>
              <ScoreWithMarkers
                uri={passage.source_uri}
                markers={markers}
                mode="place"
                captureTaps={false}
              />
            </ZoomableImage>
          </View>
          {/* Soft nudge: ICU's step count multiplies with markers, so a
              first-timer who marks the whole passage builds a session they'll
              never finish. Don't block — just suggest keeping it small. */}
          {markers.length >= 5 && (
            <View style={{ paddingHorizontal: 20, paddingTop: Spacing.sm }}>
              <ThemedText
                style={{
                  fontSize: Type.size.sm,
                  color: C.tint,
                  textAlign: 'center',
                  lineHeight: 18,
                }}>
                That’s plenty for a first try. Each extra mark makes the session
                longer — feel free to stop here, or mark just part of the passage
                to get a feel for it.
              </ThemedText>
            </View>
          )}
          <View style={{ paddingHorizontal: 20, paddingTop: Spacing.sm, paddingBottom: 20 }}>
            <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
              <Button
                label={
                  canContinue
                    ? 'Start practicing →'
                    : `Mark ${MIN_MARKERS - markers.length} more to start`
                }
                variant={canContinue ? 'primary' : 'outline'}
                onPress={() => {
                  if (canContinue) void commitMarkersAndStart();
                }}
                style={actionButtonStyle}
              />
            </View>
          </View>
        </ThemedView>
      );
    }
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
                onPress={
                  canContinue
                    ? isGuided
                      ? commitMarkersAndStart
                      : commitMarkersAndConfigure
                    : undefined
                }
                hitSlop={6}
                disabled={!canContinue}
                {...tourTag('cu-next')}
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
          {/* The full strategy explainer now lives behind the ? button
              (auto-opens for first-timers); no inline panel here. */}

          <ThemedText style={styles.helper}>
            Tap just above the music to mark the beginning of each unit. Pinch to
            zoom in for accuracy. You need at least {MIN_MARKERS} marks. Tap an
            existing mark to remove it.
          </ThemedText>
          {/* Pinch-zoomable marking surface. ZoomableImage owns the tap gesture
              and reports a normalized image point (inverting its zoom + the
              contain letterbox); ScoreWithMarkers just renders the numbered
              marks (captureTaps=false so it doesn't fight the gesture). The
              per-passage zoom persists and carries into the playing phase. */}
          <View
            {...tourTag('cu-score')}
            style={{
              height: imageAspect ? (winWidth - 32) / imageAspect : 500,
              borderRadius: 8,
            }}>
            <ZoomableImage
              style={StyleSheet.absoluteFill}
              persistKey={passage.id}
              tapAspectRatio={imageAspect ?? undefined}
              onTapPoint={(point, scale) => {
                const hit = nearestMarkerNormalized(
                  markers,
                  point,
                  markerTapRadius(winWidth - 32, scale),
                );
                if (hit != null) removeMarker(hit);
                else placeMarker(point);
              }}>
              <ScoreWithMarkers
                uri={passage.source_uri}
                markers={markers}
                mode="place"
                captureTaps={false}
              />
            </ZoomableImage>
          </View>
        </ScrollView>

        {/* Step 4 of the guided first-session flow. Fires on the
            Interleaved Click-Up marking screen while the user has
            never completed a practice session. The example image
            shows numbered markers above a scale — most novel UX
            in the app and the hardest to grok from copy alone. */}
        {/* Native (iPad) keeps the one-shot modal; web uses the guided
            tour above instead, so suppress the modal's auto-fire there. */}
        <TutorialStep
          id="click-up-marking"
          visible={Platform.OS !== 'web'}
          title="Mark your units"
          body={
            "Interleaved Click-Up is a structured practice method developed by Molly Gebrian — a viola professor and researcher in the neuroscience of practice (her book: Learn Faster, Perform Better). Instead of repeating a passage start-to-finish, you break it into small units; the app interleaves them at climbing tempos, forcing your brain to keep retrieving and reconnecting sections. That builds deeper, more reliable playing under pressure.\n\n" +
            "Mark your units: tap just above the music to mark the start of each unit (a beat, a measure — the smallest chunk you want to practice). Pinch to zoom in for accuracy. Drop one extra mark at the end of the last unit so the app knows where it stops. You need at least " +
            String(MIN_MARKERS) +
            " marks total.\n\n" +
            "Fixing marks: tap a marker again to remove it, tap UNDO for just the last one, or CLEAR to start over. When you're done, tap NEXT → at the top right to set your tempo range.\n\n" +
            "During practice: tap NEXT → (or Space / Enter / right foot pedal) after each rep; tap ← BACK (or the left arrow / Backspace / left pedal) to revisit the previous step — the metronome and active units rewind with you. The session logs automatically at the last step; tap DONE to log it earlier.\n\n" +
            "Learn more at mollygebrian.com."
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
        <ScrollView
          contentContainerStyle={[
            styles.configContainer,
            configColumnStyle,
            // This phase has no SessionTopBar, so cushion the content below the
            // device status bar (clock / wifi) — without insets.top the first
            // line ("N units defined…") tucks under the notch on phone.
            { paddingTop: insets.top + 10 },
          ]}>
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
          <View {...tourTag('cu-tempo')}>
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
          </View>
          {/* The inline tempo explainer used to live here. It's now owned
              by the guided tour (web) + the ? help modal (native), so it
              was removed to avoid a second, diverging copy. */}
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
          <View
            style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}
            {...tourTag('cu-start')}>
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
          </View>
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
      {/* Guided onboarding: replace the full session chrome with a light,
          quiz-consistent banner. The metronome auto-runs, so the user just
          plays along and taps NEXT — no top bar, tool tabs, or coach modal. */}
      {isGuided && (
        <View
          style={[
            styles.guidedBar,
            { paddingTop: insets.top + 10, borderBottomColor: C.icon + '33' },
          ]}>
          <View style={{ flex: 1, gap: 1 }}>
            <ThemedText
              style={{
                fontSize: Type.size.xs,
                fontWeight: Type.weight.bold,
                color: C.tint,
                opacity: 0.9,
              }}>
              Step {currentIndex + 1} of {storedConfig.steps.length}
            </ThemedText>
            <ThemedText
              style={{
                fontSize: Type.size.sm,
                fontWeight: Type.weight.semibold,
                lineHeight: 18,
              }}
              numberOfLines={2}>
              Play from one green arrow ▼ to the next.
            </ThemedText>
          </View>
          <Pressable onPress={() => setNotePromptVisible(true)} hitSlop={8}>
            <ThemedText style={[styles.guidedBarDone, { color: C.tint }]}>
              Done
            </ThemedText>
          </Pressable>
        </View>
      )}
      {!isGuided && (
        <>
          <SessionTopBar
        onExit={exitSession}
        // "EXIT" on every size — matches the other practice screens; a bare
        // back-arrow here read as "undo", not "leave the session".
        exitLabel="EXIT"
        center={
          // Phone (esp. landscape): fold the instruction onto the SAME header
          // line as a compact step fraction, so it doesn't eat a whole row of
          // scarce vertical space above the music and the header stays one line.
          // Larger screens keep the full unit label + the standalone line below.
          isPhoneLandscape ? (
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              {currentIndex + 1}/{storedConfig.steps.length}
              <ThemedText style={styles.topCenterHint}>
                {'   ·   Play from one green arrow ▼ to the next.'}
              </ThemedText>
            </ThemedText>
          ) : (
            <ThemedText style={styles.topCenter} numberOfLines={1}>
              {unitLabel} · {currentIndex + 1}/{storedConfig.steps.length}
            </ThemedText>
          )
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

      {/* Phone LANDSCAPE folds this into the header line above (scarce vertical
          space); portrait + larger screens keep the standalone reminder. */}
          {!isPhoneLandscape && (
            <ThemedText style={styles.playHelper}>
              Play from one green arrow ▼ to the next.
            </ThemedText>
          )}
        </>
      )}

      {/* Keyboard / pedal capture is always live during the playing phase
          (gated only by note prompts + celebration overlays). Laptop
          users get Space/Enter, iPad users get the on-screen NEXT, and a
          BT foot pedal works on any platform without a toggle. */}
      {isGuided && nextCoachVisible && (
        <Pressable
          onPress={() => setNextCoachVisible(false)}
          style={{
            position: 'absolute',
            top: insets.top + 56,
            left: 12,
            right: 12,
            zIndex: 50,
            backgroundColor: C.tint,
            borderRadius: Radii.lg,
            padding: 14,
          }}>
          <ThemedText style={{ color: '#fff', fontWeight: Type.weight.bold, fontSize: 15 }}>
            Yes — that worked! The metronome just clicked up {increment} BPM, and
            it’ll do that again each time you tap Next.
          </ThemedText>
          <ThemedText style={{ color: '#fff', opacity: 0.85, fontSize: 12, marginTop: 6 }}>
            Tap to dismiss
          </ThemedText>
        </Pressable>
      )}
      <PedalCatcher
        active={!notePromptVisible && !celebrating}
        onAdvance={handleNext}
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
        {isGuided ? (
          // Guided: just a collapsed metronome tab (no note → starts closed),
          // so a first-timer can tap it open to watch the tempo climb. No
          // pencil/timer/recorder chrome.
          <PracticeToolsLayer
            metronome={metronome}
            tools={
              isPhone
                ? { left: [], right: ['metronome'] }
                : { left: ['metronome'], right: [] }
            }
          />
        ) : (
          <PracticeToolsLayer
            metronome={metronome}
            metronomeNote="Interleaved Click-Up sets the tempo for each step — just tap Next after each repetition."
            pencil={ann.pencil}
            recorderPassageId={passage?.id}
          />
        )}
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
          <Pressable onPress={handleNext} style={[styles.nextBtn, styles.nextBtnGrow]}>
            <ThemedText style={styles.nextBtnText}>NEXT →</ThemedText>
          </Pressable>
        </View>
      </View>

      {isGuided && (celebrating || notePromptVisible) && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 100,
          }}>
          <ThemedView
            style={{
              borderRadius: Radii.xl,
              padding: 24,
              width: '100%',
              maxWidth: 360,
              alignItems: 'center',
              gap: 10,
            }}>
            <ThemedText style={{ fontSize: 40 }}>🎉</ThemedText>
            <ThemedText style={{ fontSize: 20, fontWeight: Type.weight.bold, textAlign: 'center' }}>
              Your first guided session is done!
            </ThemedText>
            <ThemedText style={{ textAlign: 'center', opacity: 0.8 }}>
              Nice work — it’s saved to your practice log.
            </ThemedText>
            <View style={{ width: '100%', marginTop: 8 }}>
              <Button
                label="See my library →"
                onPress={() => {
                  void finishGuidedToLibrary();
                }}
                style={actionButtonStyle}
              />
            </View>
          </ThemedView>
        </View>
      )}

      <PracticeLogNotePrompt
        visible={!isGuided && (celebrating || notePromptVisible)}
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

      {!isGuided && <ClickUpCoach />}

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
  // Lighter, non-bold instruction appended to the step fraction in the phone
  // header so it reads as a hint next to the counter.
  topCenterHint: { fontWeight: '400', opacity: Opacity.muted },
  markingContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['2xl'] },
  helper: {
    textAlign: 'center',
    fontSize: 12,
    opacity: Opacity.muted,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  rotateHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
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
  // Guided-onboarding playing header: a light, quiz-consistent bar that
  // replaces the full SessionTopBar so the first session never drops into
  // app chrome. Just the instruction + a Done escape hatch.
  guidedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  guidedBarText: {
    flex: 1,
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    lineHeight: 18,
  },
  guidedBarDone: { fontSize: Type.size.md, fontWeight: Type.weight.bold },
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
