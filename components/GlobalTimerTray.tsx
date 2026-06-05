import { usePathname, useRouter } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PassagePickerModal } from '@/components/PassagePickerModal';
import {
  useBodyMoveTimer,
  useMicrobreakTimer,
  useMoveOnTimer,
  usePlayItColdTimer,
} from '@/components/PracticeTimersContext';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getSnapshot as getSerialSnapshot,
  isSerialPracticeActive,
  nextPassage as advanceSerialPassage,
  subscribe as subscribeSerial,
} from '@/lib/sessions/serialPractice';

const TIMER_INFO: { icon: string; title: string; body: string }[] = [
  {
    icon: '⏱',
    title: 'Rotate Timer',
    body:
      'Prevents mindless, repetitive practice. When the timer fires, switch to a completely different section — being forced to rotate sharpens focus and trains your memory to recall exactly what you were working on when you return. Use it when you tend to zone out or over-drill one spot.',
  },
  {
    icon: '🧠',
    title: 'Micro Timer',
    body:
      "New motor skills consolidate during short rests, not during playing. When you pause, your brain replays the passage up to 20× faster and actually locks in the improvement. In Tempo Ladder, micro-rests fire every 3 clean reps. In Interleaved Click-Up, every 10 reps.",
  },
  {
    icon: '❄️',
    title: 'Cold Timer',
    body:
      "Performances and auditions only give you one take. This timer interrupts whatever you're doing to make you perform your chosen spot once, no restarts — building the skill of nailing it on the first try under pressure. Use it in the weeks leading up to a performance.",
  },
  {
    icon: '🚶',
    title: 'Break Timer',
    body:
      'A gentle nudge to step away from the instrument, stretch, and walk around every so often. Long, motionless practice sessions hurt your back and your concentration; brief movement breaks reset both. Different from Rotate — that one swaps passages without you leaving the chair.',
  },
];

type DeviceColors = {
  keyOn: string;
  keyOff: string;
  onText: string;
  offText: string;
  help: string;
};

type DotProps = {
  icon: string;
  label: string;
  enabled: boolean;
  device: DeviceColors;
  onPress: () => void;
};

// A timer toggle rendered as a small raised device key — lit (bright) when
// the timer is on, dark when off.
function TimerDot({ icon, label, enabled, device, onPress }: DotProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.timerKey,
        { backgroundColor: enabled ? device.keyOn : device.keyOff },
      ]}>
      <ThemedText style={styles.timerKeyIcon}>{icon}</ThemedText>
      <ThemedText
        style={[
          styles.timerKeyLabel,
          { color: enabled ? device.onText : device.offText },
        ]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

type PracticeTimersPillProps = {
  // When the parent screen has its own rotation timer (Serial Practice
  // Timer mode), we hide the Move On dot so the user is not faced with
  // two parallel "rotate" timers.
  hideMoveOn?: boolean;
  // `bare` drops the pill's background / border / shadow chrome so the
  // dots can sit inside another container (e.g. the Timer tool card).
  bare?: boolean;
  // Colour palette for sitting on a coloured "device" surface (the Timer
  // tool card). When omitted, theme colours are used.
  device?: DeviceColors;
};

export function PracticeTimersPill({
  hideMoveOn = false,
  bare = false,
  device,
}: PracticeTimersPillProps = {}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const dev: DeviceColors = device ?? {
    keyOn: C.tint,
    keyOff: C.icon + '22',
    onText: '#fff',
    offText: C.text,
    help: C.icon,
  };
  const router = useRouter();
  const pathname = usePathname();
  const [infoOpen, setInfoOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const moveOn = useMoveOnTimer();
  const microbreak = useMicrobreakTimer();
  const playItCold = usePlayItColdTimer();
  const bodyMove = useBodyMoveTimer();

  // Subscribe to the Serial Practice singleton so the pill auto-hides the
  // Move On dot while a session is active — including on the strategy
  // screens (Tempo Ladder, Click-Up, etc.) the user navigates to mid-session.
  const serialSession = useSyncExternalStore(
    subscribeSerial,
    getSerialSnapshot,
    () => null,
  );
  const moveOnHidden = hideMoveOn || isSerialPracticeActive();

  // Show a compact countdown chip inside the pill whenever a Serial Practice
  // Timer-mode session is running and we are NOT already on /interleaved
  // (which has its own inline bar at the bottom). Tap the chip to advance
  // and hop back to the Serial Practice screen.
  const showSerialChip =
    serialSession !== null &&
    serialSession.mode === 'timer' &&
    pathname !== '/interleaved';
  const chipExpired = serialSession?.timerExpired ?? false;
  const chipLabel = (() => {
    if (!serialSession) return '';
    const m = Math.floor(serialSession.secondsLeft / 60);
    const s = serialSession.secondsLeft % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  })();
  function onSerialChipPress() {
    advanceSerialPassage();
    router.replace('/interleaved' as never);
  }

  function toggleCold() {
    if (playItCold.config.enabled) {
      playItCold.setConfig({ enabled: false });
      return;
    }
    // Always ask which passage on each toggle-on — the previously chosen
    // pieceId is intentionally not reused, since the user may want to drop
    // in a different surprise passage each session.
    setPickerOpen(true);
  }

  return (
    <>
      <View
        style={
          bare
            ? styles.pillBare
            : [
                styles.pill,
                {
                  backgroundColor: scheme === 'dark' ? '#1f2123cc' : '#ffffffd0',
                  borderColor: C.icon + '55',
                },
              ]
        }>
        {showSerialChip && (
          <Pressable
            onPress={onSerialChipPress}
            hitSlop={6}
            style={[
              styles.serialChip,
              { backgroundColor: chipExpired ? '#c0392b' : C.tint },
            ]}>
            <ThemedText style={styles.serialChipText}>
              {chipExpired ? "Time's up · Next →" : `${chipLabel} · Next →`}
            </ThemedText>
          </Pressable>
        )}
        {/* Final user-facing names: Rotate (swap passages), Micro (short
            mental rest after reps), Cold (surprise performance), Break
            (stand up and physically move). The internal config keys
            (moveOn / microbreak / playItCold / bodyMove) keep their old
            engineering names so persisted user prefs survive the
            rename. */}
        {!moveOnHidden && (
          <TimerDot
            icon="⏱"
            label="Rotate"
            enabled={moveOn.config.enabled}
            device={dev}
            onPress={() =>
              moveOn.setConfig({ enabled: !moveOn.config.enabled })
            }
          />
        )}
        <TimerDot
          icon="🧠"
          label="Micro"
          enabled={microbreak.config.enabled}
          device={dev}
          onPress={() =>
            microbreak.setConfig({ enabled: !microbreak.config.enabled })
          }
        />
        <TimerDot
          icon="❄️"
          label="Cold"
          enabled={playItCold.config.enabled}
          device={dev}
          onPress={toggleCold}
        />
        <TimerDot
          icon="🚶"
          label="Break"
          enabled={bodyMove.config.enabled}
          device={dev}
          onPress={() =>
            bodyMove.setConfig({ enabled: !bodyMove.config.enabled })
          }
        />
        {/* Settings + Help look like dimmer siblings of the timer keys
            so the whole row reads as one uniform strip of controls
            (matching height + radius), instead of mixing tall keys with
            tiny circles like before. */}
        <Pressable
          onPress={() => setSettingsOpen(true)}
          hitSlop={6}
          accessibilityLabel="Timer settings"
          style={[styles.utilityKey, { backgroundColor: dev.keyOff }]}>
          <ThemedText style={[styles.utilityKeyText, { color: dev.help }]}>⚙</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setInfoOpen(true)}
          hitSlop={6}
          accessibilityLabel="Timer help"
          style={[styles.utilityKey, { backgroundColor: dev.keyOff }]}>
          <ThemedText style={[styles.utilityKeyText, { color: dev.help }]}>?</ThemedText>
        </Pressable>
      </View>

      <TimerInfoModal
        visible={infoOpen}
        hideMoveOn={moveOnHidden}
        onClose={() => setInfoOpen(false)}
      />

      <TimerSettingsModal
        visible={settingsOpen}
        hideMoveOn={moveOnHidden}
        onClose={() => setSettingsOpen(false)}
      />

      <PassagePickerModal
        visible={pickerOpen}
        selectedId={playItCold.config.pieceId}
        onClose={() => setPickerOpen(false)}
        onPick={(pieceId) => {
          playItCold.setConfig({ enabled: true, pieceId });
          setPickerOpen(false);
        }}
        title="Pick a Play-It-Cold passage"
      />
    </>
  );
}

// ── Timer settings (in-tool, no need to leave practice) ────────────────────
//
// A compact modal that mirrors the timer dots: each timer gets a row
// with an enable toggle and a chip-row picker for its primary numeric
// (interval-min for the rotation/movement timers; break-seconds for the
// microbreak). Lets the user tune timer behaviour without leaving the
// practice screen for the global /settings page.

const MOVE_ON_INTERVAL_OPTS = [1, 2, 3, 5, 10] as const;
const BODY_MOVE_INTERVAL_OPTS = [15, 20, 30, 45, 60] as const;
const MICROBREAK_SECONDS_OPTS = [8, 12, 20, 30] as const;
// Cold's interval range, as compact chip sets. The Library Settings page
// keeps fine-grained Steppers; these are the quick presets for the in-tool
// sheet.
const COLD_MIN_INTERVAL_OPTS = [2, 3, 5, 8, 10] as const;
const COLD_MAX_INTERVAL_OPTS = [5, 10, 15, 20, 30] as const;

function ChipRow<T extends number>({
  options,
  value,
  onChange,
  unit,
  disabled,
  prefix,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  unit: string;
  disabled?: boolean;
  // A small label rendered above the chips ("Fire every", "Rest for",
  // "Min interval", …) so the user can tell an interval from a duration.
  prefix?: string;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <View style={disabled ? { opacity: 0.4 } : undefined}>
      {prefix ? (
        <ThemedText style={[styles.chipPrefix, { color: C.icon }]}>
          {prefix}
        </ThemedText>
      ) : null}
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              disabled={disabled}
              style={[
                styles.chip,
                { borderColor: C.icon + '55' },
                active && { backgroundColor: C.tint, borderColor: C.tint },
              ]}>
              <ThemedText
                style={[
                  styles.chipText,
                  { color: active ? '#fff' : C.text },
                ]}>
                {opt}
                {unit}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ToggleRow({
  icon,
  title,
  subtitle,
  enabled,
  onToggle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <Pressable onPress={onToggle} style={styles.toggleRow}>
      <ThemedText style={styles.toggleIcon}>{icon}</ThemedText>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.toggleTitle}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText style={[styles.toggleSub, { color: C.icon }]}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <View
        style={[
          styles.toggleSwitch,
          {
            backgroundColor: enabled ? C.tint : C.icon + '44',
          },
        ]}>
        <View
          style={[
            styles.toggleKnob,
            { transform: [{ translateX: enabled ? 18 : 2 }] },
          ]}
        />
      </View>
    </Pressable>
  );
}

function TimerSettingsModal({
  visible,
  hideMoveOn = false,
  onClose,
}: {
  visible: boolean;
  hideMoveOn?: boolean;
  onClose: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const moveOn = useMoveOnTimer();
  const microbreak = useMicrobreakTimer();
  const playItCold = usePlayItColdTimer();
  const bodyMove = useBodyMoveTimer();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.infoBackdrop}>
          <View style={[styles.infoCard, { backgroundColor: C.background }]}>
            <ThemedText type="title" style={{ textAlign: 'center' }}>
              Timer settings
            </ThemedText>
            <ScrollView contentContainerStyle={{ gap: 18 }}>
              {!hideMoveOn && (
                <View style={styles.settingsBlock}>
                  <ToggleRow
                    icon="⏱"
                    title="Rotate"
                    subtitle="Switch passages on a schedule"
                    enabled={moveOn.config.enabled}
                    onToggle={() =>
                      moveOn.setConfig({ enabled: !moveOn.config.enabled })
                    }
                  />
                  <ChipRow
                    options={MOVE_ON_INTERVAL_OPTS}
                    value={
                      (MOVE_ON_INTERVAL_OPTS.find(
                        (v) => v === moveOn.config.intervalMin,
                      ) ?? MOVE_ON_INTERVAL_OPTS[2]) as (typeof MOVE_ON_INTERVAL_OPTS)[number]
                    }
                    onChange={(v) => moveOn.setConfig({ intervalMin: v })}
                    unit=" min"
                    prefix="Fire every"
                    disabled={!moveOn.config.enabled}
                  />
                </View>
              )}

              <View style={styles.settingsBlock}>
                <ToggleRow
                  icon="🧠"
                  title="Micro"
                  subtitle="Short rest after sets of clean reps"
                  enabled={microbreak.config.enabled}
                  onToggle={() =>
                    microbreak.setConfig({ enabled: !microbreak.config.enabled })
                  }
                />
                <ChipRow
                  options={MICROBREAK_SECONDS_OPTS}
                  value={
                    (MICROBREAK_SECONDS_OPTS.find(
                      (v) => v === microbreak.config.breakSeconds,
                    ) ?? MICROBREAK_SECONDS_OPTS[1]) as (typeof MICROBREAK_SECONDS_OPTS)[number]
                  }
                  onChange={(v) => microbreak.setConfig({ breakSeconds: v })}
                  unit=" s"
                  prefix="Rest for"
                  disabled={!microbreak.config.enabled}
                />
              </View>

              {/* Cold now lives in-tool too — no more round-trip to the
                  Library Settings page. Toggling it on with no passage yet
                  opens the picker first; we only flip `enabled` once a
                  passage is chosen. Order matches the pill: Rotate / Micro
                  / Cold / Break. */}
              <View style={styles.settingsBlock}>
                <ToggleRow
                  icon="❄️"
                  title="Cold"
                  subtitle="Surprise performance during practice"
                  enabled={playItCold.config.enabled}
                  onToggle={() => {
                    if (!playItCold.config.enabled && !playItCold.config.pieceId) {
                      setPickerOpen(true);
                      return;
                    }
                    playItCold.setConfig({ enabled: !playItCold.config.enabled });
                  }}
                />
                <ChipRow
                  options={COLD_MIN_INTERVAL_OPTS}
                  value={
                    (COLD_MIN_INTERVAL_OPTS.find(
                      (v) => v === playItCold.config.intervalMin,
                    ) ?? COLD_MIN_INTERVAL_OPTS[1]) as (typeof COLD_MIN_INTERVAL_OPTS)[number]
                  }
                  onChange={(v) => playItCold.setConfig({ intervalMin: v })}
                  unit=" min"
                  prefix="Min interval"
                  disabled={!playItCold.config.enabled}
                />
                <ChipRow
                  options={COLD_MAX_INTERVAL_OPTS}
                  value={
                    (COLD_MAX_INTERVAL_OPTS.find(
                      (v) => v === playItCold.config.intervalMax,
                    ) ?? COLD_MAX_INTERVAL_OPTS[1]) as (typeof COLD_MAX_INTERVAL_OPTS)[number]
                  }
                  onChange={(v) => playItCold.setConfig({ intervalMax: v })}
                  unit=" min"
                  prefix="Max interval"
                  disabled={!playItCold.config.enabled}
                />
                <View style={styles.coldPassageRow}>
                  <ThemedText style={[styles.coldPassageLabel, { color: C.icon }]}>
                    Passage
                  </ThemedText>
                  <Pressable
                    onPress={() => setPickerOpen(true)}
                    style={[styles.coldPickBtn, { borderColor: C.icon }]}>
                    <ThemedText
                      style={[styles.coldPickBtnText, { color: C.text }]}
                      numberOfLines={1}>
                      {playItCold.passage?.title ?? 'Pick a passage…'}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingsBlock}>
                <ToggleRow
                  icon="🚶"
                  title="Break"
                  subtitle="Get up, stretch, walk around"
                  enabled={bodyMove.config.enabled}
                  onToggle={() =>
                    bodyMove.setConfig({ enabled: !bodyMove.config.enabled })
                  }
                />
                <ChipRow
                  options={BODY_MOVE_INTERVAL_OPTS}
                  value={
                    (BODY_MOVE_INTERVAL_OPTS.find(
                      (v) => v === bodyMove.config.intervalMin,
                    ) ?? BODY_MOVE_INTERVAL_OPTS[1]) as (typeof BODY_MOVE_INTERVAL_OPTS)[number]
                  }
                  onChange={(v) => bodyMove.setConfig({ intervalMin: v })}
                  unit=" min"
                  prefix="Fire every"
                  disabled={!bodyMove.config.enabled}
                />
              </View>
            </ScrollView>
            <Button label="Close" onPress={onClose} />
          </View>
        </View>
      </Modal>

      <PassagePickerModal
        visible={pickerOpen}
        selectedId={playItCold.config.pieceId}
        onClose={() => setPickerOpen(false)}
        onPick={(pieceId) => {
          playItCold.setConfig({ enabled: true, pieceId });
          setPickerOpen(false);
        }}
        title="Pick a Play-It-Cold passage"
      />
    </>
  );
}

function TimerInfoModal({
  visible,
  hideMoveOn = false,
  onClose,
}: {
  visible: boolean;
  hideMoveOn?: boolean;
  onClose: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  // When the parent screen suppresses Rotate (Serial Practice modes), do
  // not advertise it in the help modal — it would confuse the user about
  // why the dot is missing.
  const entries = hideMoveOn
    ? TIMER_INFO.filter((t) => t.title !== 'Rotate Timer')
    : TIMER_INFO;
  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.infoBackdrop}>
        <View style={[styles.infoCard, { backgroundColor: C.background }]}>
          <ThemedText type="title" style={{ textAlign: 'center' }}>
            Practice timers
          </ThemedText>
          <ScrollView contentContainerStyle={{ gap: 14 }}>
            {entries.map((t) => (
              <View key={t.title} style={styles.infoRow}>
                <ThemedText style={styles.infoIcon}>{t.icon}</ThemedText>
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText style={styles.infoTitle}>{t.title}</ThemedText>
                  <ThemedText style={[styles.infoBody, { color: C.icon }]}>
                    {t.body}
                  </ThemedText>
                </View>
              </View>
            ))}
          </ScrollView>
          <Button label="Close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.pill,
    borderWidth: Borders.thin,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  pillBare: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Stay on ONE row across every device — the parent card is sized
    // to fit all six items (4 toggles + ⚙ + ?). Wrapping made the row
    // split into an asymmetric 3 + 3 that looked broken.
    flexWrap: 'nowrap',
    gap: 6,
  },
  timerKey: {
    width: 54,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  // Larger emoji so the icon is recognisable at a glance — the old 17px
  // was hard to read on retina displays from arm's length.
  timerKeyIcon: { fontSize: 24, lineHeight: 28 },
  timerKeyLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  dot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  dotCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: Borders.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotLabel: { fontSize: Type.size.xs, fontWeight: Type.weight.bold },
  helpBtn: { paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  // Utility key (⚙ / ?) — same height + radius as a timer key so the
  // row reads as one uniform strip, narrower because there's no label.
  utilityKey: {
    width: 38,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  utilityKeyText: { fontSize: 20, fontWeight: Type.weight.heavy, lineHeight: 22 },
  serialChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.md,
    marginRight: Spacing.xs,
  },
  serialChipText: {
    color: '#fff',
    fontSize: Type.size.xs,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
  },
  helpCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: Borders.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: { fontSize: 18, fontWeight: Type.weight.heavy, lineHeight: 21 },
  infoBackdrop: {
    flex: 1,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  infoCard: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: Radii['2xl'],
    padding: 20,
    gap: 14,
  },
  infoRow: { flexDirection: 'row', gap: Spacing.md },
  infoIcon: { fontSize: Type.size['3xl'], width: 34, textAlign: 'center' },
  infoTitle: { fontWeight: Type.weight.heavy, fontSize: 15 },
  infoBody: { fontSize: Type.size.sm, lineHeight: 18 },
  infoFooter: {
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },

  // Timer settings sheet
  settingsBlock: { gap: 8 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  toggleIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  toggleTitle: { fontWeight: Type.weight.heavy, fontSize: 15 },
  toggleSub: { fontSize: 12, lineHeight: 16 },
  toggleSwitch: {
    width: 38,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingLeft: 36,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
  },
  chipText: { fontSize: Type.size.sm, fontWeight: Type.weight.bold },
  chipPrefix: {
    fontSize: 12,
    fontWeight: Type.weight.semibold,
    paddingLeft: 36,
    paddingBottom: 4,
  },

  // Cold passage picker row inside the in-tool settings sheet.
  coldPassageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 36,
  },
  coldPassageLabel: {
    fontSize: 12,
    fontWeight: Type.weight.semibold,
    width: 60,
  },
  coldPickBtn: {
    flex: 1,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  coldPickBtnText: {
    fontWeight: Type.weight.semibold,
    fontSize: Type.size.sm,
  },
});
