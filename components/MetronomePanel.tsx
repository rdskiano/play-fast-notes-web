// Metronome controls for the ToolDock floating card, styled as a small
// physical device — a graphite body with a recessed BPM readout and
// raised, shadowed buttons, rather than a flat UI card. Fixed palette
// (DEVICE), independent of the app light/dark theme.
//
// Layout, top to bottom:
//   1. volume bar
//   2. a centered row of per-beat dots — tap to cycle silent → click →
//      accented click (grey / orange / orange-with-">")
//   3. the tempo cluster — − / + flanking the recessed BPM readout, a
//      tap-tempo (or strategy NEXT) button, then a function strip of three
//      chips: DRONE (pitch) · RHYTHMS (grooves) · GAPS (random dropper).
//      Each opens a centered overlay, glows when active, and shows its set
//      value inline. The three are mutually exclusive — turning one on
//      clears the others.
//   4. a bottom row — meter (left), play (center, large), subdivision
//      (right), evenly spaced
//
// Owns its own useMetronome instance — on a score-viewing screen the
// metronome is a free-standing practice aid, not driven by a strategy.

import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { NoteValueGlyph, type NoteValue } from '@/components/NoteValueGlyph';
import { ThemedText } from '@/components/themed-text';
import { VolumeSlider } from '@/components/VolumeSlider';
import { getGroove, groovesForMeter } from '@/lib/audio/grooves';
import { Spacing, Type } from '@/constants/tokens';
import type {
  BeatState,
  MetronomeApi,
  Subdivision,
} from '@/lib/audio/useMetronome';

// The metronome's own colour identity — also used as the ToolDock card
// body / border in PracticeToolsLayer.
export const DEVICE = {
  body: '#5e626b', // graphite card body
  display: '#15161a', // recessed BPM readout
  cap: '#71767f', // raised button face (lighter than the body)
  rim: '#494c54', // card border, control outlines, divider
  text: '#f4f1ec', // warm off-white
  dim: '#b7bac0', // dim labels
  accent: '#ec8b34', // orange — clicks + play + rhythms
  stop: '#d24b3e', // running / stop
  mute: '#43464d', // a silent beat dot (darker than the body)
  tone: '#3aa6b8', // cool teal — the drone (pitch, not rhythm)
  gap: '#9b86e0', // violet — the Gaps random-dropper
};

const BPM_MIN = 30;
const BPM_MAX = 240;

// Drone-click pitch range (MIDI) and the A4 tuning references.
const DRONE_LO = 36; // C2
const DRONE_HI = 84; // C6
const A4_OPTIONS = [440, 441, 442];
const NOTE_NAMES = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
];

function noteName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

const METERS = [
  '1/4',
  '2/4',
  '3/4',
  '4/4',
  '5/4',
  '3/8',
  '5/8',
  '6/8',
  '9/8',
  '12/8',
];

type MeterKind = 'simple' | 'compound' | 'odd8';
type SubOption = { value: Subdivision; label: string };
// Simple meters (x/4) — the beat is a quarter note.
const SIMPLE_SUBS: SubOption[] = [
  { value: 1, label: 'Quarter note' },
  { value: 2, label: 'Two eighth notes' },
  { value: 3, label: 'Triplet' },
  { value: 4, label: 'Four sixteenth notes' },
];
// Compound meters (x/8, numerator ÷ 3) — the beat is a dotted quarter.
const COMPOUND_SUBS: SubOption[] = [
  { value: 1, label: 'Dotted quarter' },
  { value: 3, label: 'Three eighth notes' },
];
// Asymmetric x/8 meters (e.g. 5/8) — each eighth note is its own beat.
const EIGHTH_SUBS: SubOption[] = [
  { value: 1, label: 'Eighth note' },
  { value: 2, label: 'Two sixteenth notes' },
];

// Tapping a beat cycles through these in order.
const CYCLE: BeatState[] = ['accent', 'normal', 'mute'];

// Beat dots size themselves to fill one row at this content width.
const BEAT_ROW_WIDTH = 244;
const BEAT_GAP = 8;

// x/4 = simple; x/8 with numerator ÷ 3 = compound (dotted-quarter beats);
// any other x/8 (5/8, 7/8…) = an asymmetric eighth-pulse meter.
function meterKind(label: string): MeterKind {
  const [numStr, denStr] = label.split('/');
  const num = parseInt(numStr, 10) || 4;
  if (denStr !== '8') return 'simple';
  return num % 3 === 0 ? 'compound' : 'odd8';
}

// Beat count = the dots shown. Compound meters group eighths into
// dotted-quarter beats (numerator / 3); everything else uses the numerator.
function meterBeats(label: string): number {
  const [numStr, denStr] = label.split('/');
  const num = parseInt(numStr, 10) || 4;
  if (denStr === '8' && num % 3 === 0) return Math.max(1, num / 3);
  return Math.max(1, num);
}

function subsFor(kind: MeterKind): SubOption[] {
  if (kind === 'compound') return COMPOUND_SUBS;
  if (kind === 'odd8') return EIGHTH_SUBS;
  return SIMPLE_SUBS;
}

function noteValueFor(sub: Subdivision, kind: MeterKind): NoteValue {
  if (kind === 'compound') return sub === 1 ? 'dottedQuarter' : 'eighths3';
  if (kind === 'odd8') return sub === 1 ? 'eighth' : 'sixteenths2';
  if (sub === 1) return 'quarter';
  if (sub === 2) return 'eighths2';
  if (sub === 3) return 'triplet';
  return 'sixteenths4';
}

export function MetronomePanel({
  metronome: m,
  note,
  onNext,
  meter: meterProp,
  onMeterChange,
  beatPattern: beatPatternProp,
  onBeatPatternChange,
}: {
  metronome: MetronomeApi;
  note?: string;
  // When a practice strategy provides a "next" action, the tap-tempo
  // button is replaced by a green Next button — the in-context advance.
  onNext?: () => void;
  // Optional controlled meter + beat pattern. The phone docked panel lives in
  // a Modal that unmounts when collapsed, so its host (PracticeToolsLayer)
  // lifts this state up so it survives the remount. Falls back to local state
  // when not supplied (every other usage).
  meter?: string;
  onMeterChange?: (meter: string) => void;
  beatPattern?: BeatState[];
  onBeatPatternChange?: Dispatch<SetStateAction<BeatState[]>>;
}) {
  // Default to even beats — no beat-one accent. The user adds accents
  // (or mutes) by tapping the per-beat dots.
  const [meterLocal, setMeterLocal] = useState('4/4');
  const [beatPatternLocal, setBeatPatternLocal] = useState<BeatState[]>([
    'normal',
    'normal',
    'normal',
    'normal',
  ]);
  const meter = meterProp ?? meterLocal;
  const setMeter = onMeterChange ?? setMeterLocal;
  const beatPattern = beatPatternProp ?? beatPatternLocal;
  const setBeatPattern = onBeatPatternChange ?? setBeatPatternLocal;
  const [meterOpen, setMeterOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [droneOpen, setDroneOpen] = useState(false);
  const [rhythmsOpen, setRhythmsOpen] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false);

  // The DRONE / RHYTHMS / GAPS layers are mutually exclusive — each is its
  // own practice mode. Turning one on clears the other two so the metronome
  // is only ever doing one of: pitched drone, drum groove, or random gaps.
  function enableDrone(on: boolean) {
    m.setDroneEnabled(on);
    if (on) {
      m.setGroove(null);
      m.setDropChance(0);
    }
  }
  function pickGroove(id: string | null) {
    m.setGroove(id);
    if (id != null) {
      m.setDroneEnabled(false);
      m.setDropChance(0);
      if (!m.running) m.start();
    }
  }
  function setGaps(frac: number) {
    m.setDropChance(frac);
    if (frac > 0) {
      m.setGroove(null);
      m.setDroneEnabled(false);
      if (!m.running) m.start();
    }
  }

  // Push the pattern to the audio engine on mount and whenever it changes.
  useEffect(() => {
    m.setBeatPattern(beatPattern);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatPattern]);

  // BPM-bump indicator — a "↑ N" floats above the BPM readout when a
  // strategy explicitly opts in by calling setBpm(tempo, { animateBump:
  // true }). Today that's only the Interleaved Click-Up advance; every
  // other tempo change (Tempo Ladder, Serial Practice tempo restore,
  // manual ± / tap-tempo, session start) is deliberately silent. The
  // metronome exposes a `bump` signal whose `token` changes on each
  // animated bump, so we key the animation off that rather than guessing
  // from the BPM delta.
  const bumpAnim = useRef(new Animated.Value(0)).current;
  const [bumpDelta, setBumpDelta] = useState(0);
  useEffect(() => {
    if (m.bump.token === 0 || m.bump.delta <= 0) return;
    setBumpDelta(m.bump.delta);
    bumpAnim.setValue(0);
    Animated.sequence([
      Animated.timing(bumpAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.delay(600),
      Animated.timing(bumpAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [m.bump.token, m.bump.delta, bumpAnim]);

  // Tap-for-tempo: average the gaps between recent taps.
  const tapsRef = useRef<number[]>([]);
  function onTapTempo() {
    const now = Date.now();
    const taps = tapsRef.current;
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      let sum = 0;
      for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
      const avg = sum / (taps.length - 1);
      if (avg > 0) m.setBpm(Math.round(60000 / avg));
    }
  }

  function chooseMeter(label: string) {
    setMeterOpen(false);
    const beats = meterBeats(label);
    setMeter(label);
    setBeatPattern((prev) => {
      const next = prev.slice(0, beats);
      while (next.length < beats) next.push('normal');
      return next;
    });
    // If the current subdivision isn't valid for the new meter, reset it.
    const subs = subsFor(meterKind(label));
    if (!subs.some((s) => s.value === m.subdivision)) m.setSubdivision(1);
    // Grooves are meter-specific — drop the active one when the meter changes
    // so the click comes back rather than a pattern that no longer matches.
    if (m.activeGroove != null) m.setGroove(null);
  }

  function cycleBeat(i: number) {
    setBeatPattern((prev) => {
      const next = prev.slice();
      const cur = next[i] ?? 'normal';
      next[i] = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      return next;
    });
  }

  const dotSize = Math.max(
    14,
    Math.min(
      26,
      Math.floor(
        (BEAT_ROW_WIDTH - (beatPattern.length - 1) * BEAT_GAP) /
          beatPattern.length,
      ),
    ),
  );

  const subOptions = subsFor(meterKind(meter));
  // On phone the metronome card eats roughly half the visible score
  // when popped out. Hiding the long instructional `note` strip
  // recovers the vertical space — the controls below are
  // self-explanatory and the user can collapse the card to read the
  // strategy's hints back at the practice screen if needed.
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;

  return (
    <View style={styles.root}>
      {note && !isPhone ? (
        <View style={styles.note}>
          <ThemedText style={styles.noteText}>{note}</ThemedText>
        </View>
      ) : null}

      {/* 1 — volume */}
      <View style={styles.volumeRow}>
        <ThemedText style={styles.volLabel}>VOL</ThemedText>
        <VolumeSlider
          value={m.volume}
          onChange={m.setVolume}
          minimumTrackTintColor={DEVICE.text}
          maximumTrackTintColor={DEVICE.rim}
          thumbTintColor={DEVICE.text}
          staircase
        />
      </View>

      {/* 2 — beat dots. grey = silent, orange = click, orange + ">" =
          accented (higher-pitched) click. */}
      <View style={styles.beatRow}>
        {beatPattern.map((state, i) => (
          <Pressable
            key={i}
            onPress={() => cycleBeat(i)}
            hitSlop={6}
            style={[
              styles.beatDot,
              { width: dotSize, height: dotSize, borderRadius: dotSize / 2 },
              state === 'mute'
                ? { backgroundColor: DEVICE.mute }
                : [styles.raised, { backgroundColor: DEVICE.accent }],
            ]}>
            {state === 'accent' && (
              <ThemedText
                style={[
                  styles.beatAccent,
                  {
                    fontSize: Math.round(dotSize * 0.62),
                    lineHeight: Math.round(dotSize * 0.62),
                  },
                ]}>
                {'>'}
              </ThemedText>
            )}
          </Pressable>
        ))}
      </View>

      {/* 3 — tempo cluster */}
      <View style={styles.tempoBlock}>
        <View style={styles.tempoRow}>
          <Pressable
            onPress={() => m.setBpm(Math.max(BPM_MIN, m.bpm - 1))}
            onLongPress={() => m.setBpm(Math.max(BPM_MIN, m.bpm - 5))}
            style={[styles.stepBtn, styles.raised]}>
            <ThemedText style={styles.stepGlyph}>−</ThemedText>
          </Pressable>
          <View style={styles.display}>
            <ThemedText style={styles.bpmNum}>{m.bpm}</ThemedText>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.bumpOverlay,
                {
                  opacity: bumpAnim,
                  transform: [
                    {
                      scale: bumpAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1.3, 1],
                      }),
                    },
                  ],
                },
              ]}>
              <ThemedText style={styles.bumpText}>+{bumpDelta}</ThemedText>
            </Animated.View>
          </View>
          <Pressable
            onPress={() => m.setBpm(Math.min(BPM_MAX, m.bpm + 1))}
            onLongPress={() => m.setBpm(Math.min(BPM_MAX, m.bpm + 5))}
            style={[styles.stepBtn, styles.raised]}>
            <ThemedText style={styles.stepGlyph}>+</ThemedText>
          </Pressable>
        </View>
        {/* NEXT when a strategy supplies it, otherwise TAP TEMPO. */}
        <View style={styles.actionRow}>
          {onNext ? (
            <Pressable onPress={onNext} style={[styles.nextBtn, styles.raised]}>
              <ThemedText style={styles.nextText}>NEXT →</ThemedText>
            </Pressable>
          ) : (
            <Pressable onPress={onTapTempo} style={[styles.tapBtn, styles.raised]}>
              <ThemedText style={styles.tapText}>TAP TEMPO</ThemedText>
            </Pressable>
          )}
        </View>

        {/* Function strip — the three optional layers. Each opens its own
            overlay, glows in its own colour when active (teal = pitch, orange
            = rhythm, violet = gaps), and shows its set value inline. */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => setDroneOpen(true)}
            style={[
              styles.fnChip,
              styles.raised,
              m.droneEnabled && { backgroundColor: DEVICE.tone },
            ]}>
            <ThemedText
              numberOfLines={1}
              style={[styles.fnChipText, m.droneEnabled && { color: '#fff' }]}>
              {m.droneEnabled ? noteName(m.droneMidi) : 'DRONE'}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setRhythmsOpen(true)}
            style={[
              styles.fnChip,
              styles.raised,
              m.activeGroove != null && { backgroundColor: DEVICE.accent },
            ]}>
            <ThemedText
              numberOfLines={1}
              style={[styles.fnChipText, m.activeGroove != null && { color: '#fff' }]}>
              {m.activeGroove != null
                ? getGroove(m.activeGroove)?.name ?? 'RHYTHMS'
                : 'RHYTHMS'}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setGapsOpen(true)}
            style={[
              styles.fnChip,
              styles.raised,
              m.dropChance > 0 && { backgroundColor: DEVICE.gap },
            ]}>
            <ThemedText
              numberOfLines={1}
              style={[styles.fnChipText, m.dropChance > 0 && { color: '#fff' }]}>
              {m.dropChance > 0 ? `${Math.round(m.dropChance * 100)}%` : 'GAPS'}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.divider} />

      {/* 4 — meter (left), play (centre), subdivision (right) */}
      <View style={styles.bottomRow}>
        <Pressable
          onPress={() => setMeterOpen(true)}
          style={[styles.pickBtn, styles.raised]}>
          <ThemedText style={styles.pickText}>{meter}</ThemedText>
        </Pressable>
        <Pressable
          onPress={m.toggle}
          style={[
            styles.playBtn,
            { backgroundColor: m.running ? DEVICE.stop : DEVICE.accent },
          ]}>
          <ThemedText
            style={[styles.playGlyph, !m.running && styles.playGlyphTriangle]}>
            {m.running ? '■' : '▶'}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setSubOpen(true)}
          style={[styles.pickBtn, styles.raised]}>
          <NoteValueGlyph
            value={noteValueFor(m.subdivision, meterKind(meter))}
            color={DEVICE.text}
          />
        </Pressable>
      </View>

      <ActionSheet
        visible={meterOpen}
        title="Time signature"
        items={METERS.map((label) => ({
          label,
          onPress: () => chooseMeter(label),
        }))}
        onCancel={() => setMeterOpen(false)}
      />
      <ActionSheet
        visible={subOpen}
        title="Subdivision"
        items={subOptions.map((s) => ({
          label: s.label,
          onPress: () => {
            setSubOpen(false);
            m.setSubdivision(s.value);
          },
        }))}
        onCancel={() => setSubOpen(false)}
      />

      <DroneOverlay
        visible={droneOpen}
        m={m}
        onToggle={enableDrone}
        onClose={() => setDroneOpen(false)}
      />

      <RhythmsOverlay
        visible={rhythmsOpen}
        m={m}
        meter={meter}
        onPick={pickGroove}
        onClose={() => setRhythmsOpen(false)}
      />

      <GapsOverlay
        visible={gapsOpen}
        m={m}
        onSet={setGaps}
        onClose={() => setGapsOpen(false)}
      />
    </View>
  );
}

// Drone-click configuration — a centred modal, so it gets room independent
// of the (compact, draggable, pinch-scalable) metronome card. Picks the
// drone pitch, sustain length, and A4 reference, with a master on/off.
function DroneOverlay({
  visible,
  m,
  onToggle,
  onClose,
}: {
  visible: boolean;
  m: MetronomeApi;
  onToggle: (on: boolean) => void;
  onClose: () => void;
}) {
  function stepMidi(delta: number) {
    const next = Math.max(DRONE_LO, Math.min(DRONE_HI, m.droneMidi + delta));
    if (next !== m.droneMidi) m.setDroneMidi(next);
  }

  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.droneBackdrop} onPress={onClose}>
        <Pressable
          style={styles.droneCard}
          onPress={(e) => e.stopPropagation()}>
          <View style={styles.overlayHeader}>
            <ThemedText style={styles.overlayTitle}>Drone click</ThemedText>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={[styles.doneBtn, styles.raised]}>
              <ThemedText style={styles.doneText}>Done</ThemedText>
            </Pressable>
          </View>

          <View style={styles.droneRow}>
            <ThemedText style={styles.droneRowLabel}>DRONE TONE</ThemedText>
            <Pressable
              onPress={() => onToggle(!m.droneEnabled)}
              style={[
                styles.onOff,
                styles.raised,
                {
                  backgroundColor: m.droneEnabled ? DEVICE.tone : DEVICE.mute,
                },
              ]}>
              <ThemedText style={styles.onOffText}>
                {m.droneEnabled ? 'ON' : 'OFF'}
              </ThemedText>
            </Pressable>
          </View>

          <ThemedText style={styles.droneSectionLabel}>PITCH</ThemedText>
          <View style={styles.pitchRow}>
            <Pressable
              onPress={() => stepMidi(-1)}
              onLongPress={() => stepMidi(-12)}
              style={[styles.stepBtn, styles.raised]}>
              <ThemedText style={styles.stepGlyph}>−</ThemedText>
            </Pressable>
            <View style={styles.pitchDisplay}>
              <ThemedText style={styles.pitchName}>
                {noteName(m.droneMidi)}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => stepMidi(1)}
              onLongPress={() => stepMidi(12)}
              style={[styles.stepBtn, styles.raised]}>
              <ThemedText style={styles.stepGlyph}>+</ThemedText>
            </Pressable>
          </View>

          <ThemedText style={styles.droneSectionLabel}>SUSTAIN</ThemedText>
          <View style={styles.sustainRow}>
            <VolumeSlider
              value={m.droneSustain}
              onChange={m.setDroneSustain}
              minimumTrackTintColor={DEVICE.tone}
              maximumTrackTintColor={DEVICE.rim}
              thumbTintColor={DEVICE.text}
              staircase
            />
          </View>
          <ThemedText style={styles.droneHint}>
            Short = a pitched blip each beat. Long = a continuous drone.
          </ThemedText>

          <ThemedText style={styles.droneSectionLabel}>
            REFERENCE PITCH (A4)
          </ThemedText>
          <View style={styles.a4Row}>
            {A4_OPTIONS.map((hz) => {
              const sel = m.droneA4 === hz;
              return (
                <Pressable
                  key={hz}
                  onPress={() => m.setDroneA4(hz)}
                  style={[
                    styles.a4Btn,
                    styles.raised,
                    { backgroundColor: sel ? DEVICE.tone : DEVICE.cap },
                  ]}>
                  <ThemedText
                    style={[
                      styles.a4Text,
                      { color: sel ? '#fff' : DEVICE.text },
                    ]}>
                    {hz}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Rhythms picker — a centred modal listing drum-machine grooves for the
// current meter. Selecting one replaces the plain click with that groove at
// the current tempo (and starts playback if stopped). "Just the click"
// clears it. Stays open so the user can audition grooves.
function RhythmsOverlay({
  visible,
  m,
  meter,
  onPick,
  onClose,
}: {
  visible: boolean;
  m: MetronomeApi;
  meter: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const grooves = groovesForMeter(meter);
  // Cap the list height so it never runs off a short screen (phone landscape)
  // — it scrolls beyond that.
  const { height: vpH } = useWindowDimensions();

  function pick(id: string | null) {
    onPick(id);
  }

  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.droneBackdrop} onPress={onClose}>
        <Pressable style={styles.droneCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.overlayHeader}>
            <ThemedText style={styles.overlayTitle}>Rhythms · {meter}</ThemedText>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.doneBtn, styles.raised]}>
              <ThemedText style={styles.doneText}>Done</ThemedText>
            </Pressable>
          </View>

          {grooves.length === 0 ? (
            <ThemedText style={styles.droneHint}>
              No rhythms for {meter} yet. Try 4/4, 3/4, or 6/8.
            </ThemedText>
          ) : (
            <>
              <ScrollView
                style={{ maxHeight: Math.max(150, vpH * 0.5) }}
                contentContainerStyle={styles.grooveList}>
                <Pressable
                  onPress={() => pick(null)}
                  style={[
                    styles.grooveRow,
                    styles.raised,
                    { backgroundColor: m.activeGroove == null ? DEVICE.accent : DEVICE.cap },
                  ]}>
                  <ThemedText
                    style={[
                      styles.grooveName,
                      { color: m.activeGroove == null ? '#fff' : DEVICE.text },
                    ]}>
                    Just the click
                  </ThemedText>
                </Pressable>
                {grooves.map((g) => {
                  const sel = m.activeGroove === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => pick(g.id)}
                      style={[
                        styles.grooveRow,
                        styles.raised,
                        { backgroundColor: sel ? DEVICE.accent : DEVICE.cap },
                      ]}>
                      <ThemedText
                        style={[styles.grooveName, { color: sel ? '#fff' : DEVICE.text }]}>
                        {g.name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <ThemedText style={styles.droneHint}>
                Plays at your current tempo. Change the meter for other styles.
              </ThemedText>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// The Gaps levels — 10 % … 80 % of beats dropped. 0 (Off) is the absence of
// any lit segment, set via the Off pill.
const GAP_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

// Gaps picker — a centred modal with a big percentage readout and a stepped
// bar. Picking a level silences that share of beats at random (beat 1
// included, no visual tell); "Off" brings every click back. Its own
// standalone mode — selecting it clears any drone / groove (see setGaps).
function GapsOverlay({
  visible,
  m,
  onSet,
  onClose,
}: {
  visible: boolean;
  m: MetronomeApi;
  onSet: (frac: number) => void;
  onClose: () => void;
}) {
  const pct = Math.round(m.dropChance * 100);
  return (
    <Modal
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.droneBackdrop} onPress={onClose}>
        <Pressable style={styles.droneCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.overlayHeader}>
            <ThemedText style={styles.overlayTitle}>Random gaps</ThemedText>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.doneBtn, styles.raised]}>
              <ThemedText style={styles.doneText}>Done</ThemedText>
            </Pressable>
          </View>

          <View style={styles.gapDisplay}>
            <ThemedText style={styles.gapPct}>{pct > 0 ? `${pct}%` : 'OFF'}</ThemedText>
            <ThemedText style={styles.gapPctLabel}>OF BEATS DROPPED</ThemedText>
          </View>

          <View style={styles.gapBar}>
            {GAP_LEVELS.map((level) => {
              const active = m.dropChance >= level - 0.0001;
              return (
                <Pressable
                  key={level}
                  onPress={() => onSet(level)}
                  hitSlop={4}
                  style={[
                    styles.gapSeg,
                    { backgroundColor: active ? DEVICE.gap : DEVICE.mute },
                  ]}
                />
              );
            })}
          </View>

          <Pressable
            onPress={() => onSet(0)}
            style={[
              styles.offPill,
              styles.raised,
              { backgroundColor: m.dropChance === 0 ? DEVICE.gap : DEVICE.cap },
            ]}>
            <ThemedText
              style={[
                styles.offPillText,
                { color: m.dropChance === 0 ? '#fff' : DEVICE.text },
              ]}>
              Off
            </ThemedText>
          </Pressable>

          <ThemedText style={styles.droneHint}>
            Randomly silences this share of beats — beat 1 included — so you keep
            time on your own. The click never shows which beats it drops.
          </ThemedText>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 18, gap: 14, justifyContent: 'center' },

  note: {
    backgroundColor: DEVICE.display,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noteText: {
    color: DEVICE.dim,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: Type.weight.semibold,
    textAlign: 'center',
  },

  // Drop shadow that makes a control read as raised off the body.
  raised: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  // paddingLeft keeps the "VOL" label clear of the ToolDock collapse × that
  // floats in the card's top-left corner — without it the × sits on top of the
  // label whenever the volume row is the first row (e.g. no note strip above).
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingLeft: 22 },
  volLabel: {
    fontSize: 10,
    fontWeight: Type.weight.bold,
    letterSpacing: 1,
    color: DEVICE.dim,
  },

  beatRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: BEAT_GAP,
    height: 28,
  },
  beatDot: { alignItems: 'center', justifyContent: 'center' },
  beatAccent: { color: '#fff', fontWeight: '900', textAlign: 'center' },

  tempoBlock: { gap: 10, alignItems: 'center' },
  tempoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  actionRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: DEVICE.cap,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: {
    fontSize: 24,
    fontWeight: Type.weight.bold,
    lineHeight: 28,
    color: DEVICE.text,
  },
  display: {
    minWidth: 120,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: DEVICE.display,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bumpOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    backgroundColor: DEVICE.display,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bumpText: {
    color: DEVICE.text,
    fontSize: 46,
    lineHeight: 50,
    fontWeight: Type.weight.black,
    fontVariant: ['tabular-nums'],
  },
  bpmNum: {
    fontSize: 46,
    fontWeight: Type.weight.black,
    lineHeight: 50,
    color: DEVICE.text,
    fontVariant: ['tabular-nums'],
  },
  tapBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: DEVICE.cap,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapText: {
    fontSize: 12,
    fontWeight: Type.weight.heavy,
    letterSpacing: 1.2,
    color: DEVICE.text,
  },
  // A function-strip chip (DRONE / RHYTHMS / GAPS). Same raised cap as the
  // tap button but compact, so three sit across the card.
  fnChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: DEVICE.cap,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fnChipText: {
    fontSize: 11.5,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.6,
    color: DEVICE.text,
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: '#2ecc71',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: {
    fontSize: 14,
    fontWeight: Type.weight.black,
    letterSpacing: 0.5,
    color: '#fff',
  },

  divider: { height: 1, alignSelf: 'stretch', backgroundColor: DEVICE.rim },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickBtn: {
    width: 64,
    height: 44,
    borderRadius: 12,
    backgroundColor: DEVICE.cap,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickText: {
    fontSize: 16,
    fontWeight: Type.weight.heavy,
    color: DEVICE.text,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
  playGlyph: { color: '#fff', fontSize: 26, fontWeight: Type.weight.black },
  // The ▶ glyph's ink is biased to the left of its character box, so it reads
  // as off-centre inside the round button. Nudge it right to optically centre
  // it. The ■ stop glyph is symmetric and needs no offset.
  playGlyphTriangle: { transform: [{ translateX: 2 }] },

  droneBackdrop: {
    flex: 1,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  droneCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: DEVICE.body,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    padding: 22,
    gap: 14,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grooveList: { gap: 10, paddingVertical: 2 },
  grooveRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DEVICE.rim,
  },
  grooveName: {
    fontSize: 15,
    fontWeight: Type.weight.bold,
    textAlign: 'center',
  },
  overlayTitle: {
    fontSize: 17,
    fontWeight: Type.weight.black,
    color: DEVICE.text,
  },
  doneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: DEVICE.cap,
    borderWidth: 1,
    borderColor: DEVICE.rim,
  },
  doneText: { fontSize: 13, fontWeight: Type.weight.heavy, color: DEVICE.text },

  droneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  droneRowLabel: {
    fontSize: 11,
    fontWeight: Type.weight.bold,
    letterSpacing: 1,
    color: DEVICE.dim,
  },
  onOff: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    minWidth: 66,
    alignItems: 'center',
  },
  onOffText: { fontSize: 14, fontWeight: Type.weight.black, color: '#fff' },

  droneSectionLabel: {
    fontSize: 10,
    fontWeight: Type.weight.bold,
    letterSpacing: 1,
    color: DEVICE.dim,
    marginTop: 2,
  },
  pitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  pitchDisplay: {
    minWidth: 150,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: DEVICE.display,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pitchName: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: Type.weight.black,
    color: DEVICE.text,
    fontVariant: ['tabular-nums'],
  },
  sustainRow: { flexDirection: 'row', alignItems: 'center' },
  droneHint: {
    fontSize: 11,
    lineHeight: 15,
    color: DEVICE.dim,
  },
  a4Row: { flexDirection: 'row', gap: 8 },
  a4Btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    alignItems: 'center',
  },
  a4Text: { fontSize: 17, fontWeight: Type.weight.heavy },

  // ── Gaps overlay ─────────────────────────────────────────────────────
  gapDisplay: {
    backgroundColor: DEVICE.display,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DEVICE.rim,
    paddingVertical: 12,
    alignItems: 'center',
  },
  gapPct: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: Type.weight.black,
    color: DEVICE.text,
    fontVariant: ['tabular-nums'],
  },
  gapPctLabel: {
    fontSize: 10,
    fontWeight: Type.weight.bold,
    letterSpacing: 1,
    color: DEVICE.dim,
    marginTop: 2,
  },
  gapBar: { flexDirection: 'row', gap: 6, height: 36, alignItems: 'stretch' },
  gapSeg: { flex: 1, borderRadius: 6 },
  offPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DEVICE.rim,
  },
  offPillText: { fontSize: 13, fontWeight: Type.weight.heavy },
});
