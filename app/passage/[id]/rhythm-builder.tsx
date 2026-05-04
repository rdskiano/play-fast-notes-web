import { Image, type ImageLoadEventData } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { Button } from '@/components/Button';
import { DropdownField } from '@/components/DropdownField';
import { FloatingMetronome } from '@/components/FloatingMetronome';
import { GroupingPicker } from '@/components/GroupingPicker';
import { NoteCardEditor } from '@/components/NoteCardEditor';
import { PianoKeyboard } from '@/components/PianoKeyboard';
import { PitchStaff } from '@/components/PitchStaff';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
  patternsByGrouping,
  TOKEN_QUARTER_FRACTIONS,
  type Grouping,
  type RhythmPattern,
} from '@/lib/strategies/rhythmPatterns';

type Phase = 'setup' | 'entry' | 'generate';

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
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [notePromptVisible, setNotePromptVisible] = useState(false);

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
    if (exerciseIdParam) {
      getExerciseById(exerciseIdParam).then((ex) => {
        if (cancelled) return;
        setExercise(ex);
        const cfg = parseConfig(ex?.config_json);
        if (cfg.instrumentId) {
          const next = INSTRUMENTS.find((i) => i.id === cfg.instrumentId);
          if (next) setInstrument(next);
        }
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
      setHydrated(true);
    }
    return () => {
      cancelled = true;
      metronome.stop();
      metronome.stopPitchSequence();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, exerciseIdParam]);

  // Debounced save of all entry-phase state into exercises.config_json.
  useEffect(() => {
    if (!exercise || !hydrated) return;
    const handle = setTimeout(() => {
      const merged: StoredConfig = {
        instrumentId: instrument.id,
        keyId: keySignature.id,
        clefId: clef.id,
        grouping,
        pitches,
        useSharps,
      };
      const json = JSON.stringify(merged);
      setExercise((prev) => (prev ? { ...prev, config_json: json } : prev));
      updateExerciseConfig(exercise.id, json).catch(() => undefined);
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

  function exitSession() {
    metronome.stop();
    metronome.stopPitchSequence();
    router.back();
  }

  function doneSession() {
    setNotePromptVisible(true);
  }

  async function finishLog(mood: string | null, note: string | null) {
    setNotePromptVisible(false);
    if (id) {
      try {
        await stampLastUsed(id, 'rhythmic');
        const data: Record<string, unknown> = {};
        if (mood) data.mood = mood;
        if (note) data.note = note;
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
  function exportPdf() {
    if (typeof window === 'undefined' || !passage) return;
    const patterns = patternsByGrouping(grouping);
    const html = buildExerciseHtml(
      exercise?.name && exercise.name.trim().length > 0
        ? exercise.name
        : (passage.title ?? 'Exercises'),
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

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View {...({ dataSet: { printHide: '1' } } as object)}>
        <SessionTopBar
          onExit={exitSession}
          center={
            <View style={{ alignItems: 'center', maxWidth: '100%' }}>
              <ThemedText style={styles.topCenter} numberOfLines={1}>
                {exerciseName}
              </ThemedText>
              <ThemedText style={styles.topSubCenter} numberOfLines={1}>
                {phase === 'setup'
                  ? 'Setup'
                  : phase === 'entry'
                    ? 'Enter pitches'
                    : 'Exercises'}
              </ThemedText>
            </View>
          }
          right={
            phase === 'generate' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <PracticeTimersPill />
                <Pressable
                  onPress={exportPdf}
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
            ) : (
              <PracticeTimersPill />
            )
          }
        />
      </View>

      {phase === 'setup' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.setupControls}
          keyboardShouldPersistTaps="handled">
          {passage.source_uri ? (
            <View
              style={[
                styles.setupScore,
                imageAspect ? { aspectRatio: imageAspect } : null,
              ]}>
              <Image
                source={{ uri: passage.source_uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                onLoad={(e: ImageLoadEventData) => {
                  const w = e.source?.width;
                  const h = e.source?.height;
                  if (w && h && h > 0) setImageAspect(w / h);
                }}
              />
            </View>
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
        </ScrollView>
      )}

      {phase === 'entry' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Spacing['2xl'] }}>
          {passage.source_uri ? (
            <View
              style={[
                styles.entryScore,
                imageAspect ? { aspectRatio: imageAspect } : null,
              ]}>
              <Image
                source={{ uri: passage.source_uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                onLoad={(e: ImageLoadEventData) => {
                  const w = e.source?.width;
                  const h = e.source?.height;
                  if (w && h && h > 0) setImageAspect(w / h);
                }}
              />
            </View>
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
        </ScrollView>
      )}

      {phase === 'generate' && (
        <>
          <ExercisesPhase
            passageTitle={passage.title ?? 'Exercises'}
            pitches={pitches}
            grouping={grouping}
            keySignature={keySignature}
            clef={clef}
            instrument={instrument}
            metronome={metronome}
            viewportWidth={winWidth}
            onBack={() => setPhase('entry')}
          />
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
            initialY={160}
          />
        </>
      )}

      <PracticeLogNotePrompt
        visible={notePromptVisible}
        emoji="🎉"
        title="Exercise Builder — session complete"
        subtitle={passage?.title ?? undefined}
        submitLabel="Save & finish"
        cancelLabel="Skip"
        onSubmit={({ mood, note }) => finishLog(mood, note)}
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
    </ThemedView>
  );
}

// Reading historyRef during render in the disabled-state computation —
// reference historyVersion so React re-renders when undo history mutates.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _useHistoryVersion = (v: number) => v;

// ── Exercises (Generate) phase ────────────────────────────────────────────

function ExercisesPhase({
  passageTitle,
  pitches,
  grouping,
  keySignature,
  clef,
  instrument,
  metronome,
  viewportWidth,
  onBack,
}: {
  passageTitle: string;
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
  const numFullChunks = Math.floor(pitches.length / grouping);
  const totalChunks =
    numFullChunks + (pitches.length - numFullChunks * grouping > 0 ? 1 : 0);
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
    // Treat the metronome BPM as quarter-note BPM so every pattern ticks at
    // the same perceived pace regardless of its time-signature denominator.
    const quarterSec = 60 / metronome.bpm;
    const freqs: number[] = [];
    const durations: number[] = [];
    const G = pattern.grouping;
    let idx = 0;
    while (idx < pitches.length) {
      const chunkEnd = Math.min(idx + G, pitches.length);
      for (let k = 0; k < chunkEnd - idx; k++) {
        const token = pattern.notes[k];
        const p = pitches[idx + k];
        const concert = writtenToConcert(p.midi, instrument);
        freqs.push(midiToFrequency(concert));
        durations.push(TOKEN_QUARTER_FRACTIONS[token] * quarterSec);
      }
      idx = chunkEnd;
    }
    if (freqs.length === 0) return;
    metronome.playPitchRhythm(freqs, durations);
    setPlayingId(pattern.id);
  }

  return (
    <ScrollView contentContainerStyle={exerciseStyles.wrap}>
      <ThemedText type="subtitle" style={{ textAlign: 'center' }} numberOfLines={1}>
        {passageTitle}
      </ThemedText>
      <ThemedText style={exerciseStyles.summary}>
        {pitches.length > 0
          ? `${patterns.length} patterns × ${totalChunks} measure${totalChunks === 1 ? '' : 's'}`
          : 'Enter some notes to generate exercises.'}
      </ThemedText>

      {pitches.length > 0 &&
        patterns.map((pattern) => (
          <ExerciseCard
            key={pattern.id}
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
  pattern,
  pitches,
  keySignature,
  clef,
  viewportWidth,
  isPlaying,
  onPlayToggle,
}: {
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
          #{pattern.id} · {pattern.timeSig}
        </ThemedText>
        <ThemedText style={exerciseStyles.tokens}>
          {pattern.notes.join(' ')}
        </ThemedText>
      </View>
      <AbcStaffView
        abc={abc}
        width={viewportWidth - 32}
        height={140}
        wrap
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
  tokens: {
    fontSize: 11,
    opacity: Opacity.muted,
    fontFamily: 'monospace',
  },
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
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md, textAlign: 'center' },
  topSubCenter: { opacity: Opacity.muted, fontSize: 11, textAlign: 'center' },

  setupScore: {
    width: '100%',
    minHeight: 200,
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
    minHeight: 160,
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
});
