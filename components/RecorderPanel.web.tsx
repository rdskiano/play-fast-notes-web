// The Recorder practice tool (web). Mirrors the native iPad panel: records
// the instrument through the mic (MediaRecorder), shows a live input meter
// (Web Audio API + AnalyserNode), plays takes back at 0.5×/0.75×/1× with
// pitch preserved (HTMLAudioElement#preservesPitch), and saves keepers to
// the passage's practice log via Supabase. The legacy
// `app/passage/[id]/self-led/recording.tsx` proves the MediaRecorder path on
// every browser the web app supports — this panel reuses the same shape so
// upload/playback compatibility (Safari → audio/mp4, Chrome → audio/webm)
// stays in lockstep.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { SignInModal } from '@/components/SignInModal';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/lib/supabase/auth';
import { saveRecording, type RecordingTarget } from '@/lib/supabase/recordings';

type Take = {
  id: string;
  blob: Blob;
  url: string;
  durationSec: number;
  saved: boolean;
};

const SPEEDS = [1, 0.75, 0.5] as const;
const METER_FLOOR = -50;
const HOT_DB = -3;

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function RecorderPanel({
  passageId,
  documentId,
}: {
  passageId?: string;
  documentId?: string;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const session = useSession();
  // Phone density: shorter side under 600 px (catches landscape too).
  // We hide chrome (Playback-speed label, input-level caption, save
  // hint) and tighten paddings so the card matches the trimmed phone
  // dock height set in PracticeToolsLayer.
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;

  const target: RecordingTarget | null = passageId
    ? { passageId }
    : documentId
      ? { documentId }
      : null;

  const [takes, setTakes] = useState<Take[]>([]);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [rate, setRate] = useState<number>(1);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [meterLevel, setMeterLevel] = useState(0);
  const [meterDb, setMeterDb] = useState(METER_FLOOR);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const recordStartRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Revoke object URLs and tear down any live capture when the panel unmounts
  // (e.g. on navigation). Takes themselves are session-only on web.
  useEffect(() => {
    return () => {
      stopMeter();
      stopStream();
      stopTicker();
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current = null;
      }
      takes.forEach((t) => URL.revokeObjectURL(t.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hot = recording && meterDb > HOT_DB;

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function stopMeter() {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setMeterLevel(0);
    setMeterDb(METER_FLOOR);
  }

  function stopTicker() {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function startMeter(stream: MediaStream) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    analyserRef.current = analyser;

    const buf = new Float32Array(analyser.fftSize);
    const tick = () => {
      const a = analyserRef.current;
      if (!a) return;
      a.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-6));
      const level = Math.max(
        0,
        Math.min(1, (db - METER_FLOOR) / -METER_FLOOR),
      );
      setMeterDb(db);
      setMeterLevel(level);
      meterRafRef.current = requestAnimationFrame(tick);
    };
    meterRafRef.current = requestAnimationFrame(tick);
  }

  const startRecording = useCallback(async () => {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(
        'Microphone unavailable in this context. Use https://playfastnotes.com or http://localhost:8081.',
      );
      return;
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('Microphone requires HTTPS or localhost.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startMeter(stream);
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = chunksRef.current[0]?.type || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const url = URL.createObjectURL(blob);
        const durationSec = (Date.now() - recordStartRef.current) / 1000;
        setTakes((t) => [
          ...t,
          {
            id: `t_${Date.now()}`,
            blob,
            url,
            durationSec,
            saved: false,
          },
        ]);
        stopStream();
        stopMeter();
      };
      recordStartRef.current = Date.now();
      setElapsed(0);
      tickRef.current = setInterval(() => {
        setElapsed((Date.now() - recordStartRef.current) / 1000);
      }, 200);
      rec.start();
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start recording.');
      stopStream();
      stopMeter();
    }
  }, []);

  const stopRecording = useCallback(() => {
    stopTicker();
    setRecording(false);
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
  }, []);

  function toggleRecord() {
    if (recording) stopRecording();
    else startRecording();
  }

  function ensureAudioEl(): HTMLAudioElement {
    if (!audioElRef.current) {
      const a = new Audio();
      a.onended = () => setPlayingId(null);
      a.onpause = () => setPlayingId((cur) => (a.ended ? null : cur));
      audioElRef.current = a;
    }
    return audioElRef.current;
  }

  function applyRate(a: HTMLAudioElement, r: number) {
    a.playbackRate = r;
    // Keep pitch when slowing down. Default true on modern browsers; set
    // explicitly for older Safari/Firefox prefixes.
    a.preservesPitch = true;
    (a as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
    (a as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
  }

  function playTake(take: Take) {
    const a = ensureAudioEl();
    if (activeTakeId !== take.id) {
      a.src = take.url;
      setActiveTakeId(take.id);
    } else {
      a.currentTime = 0;
    }
    applyRate(a, rate);
    void a.play();
    setPlayingId(take.id);
  }

  function pauseTake() {
    audioElRef.current?.pause();
    setPlayingId(null);
  }

  function changeRate(r: number) {
    setRate(r);
    if (audioElRef.current) applyRate(audioElRef.current, r);
  }

  async function saveTake(take: Take) {
    if (!target) return;
    if (!session) {
      setSignInOpen(true);
      return;
    }
    // Guard "tap record, tap stop instantly" takes (B-006). MediaRecorder
    // still emits a few hundred bytes of WEBM headers, so the zero-byte
    // check inside saveRecording never fires for these — gate on duration.
    // The bar is 1s: fmt() floors seconds, so anything shorter renders as
    // "0:00" — a recording the user reasonably reads as zero-length and
    // shouldn't be able to save. (0.3s was too low; sub-second taps slipped
    // through and saved as 0:00 stubs.)
    if (take.durationSec < 1) {
      setError('Recording too short — hold Record for at least a second.');
      return;
    }
    setError(null);
    setSavingId(take.id);
    try {
      await saveRecording(target, take.blob, take.durationSec);
      setTakes((ts) =>
        ts.map((t) => (t.id === take.id ? { ...t, saved: true } : t)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save recording.');
    } finally {
      setSavingId(null);
    }
  }

  // Compact record button used in the phone layout — just the glyph
  // (and the live elapsed time while recording), so it can sit inline
  // with the meter instead of eating a whole row.
  const recordButton = (
    <Pressable
      onPress={toggleRecord}
      style={[
        styles.recordBtn,
        isPhone && styles.recordBtnPhone,
        { backgroundColor: recording ? '#7d1d1d' : '#e74c3c' },
      ]}>
      <View style={recording ? styles.stopGlyph : styles.recordGlyph} />
      {isPhone ? (
        recording ? (
          <ThemedText style={styles.recordLabelPhone}>{fmt(elapsed)}</ThemedText>
        ) : null
      ) : (
        <ThemedText style={styles.recordLabel}>
          {recording ? `Stop · ${fmt(elapsed)}` : 'Record'}
        </ThemedText>
      )}
    </Pressable>
  );

  const meterTrack = (
    <View style={[styles.meterTrack, isPhone && styles.meterTrackPhone]}>
      <View
        style={[
          styles.meterFill,
          {
            width: `${(recording ? meterLevel : 0) * 100}%`,
            backgroundColor: hot ? '#e74c3c' : '#2ecc71',
          },
        ]}
      />
    </View>
  );

  return (
    <View style={[styles.panel, isPhone && styles.panelPhone]}>
      {isPhone ? (
        // Phone: record button + meter share a row to save vertical space.
        <View style={styles.recordRowPhone}>
          {recordButton}
          {meterTrack}
        </View>
      ) : (
        <>
          {recordButton}
          {meterTrack}
        </>
      )}
      {/* Phone hides the static "Input level" caption — meter is self-
          explanatory — but still surfaces the "too loud" warning. */}
      {(!isPhone || hot) && (
        <ThemedText style={[styles.meterNote, { color: hot ? '#e74c3c' : C.icon }]}>
          {hot ? 'Too loud — move back or play softer' : 'Input level'}
        </ThemedText>
      )}

      <View style={styles.speedRow}>
        {!isPhone && (
          <ThemedText style={[styles.speedLabel, { color: C.icon }]}>
            Playback speed
          </ThemedText>
        )}
        {SPEEDS.map((s) => (
          <Pressable
            key={s}
            onPress={() => changeRate(s)}
            style={[
              styles.speedChip,
              { borderColor: C.icon + '66' },
              rate === s && { backgroundColor: C.tint, borderColor: C.tint },
            ]}>
            <ThemedText
              style={[
                styles.speedChipText,
                { color: rate === s ? '#fff' : C.text },
              ]}>
              {s}×
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.takeList} contentContainerStyle={{ gap: 6 }}>
        {error && (
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        )}
        {takes.length === 0 ? (
          <ThemedText style={[styles.empty, { color: C.icon }]}>
            No takes yet. Tap Record to capture one.
          </ThemedText>
        ) : (
          takes.map((take, i) => {
            const isPlaying = playingId === take.id;
            return (
              <View
                key={take.id}
                style={[styles.takeRow, { borderColor: C.icon + '33' }]}>
                <Pressable
                  onPress={() => (isPlaying ? pauseTake() : playTake(take))}
                  hitSlop={6}
                  style={[styles.playBtn, { borderColor: C.tint }]}>
                  <ThemedText style={[styles.playGlyph, { color: C.tint }]}>
                    {isPlaying ? '❚❚' : '▶'}
                  </ThemedText>
                </Pressable>
                <ThemedText style={styles.takeLabel} numberOfLines={1}>
                  Take {i + 1} · {fmt(take.durationSec)}
                </ThemedText>
                {take.saved ? (
                  <ThemedText style={[styles.savedTag, { color: '#2ecc71' }]}>
                    ✓ Saved
                  </ThemedText>
                ) : savingId === take.id ? (
                  <ActivityIndicator size="small" color={C.tint} />
                ) : (
                  <Pressable
                    onPress={() => saveTake(take)}
                    disabled={!target}
                    style={[
                      styles.saveBtn,
                      { backgroundColor: C.tint },
                      !target && styles.saveBtnDisabled,
                    ]}>
                    <ThemedText style={styles.saveBtnText}>Save</ThemedText>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {!target && takes.length > 0 && !isPhone && (
        <ThemedText style={[styles.hint, { color: C.icon }]}>
          Open a passage or PDF to save takes to the practice log.
        </ThemedText>
      )}

      <SignInModal
        visible={signInOpen}
        onClose={() => setSignInOpen(false)}
        onSignedIn={() => setSignInOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // paddingTop clears the ToolDock collapse × that floats in the card's
  // top-left corner — the record button is the first row and would sit under it.
  panel: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: 30,
    gap: Spacing.sm,
  },
  // Phone: tighter padding + smaller gap so the trimmed dock isn't
  // bottlenecked by chrome (top still cleared for the × button).
  panelPhone: { paddingHorizontal: Spacing.sm, paddingBottom: Spacing.sm, paddingTop: 28, gap: 6 },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    borderRadius: Radii.lg,
  },
  recordBtnPhone: {
    // Compact pill on phone — auto width, shorter, just the glyph
    // (and live elapsed when recording).
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 56,
    gap: 6,
  },
  recordGlyph: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },
  stopGlyph: { width: 14, height: 14, borderRadius: 3, backgroundColor: '#fff' },
  recordLabel: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  // Smaller weight on phone so a 5-character "12:34" fits the pill.
  recordLabelPhone: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.sm },
  recordRowPhone: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  meterTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00000022',
    overflow: 'hidden',
  },
  meterTrackPhone: { flex: 1, height: 8 },
  meterFill: { height: '100%', borderRadius: 5 },
  meterNote: { fontSize: Type.size.xs, textAlign: 'center' },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  speedLabel: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    marginRight: Spacing.xs,
  },
  speedChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
  },
  speedChipText: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  takeList: { flex: 1 },
  empty: {
    fontSize: Type.size.sm,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  errorText: {
    color: '#c0392b',
    fontSize: Type.size.xs,
    textAlign: 'center',
  },
  takeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { fontSize: 12, fontWeight: Type.weight.heavy },
  takeLabel: { flex: 1, fontSize: Type.size.sm, fontWeight: Type.weight.semibold },
  savedTag: { fontSize: Type.size.xs, fontWeight: Type.weight.heavy },
  saveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.md,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: Type.size.xs, fontWeight: Type.weight.heavy },
  hint: { fontSize: Type.size.xs, textAlign: 'center' },
});
