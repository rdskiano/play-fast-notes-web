// The Recorder practice tool (iOS). Records the instrument through the mic,
// shows a live input meter (iOS gives no software input gain on the built-in
// mic — the meter is how you catch clipping and back the iPad off), plays
// takes back at a slower, pitch-corrected speed, and saves the keepers to the
// passage's practice log (uploaded to Supabase so the web app sees them too).

import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { SignInModal } from '@/components/SignInModal';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/lib/supabase/auth';
import { saveRecording, type RecordingTarget } from '@/lib/supabase/recordings';

type Take = { id: string; uri: string; durationSec: number; saved: boolean };

const SPEEDS = [1, 0.75, 0.5] as const;
// Metering is in dBFS — 0 is clipping. Map this floor..0 onto the meter bar.
const METER_FLOOR = -50;
// Above this level the input is hot enough to risk clipping.
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

  // Where a saved take is filed: a passage on a practice screen, or the whole
  // document on the PDF viewer. Save is disabled when there's neither.
  const target: RecordingTarget | null = passageId
    ? { passageId }
    : documentId
      ? { documentId }
      : null;

  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recState = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  const [takes, setTakes] = useState<Take[]>([]);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const [rate, setRate] = useState<number>(1);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  // Wall-clock start of the current recording. The recorder's own duration
  // metering reports 0 on stop, so take length is measured from this instead.
  const recordStartRef = useRef(0);

  const recording = recState.isRecording;
  const meterDb = recState.metering ?? METER_FLOOR;
  const meterLevel = Math.max(
    0,
    Math.min(1, (meterDb - METER_FLOOR) / -METER_FLOOR),
  );
  const hot = recording && meterDb > HOT_DB;

  async function toggleRecord() {
    if (recording) {
      await recorder.stop();
      const uri = recorder.uri;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const durationSec = (Date.now() - recordStartRef.current) / 1000;
      // Drop accidental sub-1-second takes (a quick double-tap of Record)
      // instead of filing a 0:00 stub in the practice log — matches web.
      if (durationSec < 1) {
        Alert.alert(
          'Recording too short',
          'Hold Record for at least a second to capture a take.',
        );
        return;
      }
      if (uri) {
        setTakes((t) => [
          ...t,
          {
            id: `t_${Date.now()}`,
            uri,
            durationSec,
            saved: false,
          },
        ]);
      }
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Microphone needed',
        'Allow microphone access in Settings to record.',
      );
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStartRef.current = Date.now();
    } catch (e) {
      Alert.alert(
        'Could not start recording',
        e instanceof Error ? e.message : 'Please try again.',
      );
    }
  }

  function playTake(take: Take) {
    if (activeTakeId !== take.id) {
      player.replace({ uri: take.uri });
      setActiveTakeId(take.id);
    } else {
      player.seekTo(0);
    }
    player.setPlaybackRate(rate, 'high');
    player.play();
  }

  function changeRate(r: number) {
    setRate(r);
    player.setPlaybackRate(r, 'high');
  }

  async function saveTake(take: Take) {
    if (!target) return;
    if (!session) {
      setSignInOpen(true);
      return;
    }
    setSavingId(take.id);
    try {
      await saveRecording(target, take.uri, take.durationSec);
      setTakes((ts) =>
        ts.map((t) => (t.id === take.id ? { ...t, saved: true } : t)),
      );
    } catch (e) {
      Alert.alert(
        'Could not save recording',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <View style={styles.panel}>
      <Pressable
        onPress={toggleRecord}
        style={[
          styles.recordBtn,
          { backgroundColor: recording ? Palette.danger : Palette.danger },
        ]}>
        <View
          style={recording ? styles.stopGlyph : styles.recordGlyph}
        />
        <ThemedText style={styles.recordLabel}>
          {recording
            ? `Stop · ${fmt((Date.now() - recordStartRef.current) / 1000)}`
            : 'Record'}
        </ThemedText>
      </Pressable>

      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            {
              width: `${(recording ? meterLevel : 0) * 100}%`,
              backgroundColor: hot ? Palette.danger : Palette.success,
            },
          ]}
        />
      </View>
      <ThemedText style={[styles.meterNote, { color: hot ? Palette.danger : C.icon }]}>
        {hot
          ? 'Too loud — move the iPad back or play softer'
          : 'Input level'}
      </ThemedText>

      <View style={styles.speedRow}>
        <ThemedText style={[styles.speedLabel, { color: C.icon }]}>
          Playback speed
        </ThemedText>
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
        {takes.length === 0 ? (
          <ThemedText style={[styles.empty, { color: C.icon }]}>
            No takes yet. Tap Record to capture one.
          </ThemedText>
        ) : (
          takes.map((take, i) => {
            const isActive = activeTakeId === take.id;
            const isPlaying = isActive && playerStatus.playing;
            return (
              <View
                key={take.id}
                style={[styles.takeRow, { borderColor: C.icon + '33' }]}>
                <Pressable
                  onPress={() => (isPlaying ? player.pause() : playTake(take))}
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
                  <ThemedText style={[styles.savedTag, { color: Palette.success }]}>
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

      {!target && takes.length > 0 && (
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
  panel: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    borderRadius: Radii.lg,
  },
  recordGlyph: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },
  stopGlyph: { width: 14, height: 14, borderRadius: 3, backgroundColor: '#fff' },
  recordLabel: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  meterTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00000022',
    overflow: 'hidden',
  },
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
