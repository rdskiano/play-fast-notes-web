// The floating practice tools shared across every score-viewing screen
// (passage detail, document/PDF viewer) and practice strategy. Mount this
// inside a screen's content area. Each tool is an edge-docked tab; tapping
// it pops out a draggable, pinch-resizable card that flies back to its tab
// on collapse.
//
// Default layout — left edge: Apple Pencil (compact) above Metronome;
// right edge: Timer (compact) above Tuner. A screen can override the set
// and placement of tools per edge via the `tools` prop: pass an array per
// edge (an empty array clears that edge). The rhythm exercise generator,
// for example, stacks Timer / Metronome / Pencil all on the right.

import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { DEVICE, MetronomePanel } from '@/components/MetronomePanel';
import { ThemedText } from '@/components/themed-text';
import { ToolDock, type DockEdge } from '@/components/ToolDock';
import { Colors } from '@/constants/theme';
import { Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMetronome, type MetronomeApi } from '@/lib/audio/useMetronome';

const TOP_INSET = 52;
const TAB_GAP = 8;
const SPAN = 142;
const SPAN_COMPACT = 96;

export type ToolKey = 'pencil' | 'metronome' | 'timer' | 'tuner';

// Default edge layout. A screen passes `tools` to override either edge —
// an empty array clears that edge entirely.
const DEFAULT_LAYOUT: Record<DockEdge, ToolKey[]> = {
  left: ['pencil', 'metronome'],
  right: ['timer', 'tuner'],
};

// A tool's tab is "compact" (Pencil, Timer) or full-height (Metronome,
// Tuner) — this drives both the tab length and how tabs stack down an edge.
function tabSpan(key: ToolKey): number {
  return key === 'metronome' || key === 'tuner' ? SPAN : SPAN_COMPACT;
}

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
  tools,
}: {
  metronome?: MetronomeApi;
  metronomeNote?: string;
  metronomeNext?: () => void;
  tools?: { left?: ToolKey[]; right?: ToolKey[] };
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

  const common = {
    panelBg,
    borderColor: C.icon,
    containerW: size.w,
    containerH: size.h,
  };

  function renderTool(key: ToolKey, edge: DockEdge, tabTop: number) {
    const span = tabSpan(key);
    const dockKey = `${edge}-${key}`;
    switch (key) {
      case 'pencil':
        return (
          <ToolDock
            {...common}
            key={dockKey}
            edge={edge}
            label="PENCIL"
            accent="#9b59b6"
            tabTop={tabTop}
            tabSpan={span}
            panelWidth={240}
            panelHeight={224}>
            <ToolPlaceholder
              title="Apple Pencil"
              body="Pencil tools — annotate the score, highlight, and erase — are coming soon."
              color={C.icon}
            />
          </ToolDock>
        );
      case 'metronome':
        return (
          <ToolDock
            {...common}
            key={dockKey}
            edge={edge}
            label="METRONOME"
            accent={DEVICE.body}
            panelBg={DEVICE.body}
            borderColor={DEVICE.rim}
            defaultOpen={!!metronomeNote}
            tabTop={tabTop}
            tabSpan={span}
            panelWidth={280}
            panelHeight={metronomeNote ? 384 : 312}>
            <MetronomePanel
              metronome={metro}
              note={metronomeNote}
              onNext={metronomeNext}
            />
          </ToolDock>
        );
      case 'timer':
        return (
          <ToolDock
            {...common}
            key={dockKey}
            edge={edge}
            label="TIMER"
            accent={TIMER_DEVICE.body}
            panelBg={TIMER_DEVICE.body}
            borderColor={TIMER_DEVICE.rim}
            tabTop={tabTop}
            tabSpan={span}
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
        );
      case 'tuner':
        return (
          <ToolDock
            {...common}
            key={dockKey}
            edge={edge}
            label="TUNER"
            accent={C.tint}
            tabTop={tabTop}
            tabSpan={span}
            panelWidth={250}
            panelHeight={300}>
            <ToolPlaceholder
              title="Tuner"
              body="Live pitch detection is coming soon — this panel will show the note you’re playing and how sharp or flat it is."
              color={C.icon}
            />
          </ToolDock>
        );
    }
  }

  // Stack each edge's tabs from TOP_INSET downward, spacing by tab span.
  function renderEdge(edge: DockEdge) {
    const keys = tools?.[edge] ?? DEFAULT_LAYOUT[edge];
    let top = TOP_INSET;
    return keys.map((key) => {
      const dock = renderTool(key, edge, top);
      top += tabSpan(key) + TAB_GAP;
      return dock;
    });
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={onLayout}>
      {renderEdge('left')}
      {renderEdge('right')}
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
