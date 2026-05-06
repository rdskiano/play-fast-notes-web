// Self-Led Recording session.
//
// State machine: idle -> recording -> recorded -> saving -> log written.
// Uses MediaRecorder (web) to capture audio, plays it back via an HTML
// <audio> element, and uploads the blob to the recordings storage bucket
// on Save. On iPad this whole screen will be re-implemented with expo-audio
// in a future playbuild.

import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { logPractice } from '@/lib/db/repos/practiceLog';
import { stampLastUsed } from '@/lib/db/repos/strategyLastUsed';
import { newRecordingId, uploadRecording } from '@/lib/supabase/recordings';

type Phase = 'idle' | 'recording' | 'recorded' | 'saving';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SelfLedRecordingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [passage, setPassage] = useState<Passage | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState<number>(0);
  const [notePromptVisible, setNotePromptVisible] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!id) return;
    getPassage(id).then(setPassage);
  }, [id]);

  // Cleanup: stop any active recording / tracks on unmount.
  useEffect(() => {
    return () => {
      stopTicker();
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTicker() {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
      setError('Recording is only available on web for now.');
      return;
    }
    // navigator.mediaDevices is only exposed in secure contexts — HTTPS or
    // localhost. If you reach the dev server from another device on the LAN
    // (e.g. iPad Safari at http://192.168.x.x:8081), the API is undefined.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(
        'Microphone access is blocked in this context. Use the dev server from localhost (http://localhost:8081) on the same Mac, or open the deployed site at https://playfastnotes.com.',
      );
      return;
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError(
        'This page is not a secure context. Microphone access requires HTTPS or localhost.',
      );
      return;
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setRecordedBlob(null);
    setRecordedDuration(0);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: chunksRef.current[0]?.type || 'audio/webm',
        });
        const url = URL.createObjectURL(blob);
        const duration = (Date.now() - startedAtRef.current) / 1000;
        setRecordedBlob(blob);
        setRecordedDuration(duration);
        setPreviewUrl(url);
        setPhase('recorded');
        stopStream();
      };
      startedAtRef.current = Date.now();
      setElapsed(0);
      tickRef.current = setInterval(() => {
        setElapsed((Date.now() - startedAtRef.current) / 1000);
      }, 100);
      recorder.start();
      setPhase('recording');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Could not start recording: ${msg}`);
      stopStream();
    }
  }

  function stopRecording() {
    stopTicker();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }

  function reRecord() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setRecordedBlob(null);
    setRecordedDuration(0);
    setPhase('idle');
  }

  function onSaveClick() {
    setNotePromptVisible(true);
  }

  async function finishLog(mood: string | null, note: string | null) {
    setNotePromptVisible(false);
    if (!id || !recordedBlob) {
      router.back();
      return;
    }
    setPhase('saving');
    try {
      const recordingId = newRecordingId();
      const uri = await uploadRecording(recordingId, recordedBlob);
      await stampLastUsed(id, 'recording');
      const data: Record<string, unknown> = {
        recording_uri: uri,
        recording_id: recordingId,
        duration_seconds: Math.round(recordedDuration * 10) / 10,
      };
      if (mood) data.mood = mood;
      if (note) data.note = note;
      await logPractice(id, 'recording', data);
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Could not save recording: ${msg}`);
      setPhase('recorded');
    }
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Back"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Recording
          </ThemedText>
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

      <View
        style={[
          styles.controls,
          { backgroundColor: C.background, borderTopColor: C.icon + '33' },
        ]}>
        {error && (
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        )}
        {phase === 'idle' && (
          <Button
            label="● Record"
            variant="danger"
            onPress={startRecording}
            fullWidth
          />
        )}
        {phase === 'recording' && (
          <View style={styles.row}>
            <ThemedText style={[styles.timer, { color: C.text }]}>
              {formatElapsed(elapsed)}
            </ThemedText>
            <Button label="■ Stop" variant="primary" onPress={stopRecording} />
          </View>
        )}
        {phase === 'recorded' && previewUrl && (
          <View style={styles.recordedCol}>
            <ThemedText style={[styles.timer, { color: C.text }]}>
              {formatElapsed(recordedDuration)}
            </ThemedText>
            {Platform.OS === 'web' && (
              // Inline audio element for playback. Using a raw HTML element
              // is fine in RN-Web — React renders it directly. iPad parity
              // will swap this for expo-audio later.
              <audio
                ref={audioElRef}
                src={previewUrl}
                controls
                style={{ width: '100%' }}
              />
            )}
            <View style={styles.row}>
              <Button
                label="↻ Re-record"
                variant="ghost"
                onPress={reRecord}
              />
              <View style={{ flex: 1 }} />
              <Button
                label="Save & log"
                variant="primary"
                onPress={onSaveClick}
              />
            </View>
          </View>
        )}
        {phase === 'saving' && (
          <View style={styles.row}>
            <ActivityIndicator />
            <ThemedText style={{ color: C.text }}>Uploading…</ThemedText>
          </View>
        )}
      </View>

      <PracticeLogNotePrompt
        visible={notePromptVisible}
        emoji="🎙"
        title="Recording — log it"
        subtitle={passage?.title ?? undefined}
        submitLabel="Save & finish"
        cancelLabel="Skip note"
        onSubmit={({ mood, note }) => finishLog(mood, note)}
        onSkip={() => finishLog(null, null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  scoreFill: { flex: 1, width: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  controls: {
    padding: Spacing.lg,
    // Extra right padding so the Save / Re-record buttons clear the floating
    // Feedback bubble (position: absolute, bottom: 20, right: 20, ~140px wide).
    paddingRight: 160,
    gap: Spacing.md,
    borderTopWidth: Borders.thin,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  recordedCol: {
    gap: Spacing.md,
  },
  timer: {
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    color: '#c0392b',
    fontSize: Type.size.sm,
  },
});

// Silence "value not used" lint when Radii unused in this file.
void Radii;
