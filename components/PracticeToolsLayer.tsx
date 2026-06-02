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

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

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
import { ToolDock, type DockEdge } from '@/components/ToolDock';
import { Colors } from '@/constants/theme';
import { Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePenDetected } from '@/hooks/usePenDetected';
import { useMetronome, type BeatState, type MetronomeApi } from '@/lib/audio/useMetronome';

const TOP_INSET = 52;
const TAB_GAP = 8;
const SPAN = 142;
const SPAN_COMPACT = 96;
const TAB_THICKNESS = 34;
// Below this viewport width we collapse the tool tabs from rotated text
// labels into square icon-only tabs ("phone density"). Matches a small
// phone in portrait — anything bigger gets the original text labels.
const PHONE_BREAKPOINT = 600;

export type ToolKey = 'pencil' | 'metronome' | 'timer' | 'recorder';

// Pencil tool. Enabled on native (iPad) only for now: the native canvas pops
// Apple's PencilKit tool picker, which provides pen/pencil/marker, the full
// colour palette, and a real eraser. Web stays off because its canvas has no
// true eraser yet (undo-only) and the same zoom caveat. Known limitation on
// both: the ink layer isn't inside the score's zoom transform, so marks don't
// track a pinch-zoom of the score (they stay pinned at 1×) — fine at the
// default zoom most practice happens at; revisit (incl. web) if it bites.
const PENCIL_ENABLED = Platform.OS !== 'web';

// Default edge layout. A screen passes `tools` to override either edge —
// an empty array clears that edge entirely.
const DEFAULT_LAYOUT: Record<DockEdge, ToolKey[]> = {
  left: ['pencil', 'metronome'],
  right: ['timer', 'recorder'],
};

// Phone layout: everything on the right edge so the iPhone Dynamic
// Island / front camera (which sits on the LEFT side in landscape) can't
// cover any tab. Metronome takes the top slot — it's the tool a
// practicing musician needs to reach instantly.
const PHONE_LAYOUT: Record<DockEdge, ToolKey[]> = {
  left: [],
  right: ['metronome', 'pencil', 'timer', 'recorder'],
};

// Single-emoji glyph used when the tab is in phone-density (icon) mode.
const TOOL_ICONS: Record<ToolKey, string> = {
  pencil: '✏️',
  metronome: '🥁',
  timer: '⏱',
  recorder: '🎤',
};

// A tool's tab is "compact" (Pencil, Timer) or full-height (Metronome,
// Recorder) — this drives both the tab length and how tabs stack down an
// edge. In phone-density mode every tab is square, regardless of weight.
function tabSpan(key: ToolKey, isPhone: boolean): number {
  if (isPhone) return TAB_THICKNESS;
  return key === 'metronome' || key === 'recorder' ? SPAN : SPAN_COMPACT;
}

// The Timer tool's device identity — reuses the metronome's graphite
// DEVICE palette so all the practice tools share a single material
// language (charcoal cards, warm-off-white text, orange "lit" key tone).
// The keys ARE light by default (warm off-white) so the emoji on each
// timer reads clearly against the charcoal body — the metronome's dark
// `mute` tone for off beats made the timer emojis disappear.
const TIMER_DEVICE = {
  body: DEVICE.body, // card body — same charcoal as the metronome
  rim: DEVICE.rim,
  keyOn: DEVICE.accent, // a lit (on) timer key — orange, like a clicked beat dot
  keyOff: DEVICE.text, // an unlit (off) timer key — warm off-white, emoji-friendly
  onText: '#1a1c20', // dark label on a bright lit key
  offText: '#1a1c20', // dark label on a light off key
  text: DEVICE.text, // heading + help "?"
};

export function PracticeToolsLayer({
  metronome,
  metronomeNote,
  metronomeNext,
  pencil,
  recorderPassageId,
  recorderDocumentId,
  tools,
}: {
  metronome?: MetronomeApi;
  metronomeNote?: string;
  metronomeNext?: () => void;
  /** When set, the PENCIL tab becomes an annotation-mode toggle. */
  pencil?: { active: boolean; onToggle: () => void };
  /** Current passage — lets the RECORDER tool save takes to its practice log. */
  recorderPassageId?: string;
  /** Current document — used by the RECORDER on the PDF viewer (no passage). */
  recorderDocumentId?: string;
  tools?: { left?: ToolKey[]; right?: ToolKey[] };
} = {}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const panelBg = scheme === 'dark' ? '#1f2123f4' : '#fffffff4';
  // Light the Timer tab when ANY of the four timers is on, so the user can
  // tell at a glance that something is scheduled without popping the tool.
  const moveOnEnabled = useMoveOnTimer().config.enabled;
  const microbreakEnabled = useMicrobreakTimer().config.enabled;
  const coldEnabled = usePlayItColdTimer().config.enabled;
  const bodyMoveEnabled = useBodyMoveTimer().config.enabled;
  const anyTimerOn =
    moveOnEnabled || microbreakEnabled || coldEnabled || bodyMoveEnabled;
  // Pencil is a stylus-only feature on web; hide its tab until the user proves
  // they have a pen (Apple Pencil in iPad Safari, Surface Pen, etc.). Native
  // always sees it — the iPad always pairs with an Apple Pencil.
  const penDetected = usePenDetected();
  // Phone density: a phone in either orientation has at least one
  // dimension under ~600px (portrait: width ~390, landscape: height
  // ~393). Checking the SHORTER side catches both; using width alone
  // would let phone-landscape fall back to the full-text desktop layout
  // and chew up the limited vertical space.
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const isPhone = Math.min(viewportWidth, viewportHeight) < PHONE_BREAKPOINT;
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Phone: the metronome becomes a fixed docked panel that springs in/out,
  // rather than a loose draggable card. ~1/3 the screen wide (clamped to a
  // usable minimum so its controls still fit). It fills the height ONLY in
  // landscape — in portrait the screen is tall, so full height would leave the
  // controls stranded in a huge empty rectangle; portrait uses the content
  // height instead. Laptop/iPad keep the draggable, resizable floating card.
  const isLandscape = viewportWidth > viewportHeight;
  const dockedW = Math.round(Math.min(340, Math.max(240, viewportWidth / 3)));
  const dockedH = isLandscape && size.h > 0 ? size.h : 330;
  // Lifted metronome state — the phone docked panel renders in a Modal that
  // unmounts when collapsed, so meter + beat pattern live here to survive the
  // remount (the audio engine itself is in `metro` below, always mounted).
  const [metroMeter, setMetroMeter] = useState('4/4');
  const [metroBeatPattern, setMetroBeatPattern] = useState<BeatState[]>([
    'normal',
    'normal',
    'normal',
    'normal',
  ]);
  // Tool cards collapse when the screen loses focus: bumping this key on blur
  // remounts every dock, so a popped-out tool (e.g. the Recorder) never
  // persists open — or keeps stale takes — across navigation.
  const [resetKey, setResetKey] = useState(0);
  useFocusEffect(useCallback(() => () => setResetKey((k) => k + 1), []));
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
    const span = tabSpan(key, isPhone);
    const label = isPhone ? TOOL_ICONS[key] : key.toUpperCase();
    const dockKey = `${edge}-${key}-${resetKey}`;
    switch (key) {
      case 'pencil':
        if (pencil) {
          return (
            <PencilTab
              key={dockKey}
              edge={edge}
              tabTop={tabTop}
              tabSpan={span}
              active={pencil.active}
              onToggle={pencil.onToggle}
            />
          );
        }
        return (
          <ToolDock
            {...common}
            key={dockKey}
            edge={edge}
            label={label}
            accent={DEVICE.body}
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
            label={label}
            accent={DEVICE.body}
            panelBg={DEVICE.body}
            borderColor={DEVICE.rim}
            // Phone is score-first: tools start collapsed even when a
            // strategy supplied a metronomeNote (the user can still tap
            // the tab to pop it out).
            defaultOpen={!!metronomeNote && !isPhone}
            tabTop={tabTop}
            tabSpan={span}
            // Phone gets a tighter card — the instructional `note`,
            // TAP TEMPO, and DRONE MET are all hidden inside
            // MetronomePanel at this width. Width has to fit the
            // bottom row's pickBtn (64) + playBtn (64) + pickBtn (64)
            // = 192 plus the root's 18-px horizontal padding × 2,
            // so 240 minimum. Height accounts for the remaining stack
            // (volume row + 28-tall dots + 64-tall BPM display row +
            // 1 divider + 64-tall play/meter/sub row, plus four 14-px
            // gaps and the root's 18-px padding top and bottom = ~277).
            // The earlier 220 × 230 was too small and the card was
            // clipping both the right edge of the play row and the
            // bottom of the play row. Phone now always shows the action
            // row (the RHYTHMS button — and NEXT when a strategy supplies
            // it), so it needs the taller 330 in both phone cases.
            docked={isPhone}
            panelWidth={isPhone ? dockedW : 280}
            panelHeight={isPhone ? dockedH : metronomeNote ? 384 : 312}>
            <MetronomePanel
              metronome={metro}
              note={metronomeNote}
              onNext={metronomeNext}
              meter={metroMeter}
              onMeterChange={setMetroMeter}
              beatPattern={metroBeatPattern}
              onBeatPatternChange={setMetroBeatPattern}
            />
          </ToolDock>
        );
      case 'timer':
        return (
          <ToolDock
            {...common}
            key={dockKey}
            edge={edge}
            label={label}
            accent={DEVICE.body}
            panelBg={TIMER_DEVICE.body}
            borderColor={TIMER_DEVICE.rim}
            tabTop={tabTop}
            tabSpan={span}
            indicator={anyTimerOn ? DEVICE.accent : undefined}
            // Wider card so all six pill items (Rotate / Break / Cold /
            // Move + ⚙ + ?) fit in a single row on every device. Phone
            // gets the same width — 360 still fits inside an iPhone in
            // portrait (~390 wide). Trim height since one row only needs
            // ~110 instead of the old 144.
            panelWidth={360}
            panelHeight={132}>
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
                  // ⚙ and ? sit on the same warm-off-white key as the
                  // dimmed timer keys, so their glyph needs dark ink to
                  // stay readable. (Previously inherited the off-white
                  // body text colour, which made the symbols vanish on
                  // the now-light key surface.)
                  help: '#1a1c20',
                }}
              />
            </View>
          </ToolDock>
        );
      case 'recorder':
        return (
          <ToolDock
            {...common}
            key={dockKey}
            edge={edge}
            label={label}
            accent={DEVICE.body}
            tabTop={tabTop}
            tabSpan={span}
            // Phone gets a tighter card — RecorderPanel hides the
            // "Playback speed" label, input-level caption, and bottom
            // hint at this width, so we shrink the dock to match.
            panelWidth={isPhone ? 240 : 300}
            panelHeight={isPhone ? 290 : 430}>
            <RecorderPanel
              passageId={recorderPassageId}
              documentId={recorderDocumentId}
            />
          </ToolDock>
        );
    }
  }

  // Stack each edge's tabs from TOP_INSET downward, spacing by tab span.
  function renderEdge(edge: DockEdge) {
    // Phone gets the all-right layout; screens that pass an explicit
    // `tools` prop still win (e.g. rhythm-builder), so authors keep
    // full control when they want it.
    const defaultLayout = isPhone ? PHONE_LAYOUT : DEFAULT_LAYOUT;
    const requested = tools?.[edge] ?? defaultLayout[edge];
    const showPencil = PENCIL_ENABLED && penDetected;
    const keys = showPencil ? requested : requested.filter((k) => k !== 'pencil');
    let top = TOP_INSET;
    return keys.map((key) => {
      const dock = renderTool(key, edge, top);
      top += tabSpan(key, isPhone) + TAB_GAP;
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

// The Apple Pencil tab is a toggle, not a pop-out card: tapping it turns the
// annotation canvas on the host screen on or off.
function PencilTab({
  edge,
  tabTop,
  tabSpan,
  active,
  onToggle,
}: {
  edge: DockEdge;
  tabTop: number;
  tabSpan: number;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.pencilTab,
        edge === 'left' ? styles.pencilTabLeft : styles.pencilTabRight,
        {
          top: tabTop,
          height: tabSpan,
          backgroundColor: active ? DEVICE.rim : DEVICE.body,
        },
      ]}>
      {tabSpan <= TAB_THICKNESS + 4 ? (
        <ThemedText style={styles.pencilTabIcon}>
          {active ? '✓' : '✏️'}
        </ThemedText>
      ) : (
        // See note in ToolDock — rotated text needs a sized wrapper or
        // RN-Web shrinks it to the 34px parent and ellipsises the label.
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: tabSpan,
            height: TAB_THICKNESS,
            left: (TAB_THICKNESS - tabSpan) / 2,
            top: (tabSpan - TAB_THICKNESS) / 2,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: edge === 'left' ? '-90deg' : '90deg' }],
          }}>
          <ThemedText numberOfLines={1} style={styles.pencilTabLabel}>
            {active ? 'DONE' : 'PENCIL'}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pencilTab: {
    position: 'absolute',
    width: TAB_THICKNESS,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  pencilTabLeft: {
    left: 0,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  pencilTabRight: {
    right: 0,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  pencilTabLabel: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  pencilTabIcon: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'center',
  },
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
