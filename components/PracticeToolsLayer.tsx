// The floating practice tools shared across every score-viewing screen
// (passage detail, document/PDF viewer). Mount this inside a screen's
// content area. Each tool is an edge-docked tab; tapping it pops out a
// draggable, pinch-resizable card that flies back to its tab on collapse.
//
// Left edge:  Apple Pencil (compact) above Metronome.
// Right edge: Timer (compact) above Tuner.

import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { DEVICE, MetronomePanel } from '@/components/MetronomePanel';
import { ThemedText } from '@/components/themed-text';
import { ToolDock } from '@/components/ToolDock';
import { Colors } from '@/constants/theme';
import { Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMetronome, type MetronomeApi } from '@/lib/audio/useMetronome';

const TOP_INSET = 52;
const TAB_GAP = 8;
const SPAN = 142;
const SPAN_COMPACT = 96;

// The Timer tool's device identity — a blue analogue of the metronome's
// graphite DEVICE palette, matching the timer tab's blue.
const TIMER_DEVICE = {
  body: '#2980b9', // card body (matches the tab)
  rim: '#1d5e89', // border
  keyOn: '#ecf6fd', // a lit (on) timer key — bright
  keyOff: '#1b587f', // an unlit (off) timer key — dark, recessed
  onText: '#1d5f8a', // label on a lit key
  offText: '#d4e7f3', // label on an unlit key
  text: '#f1f7fc', // heading + help "?"
};

export function PracticeToolsLayer({
  metronome,
  metronomeNote,
  metronomeNext,
}: {
  metronome?: MetronomeApi;
  metronomeNote?: string;
  metronomeNext?: () => void;
} = {}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const panelBg = scheme === 'dark' ? '#1f2123f4' : '#fffffff4';
  const [size, setSize] = useState({ w: 0, h: 0 });
  // On a score-viewing screen the layer owns a free-standing metronome; on
  // a practice screen the strategy passes its own so it can drive it.
  const ownMetronome = useMetronome(120);
  const metro = metronome ?? ownMetronome;

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  }

  const topTabTop = TOP_INSET;
  const mainTabTop = TOP_INSET + SPAN_COMPACT + TAB_GAP;

  const common = {
    panelBg,
    borderColor: C.icon,
    containerW: size.w,
    containerH: size.h,
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={onLayout}>
      <ToolDock
        {...common}
        edge="left"
        label="PENCIL"
        accent="#9b59b6"
        tabTop={topTabTop}
        tabSpan={SPAN_COMPACT}
        panelWidth={240}
        panelHeight={224}>
        <ToolPlaceholder
          title="Apple Pencil"
          body="Pencil tools — annotate the score, highlight, and erase — are coming soon."
          color={C.icon}
        />
      </ToolDock>
      <ToolDock
        {...common}
        edge="left"
        label="METRONOME"
        accent={DEVICE.body}
        panelBg={DEVICE.body}
        borderColor={DEVICE.rim}
        defaultOpen={!!metronomeNote}
        tabTop={mainTabTop}
        tabSpan={SPAN}
        panelWidth={280}
        panelHeight={metronomeNote ? 384 : 312}>
        <MetronomePanel
          metronome={metro}
          note={metronomeNote}
          onNext={metronomeNext}
        />
      </ToolDock>

      <ToolDock
        {...common}
        edge="right"
        label="TIMER"
        accent={TIMER_DEVICE.body}
        panelBg={TIMER_DEVICE.body}
        borderColor={TIMER_DEVICE.rim}
        tabTop={topTabTop}
        tabSpan={SPAN_COMPACT}
        panelWidth={304}
        panelHeight={144}>
        <View style={styles.timerPanel}>
          <ThemedText style={[styles.timerHeading, { color: '#fff' }]}>
            Practice timers
          </ThemedText>
          <PracticeTimersPill
            bare
            device={{
              keyOn: TIMER_DEVICE.keyOn,
              keyOff: TIMER_DEVICE.keyOff,
              onText: TIMER_DEVICE.onText,
              offText: TIMER_DEVICE.offText,
              help: TIMER_DEVICE.text,
            }}
          />
        </View>
      </ToolDock>
      <ToolDock
        {...common}
        edge="right"
        label="TUNER"
        accent={C.tint}
        tabTop={mainTabTop}
        tabSpan={SPAN}
        panelWidth={250}
        panelHeight={300}>
        <ToolPlaceholder
          title="Tuner"
          body="Live pitch detection is coming soon — this panel will show the note you’re playing and how sharp or flat it is."
          color={C.icon}
        />
      </ToolDock>
    </View>
  );
}

function ToolPlaceholder({
  title,
  body,
  color,
}: {
  title: string;
  body: string;
  color: string;
}) {
  return (
    <View style={styles.placeholder}>
      <ThemedText style={styles.placeholderTitle}>{title}</ThemedText>
      <ThemedText style={[styles.placeholderBody, { color }]}>{body}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  placeholderTitle: {
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
    textAlign: 'center',
  },
  placeholderBody: {
    fontSize: Type.size.sm,
    lineHeight: 19,
    textAlign: 'center',
  },
  timerPanel: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerHeading: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.5,
  },
});
