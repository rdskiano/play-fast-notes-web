// The Recorder practice tool (web). Mirrors the native iPad panel: records
// the instrument through the mic (MediaRecorder), shows a live input
// waveform (Web Audio API + AnalyserNode), plays takes back at 0.5×/0.75×/1×
// with pitch preserved (HTMLAudioElement#preservesPitch), and saves keepers
// to the passage's practice log via Supabase. The legacy
// `app/passage/[id]/self-led/recording.tsx` proves the MediaRecorder path on
// every browser the web app supports — this panel reuses the same shape so
// upload/playback compatibility (Safari → audio/mp4, Chrome → audio/webm)
// stays in lockstep.
//
// v2 reskin (2026-06-22): redesigned to the "modern ed-tech" language — a
// status-dot header with a take count, a paper "stage" holding the big record
// circle + timer + live waveform, and takes rendered as soft white cards with
// a play button, a NEW badge, relative time, duration, and save/trash actions.

import Feather from '@expo/vector-icons/Feather';
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
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useSession } from '@/lib/supabase/auth';
import { saveRecording, type RecordingTarget } from '@/lib/supabase/recordings';

type Take = {
  id: string;
  blob: Blob;
  url: string;
  durationSec: number;
  createdAt: number;
  saved: boolean;
};

const SPEEDS = [1, 0.75, 0.5] as const;
const METER_FLOOR = -50;
const HOT_DB = -3;
const BAR_COUNT = 13;
// Faded resting waveform shown when nothing is being recorded — a gentle,
// roughly symmetric silhouette so the stage never looks empty.
const IDLE_BARS = [0.28, 0.5, 0.36, 0.72, 0.46, 0.9, 0.62, 0.84, 0.4, 0.66, 0.34, 0.52, 0.26];

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Human-friendly "when" for a take, relative to now. Recomputed each render;
// it doesn't tick on its own, which is fine for a session-only list.
function relativeTime(createdAt: number): string {
  const diff = Math.max(0, Date.now() - createdAt);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return 'earlier';
}

export function RecorderPanel({
  passageId,
  documentId,
}: {
  passageId?: string;
  documentId?: string;
}) {
  const session = useSession();
  // Phone density: shorter side under 600 px (catches landscape too).
  // We tighten the stage, shrink the record circle, and drop the playback-
  // speed label so the card matches the trimmed phone dock height set in
  // PracticeToolsLayer.
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
  const [freshTakeId, setFreshTakeId] = useState<string | null>(null);
  const [rate, setRate] = useState<number>(1);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [meterDb, setMeterDb] = useState(METER_FLOOR);
  const [bars, setBars] = useState<number[]>([]);
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
    setMeterDb(METER_FLOOR);
    setBars([]);
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
    const seg = Math.floor(buf.length / BAR_COUNT);
    const tick = () => {
      const a = analyserRef.current;
      if (!a) return;
      a.getFloatTimeDomainData(buf);
      // Overall level (for the "too loud" warning) + a per-bar RMS so the
      // waveform actually dances with the signal rather than scaling uniformly.
      let sum = 0;
      const next: number[] = [];
      for (let b = 0; b < BAR_COUNT; b++) {
        let segSum = 0;
        const start = b * seg;
        for (let i = 0; i < seg; i++) {
          const v = buf[start + i];
          segSum += v * v;
          sum += v * v;
        }
        const segRms = Math.sqrt(segSum / seg);
        // Boost a touch so quiet playing still shows visible motion.
        next.push(Math.max(0.06, Math.min(1, segRms * 3.2)));
      }
      const rms = Math.sqrt(sum / buf.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-6));
      setMeterDb(db);
      setBars(next);
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
        const id = `t_${Date.now()}`;
        setTakes((t) => [
          ...t,
          { id, blob, url, durationSec, createdAt: Date.now(), saved: false },
        ]);
        setFreshTakeId(id);
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
    if (freshTakeId === take.id) setFreshTakeId(null);
  }

  function pauseTake() {
    audioElRef.current?.pause();
    setPlayingId(null);
  }

  function removeTake(take: Take) {
    if (playingId === take.id) pauseTake();
    if (activeTakeId === take.id) setActiveTakeId(null);
    if (freshTakeId === take.id) setFreshTakeId(null);
    URL.revokeObjectURL(take.url);
    setTakes((ts) => ts.filter((t) => t.id !== take.id));
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
      if (freshTakeId === take.id) setFreshTakeId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save recording.');
    } finally {
      setSavingId(null);
    }
  }

  const circleSize = isPhone ? 56 : 76;
  const innerSize = isPhone ? 22 : 30;

  return (
    <View style={[styles.panel, isPhone && styles.panelPhone]}>
      {/* Header — status dot + title + live take count */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: recording ? Palette.danger : Palette.accent },
            ]}
          />
          <ThemedText style={styles.title}>Recorder</ThemedText>
        </View>
        <ThemedText style={styles.takeCount}>
          {takes.length} take{takes.length === 1 ? '' : 's'}
        </ThemedText>
      </View>

      {/* Stage — record circle + timer + live waveform */}
      <View style={[styles.stage, isPhone && styles.stagePhone]}>
        <Pressable
          onPress={toggleRecord}
          hitSlop={6}
          style={[
            styles.recordCircle,
            { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
          ]}>
          <View
            style={[
              recording ? styles.stopGlyph : styles.recordGlyph,
              !recording && {
                width: innerSize,
                height: innerSize,
                borderRadius: innerSize / 2,
              },
            ]}
          />
        </Pressable>

        <View style={styles.stageRight}>
          <ThemedText style={[styles.timer, isPhone && styles.timerPhone]}>
            {fmt(recording ? elapsed : 0)}
          </ThemedText>
          <View style={[styles.waveform, isPhone && styles.waveformPhone]}>
            {(recording && bars.length ? bars : IDLE_BARS).map((h, i) => (
              <View
                key={i}
                style={[
                  styles.waveBar,
                  {
                    height: `${Math.round(Math.max(0.08, h) * 100)}%`,
                    backgroundColor: recording
                      ? hot
                        ? Palette.danger
                        : Palette.accent
                      : Palette.accentSoft,
                    opacity: recording ? 1 : 0.9,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      {(hot || error) && (
        <ThemedText
          style={[styles.note, { color: Palette.danger }]}
          numberOfLines={2}>
          {error ?? 'Too loud — move back or play softer'}
        </ThemedText>
      )}

      {/* Playback speed — slow down without changing pitch */}
      <View style={styles.speedRow}>
        {!isPhone && <ThemedText style={styles.speedLabel}>Playback</ThemedText>}
        {SPEEDS.map((s) => {
          const on = rate === s;
          return (
            <Pressable
              key={s}
              onPress={() => changeRate(s)}
              style={[
                styles.speedChip,
                on && { backgroundColor: Palette.accent, borderColor: Palette.accent },
              ]}>
              <ThemedText
                style={[styles.speedChipText, { color: on ? '#fff' : Palette.textSecondary }]}>
                {s}×
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {/* Takes — newest first, mirroring the stack in the mockup */}
      <ScrollView style={styles.takeList} contentContainerStyle={{ gap: Spacing.sm }}>
        {takes.length === 0 ? (
          <ThemedText style={styles.empty}>
            No takes yet. Tap the red button to record one.
          </ThemedText>
        ) : (
          [...takes]
            .reverse()
            .map((take) => {
              const isPlaying = playingId === take.id;
              const isNew = freshTakeId === take.id;
              return (
                <View
                  key={take.id}
                  style={[styles.takeRow, isNew && styles.takeRowNew]}>
                  <Pressable
                    onPress={() => (isPlaying ? pauseTake() : playTake(take))}
                    hitSlop={6}
                    style={styles.playBtn}>
                    <Feather
                      name={isPlaying ? 'pause' : 'play'}
                      size={16}
                      color={Palette.text}
                    />
                  </Pressable>

                  {/* Middle slot: NEW badge while fresh, otherwise the time.
                      One element only — the dock card is narrow, so the two
                      must never compete for the same width. */}
                  <View style={styles.takeMid}>
                    {isNew ? (
                      <View style={styles.newBadge}>
                        <ThemedText style={styles.newBadgeText}>NEW</ThemedText>
                      </View>
                    ) : (
                      <ThemedText style={styles.takeLabel} numberOfLines={1}>
                        {relativeTime(take.createdAt)}
                      </ThemedText>
                    )}
                  </View>

                  {/* Right cluster — fixed width, never shrinks/overlaps */}
                  <View style={styles.takeRight}>
                    <ThemedText style={styles.takeDur}>{fmt(take.durationSec)}</ThemedText>

                    {take.saved ? (
                      <View style={styles.savedPill}>
                        <Feather name="check" size={14} color={Palette.success} />
                      </View>
                    ) : savingId === take.id ? (
                      <View style={styles.savePill}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => saveTake(take)}
                        disabled={!target}
                        hitSlop={6}
                        style={[styles.savePill, !target && styles.iconBtnDisabled]}>
                        <ThemedText style={styles.savePillText}>Save</ThemedText>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() => removeTake(take)}
                      hitSlop={6}
                      style={styles.iconBtn}>
                      <Feather name="trash-2" size={16} color={Palette.textMuted} />
                    </Pressable>
                  </View>
                </View>
              );
            })
        )}
      </ScrollView>

      {!target && takes.length > 0 && !isPhone && (
        <ThemedText style={styles.hint}>
          Open a passage or PDF to save takes to your practice log.
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
  // top-left corner.
  panel: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: 30,
    gap: Spacing.md,
  },
  panelPhone: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    paddingTop: 28,
    gap: Spacing.sm,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusDot: { width: 11, height: 11, borderRadius: 6 },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.3,
  },
  takeCount: { fontSize: Type.size.sm, color: Palette.textMuted },

  stage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Palette.inset,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  stagePhone: { gap: Spacing.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  recordCircle: {
    borderWidth: 3,
    borderColor: Palette.danger,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...Lift,
  },
  recordGlyph: { backgroundColor: Palette.danger },
  stopGlyph: { width: 22, height: 22, borderRadius: 5, backgroundColor: Palette.danger },

  stageRight: { flex: 1, gap: Spacing.xs },
  timer: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size['4xl'],
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -1,
    lineHeight: 40,
  },
  timerPhone: { fontSize: Type.size['2xl'], lineHeight: 26 },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
  },
  waveformPhone: { height: 22, gap: 3 },
  waveBar: {
    flex: 1,
    minHeight: 3,
    borderRadius: Radii.pill,
  },

  note: { fontSize: Type.size.xs, textAlign: 'center', fontWeight: Type.weight.semibold },

  speedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  speedLabel: {
    flex: 1,
    fontSize: Type.size.xs,
    fontWeight: Type.weight.semibold,
    color: Palette.textMuted,
  },
  speedChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  speedChipText: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },

  takeList: { flex: 1 },
  empty: {
    fontSize: Type.size.sm,
    color: Palette.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },

  takeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    ...Lift,
  },
  takeRowNew: {
    backgroundColor: Palette.dangerSoft,
    borderColor: Palette.danger + '55',
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  takeMid: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  takeRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexShrink: 0 },
  takeLabel: {
    flexShrink: 1,
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    color: Palette.textSecondary,
  },
  newBadge: {
    backgroundColor: Palette.danger,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.5,
  },
  takeDur: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: { opacity: 0.35 },
  savePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radii.pill,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePillText: { color: '#fff', fontSize: Type.size.xs, fontWeight: Type.weight.heavy },
  savedPill: {
    width: 28,
    height: 28,
    borderRadius: Radii.pill,
    backgroundColor: Palette.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hint: { fontSize: Type.size.xs, textAlign: 'center', color: Palette.textMuted },
});
