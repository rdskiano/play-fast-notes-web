import { useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PassagePickerModal } from '@/components/PassagePickerModal';
import {
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
  subscribe as subscribeSerial,
} from '@/lib/sessions/serialPractice';

const TIMER_INFO: { icon: string; title: string; body: string }[] = [
  {
    icon: '⏱',
    title: 'Move On Timer',
    body:
      'Prevents mindless, repetitive practice. When the timer fires, switch to a completely different section — being forced to rotate sharpens focus and trains your memory to recall exactly what you were working on when you return. Use it when you tend to zone out or over-drill one spot.',
  },
  {
    icon: '🧠',
    title: 'Microbreak Timer',
    body:
      "New motor skills consolidate during short rests, not during playing. When you pause, your brain replays the passage up to 20× faster and actually locks in the improvement. In Tempo Ladder, breaks fire every 3 clean reps. In Interleaved Click-Up, every 10 reps.",
  },
  {
    icon: '❄️',
    title: 'Play It Cold Timer',
    body:
      "Performances and auditions only give you one take. This timer interrupts whatever you're doing to make you perform your chosen spot once, no restarts — building the skill of nailing it on the first try under pressure. Use it in the weeks leading up to a performance.",
  },
];

type DotProps = {
  icon: string;
  label: string;
  enabled: boolean;
  color: string;
  onPress: () => void;
};

function TimerDot({ icon, label, enabled, color, onPress }: DotProps) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.dot}>
      <View
        style={[
          styles.dotCircle,
          {
            backgroundColor: enabled ? color : 'transparent',
            borderColor: enabled ? color : color + '55',
          },
        ]}>
        <ThemedText style={{ fontSize: 14 }}>{icon}</ThemedText>
      </View>
      <ThemedText
        style={[
          styles.dotLabel,
          { color: enabled ? color : color + '99' },
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
};

export function PracticeTimersPill({ hideMoveOn = false }: PracticeTimersPillProps = {}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [infoOpen, setInfoOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const moveOn = useMoveOnTimer();
  const microbreak = useMicrobreakTimer();
  const playItCold = usePlayItColdTimer();

  // Subscribe to the Serial Practice singleton so the pill auto-hides the
  // Move On dot while a session is active — including on the strategy
  // screens (Tempo Ladder, Click-Up, etc.) the user navigates to mid-session.
  useSyncExternalStore(subscribeSerial, getSerialSnapshot, () => null);
  const moveOnHidden = hideMoveOn || isSerialPracticeActive();

  function toggleCold() {
    if (playItCold.config.enabled) {
      playItCold.setConfig({ enabled: false });
      return;
    }
    if (!playItCold.config.pieceId) {
      setPickerOpen(true);
      return;
    }
    playItCold.setConfig({ enabled: true });
  }

  return (
    <>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: scheme === 'dark' ? '#1f2123cc' : '#ffffffd0',
            borderColor: C.icon + '55',
          },
        ]}>
        {!moveOnHidden && (
          <TimerDot
            icon="⏱"
            label="Move"
            enabled={moveOn.config.enabled}
            color={C.tint}
            onPress={() =>
              moveOn.setConfig({ enabled: !moveOn.config.enabled })
            }
          />
        )}
        <TimerDot
          icon="🧠"
          label="Break"
          enabled={microbreak.config.enabled}
          color={C.tint}
          onPress={() =>
            microbreak.setConfig({ enabled: !microbreak.config.enabled })
          }
        />
        <TimerDot
          icon="❄️"
          label="Cold"
          enabled={playItCold.config.enabled}
          color={C.tint}
          onPress={toggleCold}
        />
        <Pressable onPress={() => setInfoOpen(true)} hitSlop={6} style={styles.helpBtn}>
          <View
            style={[
              styles.helpCircle,
              { borderColor: C.icon, backgroundColor: 'transparent' },
            ]}>
            <ThemedText style={[styles.helpText, { color: C.icon }]}>?</ThemedText>
          </View>
        </Pressable>
      </View>

      <TimerInfoModal
        visible={infoOpen}
        hideMoveOn={moveOnHidden}
        onClose={() => setInfoOpen(false)}
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
  // When the parent screen suppresses Move On (Serial Practice modes), do
  // not advertise it in the help modal — it would confuse the user about
  // why the dot is missing.
  const entries = hideMoveOn
    ? TIMER_INFO.filter((t) => t.title !== 'Move On Timer')
    : TIMER_INFO;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
            <ThemedText style={[styles.infoFooter, { color: C.icon }]}>
              Configure interval, break length, and the Play-It-Cold passage
              under ⚙ Settings in the library.
            </ThemedText>
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
  helpCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: Borders.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: { fontSize: Type.size.sm, fontWeight: Type.weight.heavy, lineHeight: 15 },
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
});
