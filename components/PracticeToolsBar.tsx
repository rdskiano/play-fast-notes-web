// Top-right practice-tools pill — an alternative to the edge-docked
// PracticeToolsLayer used on the reskinned run screens (Tempo Ladder first).
// A small white pill of icon buttons (metronome / timer / recorder / pencil)
// floats in the top-right corner; tapping one drops its panel down below the
// pill. One tool is open at a time. The panels are the SAME components the
// edge dock uses (MetronomePanel, RecorderPanel, the timers pill), so behaviour
// is unchanged — only the trigger + anchor differ.
//
// Self-positioning: the whole bar is absolutely anchored to the screen's
// top-right, so the host just drops <PracticeToolsBar/> in as a late sibling
// (it paints above the score). The metronome's meter / beat pattern are lifted
// here so they survive opening and closing the panel.

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import {
  useBodyMoveTimer,
  useMicrobreakTimer,
  useMoveOnTimer,
  usePlayItColdTimer,
} from '@/components/PracticeTimersContext';
import { DEVICE, MetronomePanel } from '@/components/MetronomePanel';
import { RecorderPanel } from '@/components/RecorderPanel';
import { ThemedText } from '@/components/themed-text';
import { Lift, Palette } from '@/constants/palette';
import {
  useMetronome,
  type BeatState,
  type MetronomeApi,
} from '@/lib/audio/useMetronome';

export type ToolBarKey = 'metronome' | 'timer' | 'recorder';

const ICONS: Record<ToolBarKey, keyof typeof MaterialCommunityIcons.glyphMap> = {
  metronome: 'metronome',
  timer: 'timer-outline',
  recorder: 'microphone-outline',
};

// Timer panel reuses the metronome's charcoal device palette (mirrors
// PracticeToolsLayer's TIMER_DEVICE) so the two tools share one material.
const TIMER_DEVICE = {
  body: DEVICE.body,
  rim: DEVICE.rim,
  keyOn: DEVICE.accent,
  keyOff: DEVICE.text,
  onText: '#1a1c20',
  offText: '#1a1c20',
};

export function PracticeToolsBar({
  metronome,
  metronomeNote,
  pencil,
  recorderPassageId,
  recorderDocumentId,
  tools,
  anchorTop,
  anchorRight,
}: {
  metronome?: MetronomeApi;
  metronomeNote?: string;
  pencil?: { active: boolean; onToggle: () => void; onUndo?: () => void };
  recorderPassageId?: string;
  recorderDocumentId?: string;
  /** Which tools to show, in order. Defaults to all three. */
  tools?: ToolBarKey[];
  /**
   * Position overrides for hosts that mount the bar inside a content area
   * rather than at the screen root (e.g. the document viewer places it in
   * line with the page chevron). Default to the safe-area top-right corner.
   */
  anchorTop?: number;
  anchorRight?: number;
}) {
  const insets = useSafeAreaInsets();
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;

  // Free-standing fallback so the panel always has an engine to drive.
  const ownMetro = useMetronome(120);
  const metro = metronome ?? ownMetro;

  // Lifted metronome state — survives opening / closing the dropdown.
  const [meter, setMeter] = useState('4/4');
  const [beat, setBeat] = useState<BeatState[]>([
    'normal',
    'normal',
    'normal',
    'normal',
  ]);

  const moveOnEnabled = useMoveOnTimer().config.enabled;
  const microbreakEnabled = useMicrobreakTimer().config.enabled;
  const coldEnabled = usePlayItColdTimer().config.enabled;
  const bodyMoveEnabled = useBodyMoveTimer().config.enabled;
  const anyTimerOn =
    moveOnEnabled || microbreakEnabled || coldEnabled || bodyMoveEnabled;

  const [open, setOpen] = useState<ToolBarKey | null>(null);
  const keys = tools ?? (['metronome', 'timer', 'recorder'] as ToolBarKey[]);

  // Each panel's intrinsic (unscaled) size. On phone the open panel is scaled
  // down (see `fit` below) so even the tall metronome fits a short landscape
  // screen; on desktop the dropdown uses these sizes directly.
  function panelSize(key: ToolBarKey): {
    w: number;
    h: number;
    bg: string;
    border: string;
  } {
    if (key === 'metronome') {
      return {
        w: isPhone ? Math.min(vpW - 24, 300) : 300,
        h: metronomeNote && !isPhone ? 444 : 372,
        bg: DEVICE.body,
        border: DEVICE.rim,
      };
    }
    if (key === 'timer') {
      return {
        w: Math.min(vpW - 24, 360),
        h: 132,
        bg: TIMER_DEVICE.body,
        border: TIMER_DEVICE.rim,
      };
    }
    return {
      w: isPhone ? 260 : 300,
      h: isPhone ? 320 : 430,
      bg: '#fff',
      border: Palette.border,
    };
  }

  const size = open ? panelSize(open) : null;
  // Phone: shrink the panel so it always fits the viewport (the metronome is
  // taller than a landscape phone). 1 on a screen with room to spare.
  const fit = size
    ? Math.min(
        1,
        (vpH - insets.top - insets.bottom - 24) / size.h,
        (vpW - 24) / size.w,
      )
    : 1;

  const panelBody =
    open === 'metronome' ? (
      <MetronomePanel
        metronome={metro}
        note={metronomeNote}
        meter={meter}
        onMeterChange={setMeter}
        beatPattern={beat}
        onBeatPatternChange={setBeat}
      />
    ) : open === 'timer' ? (
      <View style={styles.timerPanel}>
        <ThemedText style={styles.timerHeading}>Practice timers</ThemedText>
        <PracticeTimersPill
          bare
          device={{
            keyOn: TIMER_DEVICE.keyOn,
            keyOff: TIMER_DEVICE.keyOff,
            onText: TIMER_DEVICE.onText,
            offText: TIMER_DEVICE.offText,
            help: '#1a1c20',
          }}
        />
      </View>
    ) : open === 'recorder' ? (
      <RecorderPanel
        passageId={recorderPassageId}
        documentId={recorderDocumentId}
      />
    ) : null;

  return (
    <>
      <View
        style={[
          styles.root,
          {
            top: anchorTop ?? insets.top + 10,
            right: anchorRight ?? insets.right + 12,
          },
        ]}
        pointerEvents="box-none">
        <View style={styles.pill}>
          {keys.map((key) => {
            const active = open === key;
            return (
              <Pressable
                key={key}
                onPress={() => setOpen((o) => (o === key ? null : key))}
                accessibilityLabel={key}
                style={[styles.iconBtn, active && styles.iconBtnActive]}>
                <MaterialCommunityIcons
                  name={ICONS[key]}
                  size={20}
                  color={active ? '#fff' : Palette.text}
                />
                {key === 'timer' && anyTimerOn && !active && (
                  <View style={styles.dot} />
                )}
              </Pressable>
            );
          })}
          {/* While drawing, a red Undo sits just left of the blue ✓ (Done) so
              the user can walk back marks right where they turned the pencil
              on, instead of hunting for the corner button on the score. */}
          {pencil?.active && pencil.onUndo && (
            <Pressable
              onPress={pencil.onUndo}
              accessibilityLabel="Undo last pencil mark"
              style={[styles.iconBtn, styles.undoBtn]}>
              <MaterialCommunityIcons name="undo-variant" size={20} color="#fff" />
            </Pressable>
          )}
          {pencil && (
            <Pressable
              onPress={pencil.onToggle}
              accessibilityLabel={pencil.active ? 'Done drawing' : 'Pencil'}
              style={[styles.iconBtn, pencil.active && styles.iconBtnActive]}>
              <MaterialCommunityIcons
                name={pencil.active ? 'check' : 'pencil-outline'}
                size={20}
                color={pencil.active ? '#fff' : Palette.text}
              />
            </Pressable>
          )}
        </View>

        {/* Desktop / iPad: drop the panel straight down from the pill. */}
        {open && size && !isPhone && (
          <View
            style={[
              styles.panel,
              {
                width: size.w,
                height: size.h,
                backgroundColor: size.bg,
                borderColor: size.border,
              },
            ]}>
            {panelBody}
          </View>
        )}
      </View>

      {/* Phone: a top-anchored dropdown can run off a short (landscape)
          screen, so centre the panel over a dim backdrop and cap its height
          to the viewport instead. Tapping the backdrop closes it. */}
      {open && size && isPhone && (
        <View style={styles.phoneOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Close tool"
            onPress={() => setOpen(null)}
          />
          <View
            style={[
              styles.phonePanel,
              {
                width: size.w,
                height: size.h,
                backgroundColor: size.bg,
                borderColor: size.border,
                transform: [{ scale: fit }],
              },
            ]}>
            {panelBody}
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', alignItems: 'flex-end', zIndex: 60 },
  // Sized so the whole pill is ~38 tall — flush with the 38px top-bar icon
  // buttons it sits in line with (3 padding + 32 button + 3 padding).
  pill: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: 19,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    ...Lift,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: Palette.accent },
  undoBtn: { backgroundColor: Palette.danger },
  dot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Palette.accent,
  },
  panel: {
    position: 'absolute',
    top: 44,
    right: 0,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Lift,
  },
  phoneOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 80,
  },
  phonePanel: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Lift,
  },
  timerPanel: {
    flex: 1,
    padding: 12,
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerHeading: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
