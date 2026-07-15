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

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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
import { Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePenDetected } from '@/hooks/usePenDetected';
import { useMetronome, type BeatState, type MetronomeApi } from '@/lib/audio/useMetronome';

const TOP_INSET = 52;
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

// Universal layout (v2 reskin): all tools in one right-edge chip rail on every
// device. Metronome takes the top slot — the tool a practicing musician needs
// to reach instantly. (Right edge also keeps the rail clear of the iPhone
// Dynamic Island / front camera, which sit on the LEFT in landscape.) A screen
// can still override either edge via the `tools` prop (an empty array clears
// that edge).
const DEFAULT_RAIL: Record<DockEdge, ToolKey[]> = {
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

// v2 reskin — clean line icons for the phone tool chips (MaterialCommunityIcons).
const TOOL_MCI: Record<ToolKey, keyof typeof MaterialCommunityIcons.glyphMap> = {
  pencil: 'pencil-outline',
  metronome: 'metronome',
  timer: 'timer-outline',
  recorder: 'microphone-outline',
};

// A tool's tab is "compact" (Pencil, Timer) or full-height (Metronome,
// Recorder) — this drives both the tab length and how tabs stack down an
// edge. In phone-density mode every tab is square, regardless of weight.
// v2 reskin — every device uses the compact white icon-chip rail, so the tab
// is a fixed square on all sizes.
function tabSpan(_key: ToolKey, _isPhone: boolean): number {
  return TAB_THICKNESS;
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
  // The metronome panel has fixed-width internals (the 244px beat-dots row +
  // 18px padding each side ≈ 280px), so the card must be at least ~296 or the
  // controls clip. Portrait phones used to clamp to 240 (vpW/3 is tiny in
  // portrait) and cut off the panel. Floor at 296, capped to the viewport.
  const dockedW = Math.round(Math.min(viewportWidth - 16, Math.max(296, viewportWidth / 3)));
  const dockedH = isLandscape && size.h > 0 ? size.h : 422;
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
    // v2 reskin — chips render flat inside a shared white rail pill.
    merged: true,
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
              merged
            />
          );
        }
        return (
          <ToolDock
            {...common}
            key={dockKey}
            edge={edge}
            label={label}
            iconName={TOOL_MCI[key]}
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
            iconName={TOOL_MCI[key]}
            accent={DEVICE.body}
            panelBg={DEVICE.body}
            borderColor={DEVICE.rim}
            // Tablet/laptop have room, so any practice strategy that DRIVES the
            // metronome (passes its own `metronome` — incl. the guided ones and
            // Rhythm Variations, which don't supply a metronomeNote) pops it out
            // on load. Phone stays score-first (collapsed; tap the tab to open),
            // and non-strategy screens that don't pass a metronome (passage hub,
            // chunking, self-led) stay collapsed everywhere.
            defaultOpen={!!metronome && !isPhone}
            tabTop={tabTop}
            tabSpan={span}
            // Phone gets a tighter card — the instructional `note` is
            // hidden inside MetronomePanel at this width. Width has to fit
            // the bottom row's pickBtn (64) + playBtn (64) + pickBtn (64)
            // = 192 plus the root's 18-px horizontal padding × 2, so 240
            // minimum. Height accounts for the remaining stack (volume row
            // + 28-tall dots + 64-tall BPM display row + 28-tall tempo
            // slider + TAP/NEXT row + the DRONE/RHYTHMS/GAPS function strip
            // + 1 divider + 64-tall play/meter/sub row, plus the 14-px gaps
            // and 18-px padding) — ~400, so the card carries the function
            // strip and the slider without clipping.
            docked={isPhone}
            panelWidth={isPhone ? dockedW : 280}
            panelHeight={isPhone ? dockedH : metronomeNote ? 482 : 410}
            // Keep the full intrinsic height (so the controls aren't cramped)
            // but pop the card out a touch zoomed-out on laptop/tablet so a
            // tall metronome doesn't dominate the practice screen (B-011).
            openScale={isPhone ? undefined : 0.85}
            // Anchor to the top of the screen — the score fills the centre, so
            // a top-anchored metronome is least likely to cover the passage.
            openAtTop={!isPhone}>
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
            iconName={TOOL_MCI[key]}
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
            iconName={TOOL_MCI[key]}
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
    const requested = tools?.[edge] ?? DEFAULT_RAIL[edge];
    const showPencil = PENCIL_ENABLED && penDetected;
    const keys = showPencil ? requested : requested.filter((k) => k !== 'pencil');
    if (keys.length === 0) return null;
    // Merged rail: chips stack flush (no gap) inside one shared white pill.
    let top = TOP_INSET;
    const docks = keys.map((key) => {
      const dock = renderTool(key, edge, top);
      top += TAB_THICKNESS;
      return dock;
    });
    return (
      <View key={edge} style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View
          pointerEvents="none"
          style={[
            styles.railPill,
            edge === 'left' ? { left: 10 } : { right: 10 },
            { top: TOP_INSET, height: keys.length * TAB_THICKNESS },
          ]}
        />
        {docks}
      </View>
    );
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
  merged = false,
}: {
  edge: DockEdge;
  tabTop: number;
  tabSpan: number;
  active: boolean;
  onToggle: () => void;
  merged?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityLabel={active ? 'Stop annotating' : 'Annotate'}
      style={[
        styles.chipTab,
        edge === 'left' ? { left: 10 } : { right: 10 },
        { top: tabTop, height: tabSpan },
        merged && styles.chipMerged,
        !merged && active && { backgroundColor: Palette.accent, borderColor: Palette.accent },
      ]}>
      <MaterialCommunityIcons
        name={active ? 'check' : 'pencil-outline'}
        size={20}
        color={merged ? (active ? Palette.accent : Palette.text) : active ? '#fff' : Palette.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // v2 reskin — white floating icon chip (matches ToolDock's phone tab).
  chipTab: {
    position: 'absolute',
    width: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  // Flat segment inside the shared rail pill.
  chipMerged: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  // The shared white "rail pill" drawn behind the merged chip group.
  railPill: {
    position: 'absolute',
    width: 40,
    borderRadius: 18,
    backgroundColor: Palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
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
