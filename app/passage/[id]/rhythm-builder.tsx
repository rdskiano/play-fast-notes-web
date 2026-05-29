import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { Button } from '@/components/Button';
import { DropdownField } from '@/components/DropdownField';
import { GroupingPicker } from '@/components/GroupingPicker';
import { NoteCardEditor } from '@/components/NoteCardEditor';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { PitchStaff } from '@/components/PitchStaff';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { TutorialStep } from '@/components/TutorialStep';
import { ZoomableImage } from '@/components/ZoomableImage';
import { ThemedView } from '@/components/themed-view';
import { PRACTICE_TOOLS_HELP } from '@/constants/helpCopy';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMetronome } from '@/lib/audio/useMetronome';
import {
  getExerciseById,
  updateExerciseConfig,
  type Exercise,
} from '@/lib/db/repos/exercises';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { getSetting, setSetting } from '@/lib/db/repos/settings';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import {
  CLEFS,
  INSTRUMENTS,
  KEY_SIGNATURES,
  midiToFrequency,
  spellForKey,
  writtenToConcert,
  type Clef,
  type Instrument,
  type KeySignature,
  type Pitch,
} from '@/lib/music/pitch';
import { buildExerciseHtml } from '@/lib/export/buildExerciseHtml';
import { buildExerciseAbc } from '@/lib/notation/buildExerciseAbc';
import {
  parseBeatDenominator,
  patternsByGrouping,
  type Grouping,
  type RhythmPattern,
  type RhythmToken,
} from '@/lib/strategies/rhythmPatterns';

type Phase = 'setup' | 'entry' | 'generate';

const LAST_INSTRUMENT_KEY = 'rhythm.lastInstrumentId';

type StoredConfig = {
  instrumentId?: string;
  keyId?: string;
  clefId?: string;
  grouping?: number;
  pitches?: Pitch[];
  useSharps?: boolean;
};

function parseConfig(json: string | null | undefined): StoredConfig {
  if (!json) return {};
  try {
    return JSON.parse(json) as StoredConfig;
  } catch {
    return {};
  }
}

export default function RhythmBuilderScreen() {
  const params = useLocalSearchParams<{ id: string; exerciseId?: string }>();
  const id = params.id;
  const exerciseIdParam = Array.isArray(params.exerciseId)
    ? params.exerciseId[0]
    : params.exerciseId;
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width: winWidth } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>('setup');
  const [passage, setPassage] = useState<Passage | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [instrument, setInstrument] = useState<Instrument>(INSTRUMENTS[0]);
  const [keySignature, setKeySignature] = useState<KeySignature>(
    KEY_SIGNATURES.find((k) => k.id === 'C') ?? KEY_SIGNATURES[7],
  );
  const [clef, setClef] = useState<Clef>(CLEFS[0]);
  const [grouping, setGrouping] = useState<Grouping>(4);
  const [useSharps, setUseSharps] = useState(true);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);
  // PDF export title prompt. The site's organization (folder / passage title)
  // gave the exercise its in-app name; for a printable/shareable PDF the user
  // often wants something more descriptive (e.g. "Daily warm-up — C major").
  const [pdfTitleModalOpen, setPdfTitleModalOpen] = useState(false);
  const [pdfTitleDraft, setPdfTitleDraft] = useState('');
  const pdfTitleInputRef = useRef<TextInput>(null);
  // `autoFocus` alone doesn't reliably raise the keyboard on iPad Safari
  // once the modal's fade has run; nudge focus on the next frame so the
  // keyboard comes up on open without a second tap.
  useEffect(() => {
    if (!pdfTitleModalOpen) return;
    const t = setTimeout(() => pdfTitleInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [pdfTitleModalOpen]);

  const metronome = useMetronome(80);
  const historyRef = useRef<Pitch[][]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  // Load passage + exercise.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPassage(id).then((p) => {
      if (!cancelled) setPassage(p);
    });
    async function applyLastInstrumentFallback() {
      const lastId = await getSetting(LAST_INSTRUMENT_KEY).catch(() => null);
      if (cancelled || !lastId) return;
      const next = INSTRUMENTS.find((i) => i.id === lastId);
      if (next) setInstrument(next);
    }
    if (exerciseIdParam) {
      getExerciseById(exerciseIdParam).then(async (ex) => {
        if (cancelled) return;
        setExercise(ex);
        const cfg = parseConfig(ex?.config_json);
        if (cfg.instrumentId) {
          const next = INSTRUMENTS.find((i) => i.id === cfg.instrumentId);
          if (next) setInstrument(next);
        } else {
          await applyLastInstrumentFallback();
        }
        if (cancelled) return;
        if (cfg.keyId) {
          const next = KEY_SIGNATURES.find((k) => k.id === cfg.keyId);
          if (next) {
            setKeySignature(next);
            setUseSharps(next.accidentals >= 0);
          }
        }
        if (cfg.clefId) {
          const next = CLEFS.find((c) => c.id === cfg.clefId);
          if (next) setClef(next);
        }
        if (cfg.grouping && cfg.grouping >= 3 && cfg.grouping <= 8) {
          setGrouping(cfg.grouping as Grouping);
        }
        if (Array.isArray(cfg.pitches)) {
          setPitches(cfg.pitches);
          // If the exercise already has notes entered, jump straight to the
          // exercises (practice) phase instead of starting back at Setup.
          if (cfg.pitches.length > 0) setPhase('generate');
        }
        setHydrated(true);
      });
    } else {
      applyLastInstrumentFallback().finally(() => {
        if (!cancelled) setHydrated(true);
      });
    }
    return () => {
      cancelled = true;
      metronome.stop();
      metronome.stopPitchSequence();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, exerciseIdParam]);

  // Remember the most recently chosen instrument across rhythm exercises so
  // a fresh exercise starts on the user's last instrument instead of the
  // alphabetical default.
  useEffect(() => {
    if (!hydrated) return;
    setSetting(LAST_INSTRUMENT_KEY, instrument.id).catch(() => undefined);
  }, [hydrated, instrument]);

  // Debounced save of all entry-phase state into exercises.config_json.
  //
  // The pending payload is mirrored into a ref so the unmount-cleanup
  // effect (below) can flush it even when the debounce timer hasn't fired
  // yet. Without that flush, navigating away within 400 ms of the user's
  // last edit silently drops the change.
  const pendingSaveRef = useRef<{ exerciseId: string; json: string } | null>(
    null,
  );
  useEffect(() => {
    if (!exercise || !hydrated) return;
    const merged: StoredConfig = {
      instrumentId: instrument.id,
      keyId: keySignature.id,
      clefId: clef.id,
      grouping,
      pitches,
      useSharps,
    };
    const json = JSON.stringify(merged);
    pendingSaveRef.current = { exerciseId: exercise.id, json };
    const handle = setTimeout(() => {
      setExercise((prev) => (prev ? { ...prev, config_json: json } : prev));
      updateExerciseConfig(exercise.id, json)
        .then(() => {
          // Only clear the pending marker if this exact payload is still
          // the latest — otherwise a newer edit is in flight and the
          // unmount-flush effect should still pick it up.
          if (pendingSaveRef.current?.json === json) {
            pendingSaveRef.current = null;
          }
        })
        .catch((err) => {
          // Don't drop the pending marker on error; an unmount-flush retry
          // is better than a silent loss.
          console.warn('[rhythm-builder] config save failed', err);
        });
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    instrument,
    keySignature,
    clef,
    grouping,
    pitches,
    useSharps,
  ]);

  // Unmount: if a debounced save is still pending, fire it now so the
  // user's last edits aren't lost when they navigate away quickly. The
  // promise is intentionally not awaited — the component is gone, but
  // the network request continues to completion in the background.
  useEffect(() => {
    return () => {
      const pending = pendingSaveRef.current;
      if (!pending) return;
      pendingSaveRef.current = null;
      updateExerciseConfig(pending.exerciseId, pending.json).catch((err) => {
        console.warn('[rhythm-builder] unmount flush failed', err);
      });
    };
  }, []);

  function exitSession() {
    metronome.stop();
    metronome.stopPitchSequence();
    router.back();
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
      try {
        await stampLastUsed(id, 'rhythmic');
        const data: Record<string, unknown> = {};
        if (mood) data.mood = mood;
        if (note) data.note = note;
        if (remindNext) data.remindNext = true;
        await logPractice(
          id,
          'rhythmic',
          Object.keys(data).length > 0 ? data : undefined,
          exerciseIdParam ?? null,
        );
      } catch {
        // ignore — keep navigation flowing
      }
    }
    metronome.stop();
    metronome.stopPitchSequence();
    router.back();
  }

  function pushHistory(snapshot: Pitch[]) {
    historyRef.current.push(snapshot);
    if (historyRef.current.length > 50) historyRef.current.shift();
    setHistoryVersion((v) => v + 1);
  }

  function undo() {
    const prev = historyRef.current.pop();
    if (prev === undefined) return;
    setPitches(prev);
    setInsertIndex(null);
    setEditingIndex(null);
    setHistoryVersion((v) => v + 1);
  }

  function clearAll() {
    if (pitches.length === 0) return;
    pushHistory(pitches);
    setPitches([]);
    setInsertIndex(null);
    setEditingIndex(null);
  }

  function addPitches(newPitches: Pitch[]) {
    if (newPitches.length === 0) return;
    pushHistory(pitches);
    setPitches((prev) => {
      if (insertIndex === null) return [...prev, ...newPitches];
      const next = [...prev];
      next.splice(insertIndex, 0, ...newPitches);
      return next;
    });
    if (insertIndex !== null) {
      setInsertIndex(insertIndex + newPitches.length);
    }
  }

  function onKeyPress(writtenMidi: number) {
    const concert = writtenToConcert(writtenMidi, instrument);
    metronome.playPitch(midiToFrequency(concert));
    addPitches([spellForKey(writtenMidi, keySignature, useSharps)]);
  }

  function toggleSharpsFlats() {
    setUseSharps((v) => !v);
  }

  function onEditorChange(updated: Pitch) {
    if (editingIndex === null) return;
    pushHistory(pitches);
    setPitches((prev) => {
      const next = [...prev];
      next[editingIndex] = updated;
      return next;
    });
  }

  function onEditorDelete() {
    if (editingIndex === null) return;
    pushHistory(pitches);
    setPitches((prev) => prev.filter((_, i) => i !== editingIndex));
    setEditingIndex(null);
  }

  function playSequence() {
    if (pitches.length === 0) return;
    const freqs = pitches.map((p) =>
      midiToFrequency(writtenToConcert(p.midi, instrument)),
    );
    const secondsPerNote = 60 / metronome.bpm / 2;
    metronome.playPitchSequence(freqs, secondsPerNote);
  }

  async function onContinue() {
    setPhase('entry');
  }

  // ── PDF export ──────────────────────────────────────────────────────────
  // Mirrors iPad's expo-print pipeline: builds a fresh print-friendly HTML
  // document, opens it in a new window, lets abcjs render at the page's
  // print staffwidth (so wrapping is correct), then triggers window.print()
  // in the popup. Browser print dialog has "Save as PDF" as a destination.
  // Entry point: prompt the user for a PDF title before opening the print
  // popup. The in-app exercise name is just a default — for a shareable PDF
  // the user may want something more descriptive.
  function openPdfTitlePrompt() {
    if (!passage) return;
    if (Platform.OS !== 'web') {
      Alert.alert(
        'Not available on iPad',
        'PDF export uses a browser print popup and is web-only for now. Open this exercise on playfastnotes.com to export.',
      );
      return;
    }
    const defaultTitle =
      exercise?.name && exercise.name.trim().length > 0
        ? exercise.name
        : (passage.title ?? 'Exercises');
    setPdfTitleDraft(defaultTitle);
    setPdfTitleModalOpen(true);
  }

  // Actually generate the PDF popup once we have a title.
  function runPdfExport(title: string) {
    if (typeof window === 'undefined' || !passage) return;
    const patterns = patternsByGrouping(grouping);
    const finalTitle = title.trim().length > 0 ? title.trim() : 'Exercises';
    const html = buildExerciseHtml(
      finalTitle,
      pitches,
      keySignature,
      clef,
      patterns,
    );
    const w = window.open('', '_blank');
    if (!w) {
      alert(
        'PDF export needs a popup window. Please allow popups for this site and try again.',
      );
      return;
    }
    // Trigger print after abcjs has had a moment to render every exercise.
    const printTrigger = `<script>
      window.addEventListener('load', function() {
        setTimeout(function() {
          try { window.focus(); window.print(); } catch (e) {}
        }, 700);
      });
    </script>`;
    w.document.open();
    w.document.write(html.replace('</body>', printTrigger + '</body>'));
    w.document.close();
  }

  if (!passage) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={{ opacity: Opacity.muted }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  const exerciseName =
    exercise?.name && exercise.name.trim().length > 0
      ? exercise.name
      : 'Rhythmic exercise';
  // Format the top bar title as "<passage> - <exercise name>" so the user
  // sees both pieces of context in one line. If there's no passage title
  // (rare; pre-Phase-0 data), fall back to just the exercise name.
  const topTitle = passage.title
    ? `${passage.title} — ${exerciseName}`
    : exerciseName;

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View {...({ dataSet: { printHide: '1' } } as object)}>
        <SessionTopBar
          onExit={exitSession}
          center={
            <View style={{ alignItems: 'center', maxWidth: '100%' }}>
              <ThemedText style={styles.topCenter} numberOfLines={1}>
                {topTitle}
              </ThemedText>
              {phase !== 'generate' && (
                <ThemedText style={styles.topSubCenter} numberOfLines={1}>
                  {phase === 'setup' ? 'Setup' : 'Enter pitches'}
                </ThemedText>
              )}
            </View>
          }
          right={
            phase === 'generate' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  onPress={openPdfTitlePrompt}
                  hitSlop={6}
                  style={[styles.pdfBtn, { borderColor: '#2980b9' }]}>
                  <ThemedText style={[styles.pdfBtnText, { color: '#2980b9' }]}>
                    PDF
                  </ThemedText>
                </Pressable>
                <Button
                  label="EDIT"
                  variant="outline"
                  size="sm"
                  onPress={() => setPhase('entry')}
                />
                <Button label="DONE" variant="danger" size="sm" onPress={doneSession} />
              </View>
            ) : null
          }
        />
      </View>

      {phase === 'setup' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.setupControls}
          keyboardShouldPersistTaps="handled">
          {passage.source_uri ? (
            // Pinch + pan to zoom up to 4× so the user can read the
            // source notation clearly while choosing instrument / key /
            // grouping. Container has a fixed height so the rest of
            // the screen stays accessible — the user can still scroll
            // past the score to the dropdowns + Continue button.
            <ZoomableImage uri={passage.source_uri} style={styles.setupScore} />
          ) : null}

          <View style={styles.setupControlsInner}>
            <DropdownField
              label="Instrument"
              valueId={instrument.id}
              options={INSTRUMENTS.map((i) => ({ id: i.id, label: i.label }))}
              onChange={(idValue) => {
                const next = INSTRUMENTS.find((x) => x.id === idValue);
                if (next) setInstrument(next);
              }}
              pickerTitle="Select instrument"
            />

            <View style={styles.dropdownRow}>
              <View style={{ flex: 1 }}>
                <DropdownField
                  label="Key"
                  valueId={keySignature.id}
                  options={KEY_SIGNATURES.map((k) => ({ id: k.id, label: k.label }))}
                  onChange={(idValue) => {
                    const next = KEY_SIGNATURES.find((x) => x.id === idValue);
                    if (next) {
                      setKeySignature(next);
                      setUseSharps(next.accidentals >= 0);
                    }
                  }}
                  pickerTitle="Select key signature"
                />
              </View>
              <View style={{ flex: 1 }}>
                <DropdownField
                  label="Clef"
                  valueId={clef.id}
                  options={CLEFS.map((c) => ({ id: c.id, label: c.label }))}
                  onChange={(idValue) => {
                    const next = CLEFS.find((x) => x.id === idValue);
                    if (next) setClef(next);
                  }}
                  pickerTitle="Select clef"
                />
              </View>
            </View>

            <ThemedText style={styles.label}>Note grouping</ThemedText>
            <GroupingPicker
              selected={grouping}
              onSelect={(n) => setGrouping(n as Grouping)}
            />

            <Pressable
              onPress={onContinue}
              style={[styles.continueBtn, { backgroundColor: C.tint }]}>
              <ThemedText style={styles.continueText}>
                Continue → Enter pitches
              </ThemedText>
            </Pressable>
          </View>
          <TutorialStep
            id="rhythm-builder-setup"
            visible={false}
            title="Exercise Builder — setup"
            body={
              "Pick your Instrument, Key, Clef, and Note grouping. These shape how the generated notation looks: the right clef for your transposition, accidentals that match your key, and how notes are beamed together.\n\n" +
              "Tap Continue when you're ready to enter the pitches."
            }
          />
        </ScrollView>
      )}

      {phase === 'entry' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Spacing['2xl'] }}>
          {passage.source_uri ? (
            // Same pinch + pan zoom as the setup phase.
            <ZoomableImage uri={passage.source_uri} style={styles.entryScore} />
          ) : null}

          <View style={[styles.summary, { borderColor: C.icon + '44' }]}>
            <ThemedText style={styles.summaryText}>
              {instrument.label} · {keySignature.label} · {clef.label} clef ·{' '}
              {grouping}-note grouping
            </ThemedText>
          </View>

          {insertIndex !== null && (
            <Pressable
              onPress={() => setInsertIndex(null)}
              style={[styles.insertBanner, { borderColor: C.tint }]}>
              <ThemedText style={[styles.insertBannerText, { color: C.tint }]}>
                Inserting at position {insertIndex + 1} · tap to cancel
              </ThemedText>
            </Pressable>
          )}

          <View style={styles.transportRow}>
            <Pressable
              onPress={metronome.playingSequence ? metronome.stopPitchSequence : playSequence}
              disabled={pitches.length === 0 && !metronome.playingSequence}
              style={[
                styles.playBtn,
                {
                  backgroundColor: metronome.playingSequence
                    ? '#c0392b'
                    : pitches.length > 0
                      ? C.tint
                      : C.icon,
                },
              ]}>
              <ThemedText style={styles.playText}>
                {metronome.playingSequence
                  ? '■ Stop'
                  : `▶ Play (${pitches.length})`}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={toggleSharpsFlats}
              style={[styles.accBtn, { borderColor: C.tint }]}>
              <ThemedText style={[styles.accText, { color: C.tint }]}>
                {useSharps ? 'Switch to flats' : 'Switch to sharps'}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={undo}
              disabled={historyRef.current.length === 0}
              style={[
                styles.utilBtn,
                {
                  borderColor: C.icon,
                  opacity: historyRef.current.length > 0 ? 1 : 0.35,
                },
              ]}>
              <ThemedText style={[styles.utilText, { color: C.text }]}>
                ↶ Undo
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={clearAll}
              disabled={pitches.length === 0}
              style={[
                styles.utilBtn,
                { borderColor: C.icon, opacity: pitches.length > 0 ? 1 : 0.35 },
              ]}>
              <ThemedText style={[styles.utilText, { color: C.text }]}>
                Clear
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setPhase('generate')}
              disabled={pitches.length === 0}
              style={[
                styles.genBtn,
                { backgroundColor: pitches.length > 0 ? '#9b59b6' : C.icon },
              ]}>
              <ThemedText style={styles.genText}>Generate →</ThemedText>
            </Pressable>
          </View>

          <View style={styles.keyboardWrap}>
            <PianoKeyboard onKeyPress={onKeyPress} preferSharps={useSharps} />
          </View>

          <PitchStaff
            pitches={pitches}
            keySignature={keySignature}
            clef={clef}
            width={winWidth}
            onNoteTap={(i) => setEditingIndex(i)}
            activeNoteIndex={editingIndex}
          />

          <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }}>
            <Button
              label="‹ Back to setup"
              variant="outline"
              onPress={() => setPhase('setup')}
            />
          </View>
          <TutorialStep
            id="rhythm-builder-entry"
            visible={false}
            title="Exercise Builder — enter pitches"
            body={
              "Tap the piano keys to enter the pitches of your passage one note at a time. The notation builds up on screen as you go.\n\n" +
              "Click a note on the staff to respell it (e.g. B♭ → A♯), force an accidental to display, or insert a new note before or after it.\n\n" +
              "▶ Play — play back the pitches you've entered with the metronome, so you can hear and check before generating.\n\n" +
              "Switch to sharps / Switch to flats — toggles the default enharmonic spelling for new notes.\n\n" +
              "↶ Undo — remove the last pitch you entered.\n\n" +
              "Clear — wipe everything and start over.\n\n" +
              "‹ Back to setup — return to the instrument, key, clef, and grouping pickers.\n\n" +
              "When the sequence is right, tap Generate → to render fully-notated rhythm-variation exercises."
            }
          />
        </ScrollView>
      )}

      {phase === 'generate' && (
        <View style={styles.generateArea}>
          <ExercisesPhase
            pitches={pitches}
            grouping={grouping}
            keySignature={keySignature}
            clef={clef}
            instrument={instrument}
            metronome={metronome}
            viewportWidth={winWidth}
            onBack={() => setPhase('entry')}
          />
          <PracticeToolsLayer
            metronome={metronome}
            // No `pencil` here: the rhythm-builder Generate phase doesn't
            // wire a PencilCanvas to its abcjs-rendered staves, so the
            // pencil tab would be a dead "coming soon" placeholder. Drop
            // it from the tool list entirely.
            tools={{ left: [], right: ['metronome', 'timer'] }}
          />
          <TutorialStep
            id="rhythm-builder-generate"
            visible={false}
            title="Exercise Builder — generated exercises"
            body={
              "Every rhythm pattern the app generated for your pitches, listed below. Tap ▶ next to a pattern to hear it with the metronome.\n\n" +
              "PDF — export the full set as printable sheet music you can read off the stand.\n\n" +
              "EDIT — go back and tweak the pitches, key, or grouping.\n\n" +
              "← Back to pitch entry — at the bottom of the list, returns you to the pitch keyboard without leaving the session.\n\n" +
              "DONE — save the session and exit." +
              `\n\n${PRACTICE_TOOLS_HELP}`
            }
          />
        </View>
      )}

      <PracticeLogNotePrompt
        visible={notePromptVisible}
        emoji="🎉"
        title="Exercise Builder — session complete"
        subtitle={passage?.title ?? undefined}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note, remindNext }) => finishLog(mood, note, remindNext)}
        onSkip={() => finishLog(null, null)}
      />

      <NoteCardEditor
        visible={editingIndex !== null}
        pitch={editingIndex !== null ? pitches[editingIndex] ?? null : null}
        onChange={onEditorChange}
        onDelete={onEditorDelete}
        onClose={() => setEditingIndex(null)}
        onInsertBefore={() => {
          if (editingIndex === null) return;
          setInsertIndex(editingIndex);
          setEditingIndex(null);
        }}
        onInsertAfter={() => {
          if (editingIndex === null) return;
          setInsertIndex(editingIndex + 1);
          setEditingIndex(null);
        }}
      />

      <Modal
        visible={pdfTitleModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPdfTitleModalOpen(false)}>
        <View style={styles.pdfModalBackdrop}>
          <View
            style={[
              styles.pdfModalCard,
              { backgroundColor: C.background, borderColor: C.icon + '55' },
            ]}>
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              Title this PDF
            </ThemedText>
            <ThemedText style={[styles.pdfModalHint, { color: C.icon }]}>
              This title prints at the top of the exported PDF. Be descriptive
              — recipients won&apos;t see your folder or passage names.
            </ThemedText>
            <ThemedText style={[styles.pdfModalTip, { color: C.icon }]}>
              Tip: in the print dialog that opens next, uncheck{' '}
              <ThemedText style={styles.pdfModalTipBold}>
                Headers and footers
              </ThemedText>{' '}
              to hide the browser&apos;s date / URL strip at the top and
              bottom of each page.
            </ThemedText>
            <TextInput
              ref={pdfTitleInputRef}
              value={pdfTitleDraft}
              onChangeText={setPdfTitleDraft}
              autoFocus
              selectTextOnFocus
              placeholder="e.g. Daily warm-up — C major"
              placeholderTextColor={C.icon}
              style={[
                styles.pdfModalInput,
                { color: C.text, borderColor: C.icon + '55' },
              ]}
              returnKeyType="done"
              onSubmitEditing={() => {
                setPdfTitleModalOpen(false);
                runPdfExport(pdfTitleDraft);
              }}
            />
            <View style={styles.pdfModalRow}>
              <Button
                label="Cancel"
                variant="ghost"
                size="sm"
                onPress={() => setPdfTitleModalOpen(false)}
              />
              <Button
                label="Export PDF"
                size="sm"
                onPress={() => {
                  setPdfTitleModalOpen(false);
                  runPdfExport(pdfTitleDraft);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

    </ThemedView>
  );
}

// Reading historyRef during render in the disabled-state computation —
// reference historyVersion so React re-renders when undo history mutates.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _useHistoryVersion = (v: number) => v;

// ── Exercises (Generate) phase ────────────────────────────────────────────

function ExercisesPhase({
  pitches,
  grouping,
  keySignature,
  clef,
  instrument,
  metronome,
  viewportWidth,
  onBack,
}: {
  pitches: Pitch[];
  grouping: Grouping;
  keySignature: KeySignature;
  clef: Clef;
  instrument: Instrument;
  metronome: ReturnType<typeof useMetronome>;
  viewportWidth: number;
  onBack: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const patterns = patternsByGrouping(grouping);
  const [playingId, setPlayingId] = useState<number | null>(null);

  // Clear the active card when playback finishes naturally.
  useEffect(() => {
    if (!metronome.playingSequence && playingId !== null) {
      setPlayingId(null);
    }
  }, [metronome.playingSequence, playingId]);

  function playPattern(pattern: RhythmPattern) {
    if (playingId === pattern.id) {
      metronome.stopPitchSequence();
      setPlayingId(null);
      return;
    }
    metronome.stopPitchSequence();
    // Build a parallel list of pitch frequencies and rhythm tokens, then
    // hand them to the metronome's lookahead scheduler. The engine reads
    // BPM each tick and uses the pattern's time-signature denominator,
    // so playback is conventional (BPM = denominator units per minute)
    // and changing BPM mid-playback retempos the remaining notes live.
    const freqs: number[] = [];
    const tokens: RhythmToken[] = [];
    const G = pattern.grouping;
    let idx = 0;
    while (idx < pitches.length) {
      const chunkEnd = Math.min(idx + G, pitches.length);
      for (let k = 0; k < chunkEnd - idx; k++) {
        const p = pitches[idx + k];
        const concert = writtenToConcert(p.midi, instrument);
        freqs.push(midiToFrequency(concert));
        tokens.push(pattern.notes[k]);
      }
      idx = chunkEnd;
    }
    if (freqs.length === 0) return;
    const beatDenom = parseBeatDenominator(pattern.timeSig);
    metronome.playPitchRhythm(freqs, tokens, beatDenom);
    setPlayingId(pattern.id);
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={exerciseStyles.wrap}>
      {pitches.length === 0 && (
        <ThemedText style={exerciseStyles.summary}>
          Enter some notes to generate exercises.
        </ThemedText>
      )}

      {pitches.length > 0 &&
        patterns.map((pattern, i) => (
          <ExerciseCard
            key={pattern.id}
            num={i + 1}
            pattern={pattern}
            pitches={pitches}
            keySignature={keySignature}
            clef={clef}
            viewportWidth={viewportWidth}
            isPlaying={playingId === pattern.id}
            onPlayToggle={() => playPattern(pattern)}
          />
        ))}

      <Pressable
        onPress={onBack}
        {...({ dataSet: { printHide: '1' } } as object)}
        style={[exerciseStyles.backBtn, { borderColor: C.tint }]}>
        <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
          ← Back to pitch entry
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

function ExerciseCard({
  num,
  pattern,
  pitches,
  keySignature,
  clef,
  viewportWidth,
  isPlaying,
  onPlayToggle,
}: {
  num: number;
  pattern: RhythmPattern;
  pitches: Pitch[];
  keySignature: KeySignature;
  clef: Clef;
  viewportWidth: number;
  isPlaying: boolean;
  onPlayToggle: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const abc = buildExerciseAbc(pitches, keySignature, clef, pattern);
  const approxMeasureWidth = 70 + pattern.grouping * 26;
  const usableWidth = viewportWidth - 120;
  const measuresPerLine = Math.max(
    1,
    Math.floor(usableWidth / approxMeasureWidth),
  );

  return (
    <View
      {...({ dataSet: { exerciseCard: '1' } } as object)}
      style={[exerciseStyles.card, { borderBottomColor: C.icon + '44' }]}>
      <View style={exerciseStyles.header}>
        <Pressable
          onPress={onPlayToggle}
          hitSlop={8}
          {...({ dataSet: { printHide: '1' } } as object)}
          style={[
            exerciseStyles.playBtn,
            { backgroundColor: isPlaying ? '#c0392b' : C.tint },
          ]}>
          <ThemedText style={exerciseStyles.playText}>
            {isPlaying ? '■' : '▶'}
          </ThemedText>
        </Pressable>
        <ThemedText style={[exerciseStyles.title, { flex: 1 }]} numberOfLines={1}>
          {num}.
        </ThemedText>
      </View>
      <AbcStaffView
        abc={abc}
        width={viewportWidth - 32}
        height={140}
        wrap
        // Trim the SVG to its actual content and center it in the row.
        // Without this, abcjs renders the music left-aligned and pads
        // the requested width with empty space — on phone landscape /
        // tablet, that leaves a huge blank gap to the right of each
        // pattern. With `centered`, the staff sits in the middle of
        // its row regardless of viewport width.
        centered
        preferredMeasuresPerLine={measuresPerLine}
        fallbackText={pattern.notes.join('  ')}
      />
    </View>
  );
}

const exerciseStyles = StyleSheet.create({
  wrap: { padding: Spacing.lg, paddingBottom: Spacing['2xl'], gap: Spacing.md },
  summary: {
    textAlign: 'center',
    opacity: Opacity.muted,
    fontSize: Type.size.sm,
    marginBottom: Spacing.sm,
  },
  card: {
    paddingBottom: Spacing.md,
    borderBottomWidth: Borders.thin,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  title: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  backBtn: {
    marginTop: Spacing.lg,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
});

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  generateArea: { flex: 1 },
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md, textAlign: 'center' },
  topSubCenter: { opacity: Opacity.muted, fontSize: 11, textAlign: 'center' },

  setupScore: {
    width: '100%',
    // Fixed height (not aspectRatio) so a tall portrait passage doesn't
    // push the dropdowns and Continue button below the fold. The image
    // inside renders contentFit:contain at 1×; the user pinches to
    // zoom and pans to navigate.
    height: 260,
    backgroundColor: '#0001',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: Spacing.md,
  },
  setupControls: {
    paddingBottom: Spacing['2xl'],
  },
  setupControlsInner: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  dropdownRow: { flexDirection: 'row', gap: Spacing.md },
  label: { opacity: 0.7, fontSize: 12, fontWeight: Type.weight.semibold, marginTop: 4 },
  continueBtn: {
    marginTop: Spacing.md,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  continueText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.lg,
    letterSpacing: 0.2,
  },

  // Entry phase
  entryScore: {
    width: '100%',
    // Same fixed-height treatment as setupScore — leaves room for the
    // pitch staff + piano keyboard below without scrolling.
    height: 200,
    backgroundColor: '#0001',
    overflow: 'hidden',
    position: 'relative',
  },
  summary: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: Borders.thin,
  },
  summaryText: {
    fontSize: Type.size.sm,
    opacity: Opacity.muted,
    textAlign: 'center',
  },
  insertBanner: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  insertBannerText: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  transportRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    alignItems: 'center',
  },
  playBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    minWidth: 110,
    alignItems: 'center',
  },
  playText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  accBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
  },
  accText: { fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  utilBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
  },
  utilText: { fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  genBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    marginLeft: 'auto',
  },
  genText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  keyboardWrap: {
    marginVertical: Spacing.md,
  },

  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  body2: {
    textAlign: 'center',
    opacity: Opacity.muted,
    fontSize: Type.size.md,
    lineHeight: 20,
    maxWidth: 460,
  },
  pdfBtn: {
    paddingHorizontal: 14,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.sm,
    borderWidth: Borders.thin,
  },
  pdfBtnText: {
    fontWeight: Type.weight.semibold,
    fontSize: Type.size.sm,
  },
  pdfModalBackdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  pdfModalCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: Radii.xl,
    borderWidth: Borders.thin,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  pdfModalHint: {
    fontSize: Type.size.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  pdfModalTip: {
    fontSize: Type.size.xs,
    lineHeight: 17,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  pdfModalTipBold: {
    fontWeight: Type.weight.bold,
    fontStyle: 'normal',
  },
  pdfModalInput: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Type.size.md,
  },
  pdfModalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
});
