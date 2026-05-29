import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PassagePickerModal } from '@/components/PassagePickerModal';
import {
  useBodyMoveTimer,
  useMicrobreakTimer,
  useMoveOnTimer,
  usePlayItColdTimer,
} from '@/components/PracticeTimersContext';
import { SessionTopBar } from '@/components/SessionTopBar';
import { bmacUrl } from '@/lib/links';
import { useSubscription } from '@/lib/supabase/subscription';
import {
  DEFAULT_STRATEGY_COLORS,
  useStrategyColors,
  type StrategyKey,
} from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listPassages, type Passage } from '@/lib/db/repos/passages';
import { wipeUserData } from '@/lib/supabase/account';
import { signOut, useSession } from '@/lib/supabase/auth';

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  tempo_ladder: 'Tempo Ladder',
  click_up: 'Interleaved Click-Up',
  rhythmic: 'Rhythmic Variation',
  interleaved: 'Rep Rotator',
  rep_rotator: 'Rep Rotator',
};

const STRATEGY_ORDER: StrategyKey[] = [
  'tempo_ladder',
  'click_up',
  'rhythmic',
  'rep_rotator',
];

const COLOR_PALETTE = [
  '#2ecc71', '#27ae60', '#16a085', '#1abc9c',
  '#3498db', '#154360', '#2980b9', '#34495e',
  '#9b59b6', '#8e44ad', '#4a235a', '#e91e63',
  '#f39c12', '#e67e22', '#d35400', '#7b2d00',
  '#e74c3c', '#c0392b', '#2c3e50', '#7f8c8d',
];

function formatExpiry(unixMs: number): string {
  const d = new Date(unixMs);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Stepper({
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  tint,
  icon,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  tint: string;
  icon: string;
}) {
  function clamp(n: number) {
    return Math.max(min, Math.min(max, n));
  }
  return (
    <View style={[styles.stepper, { borderColor: icon }]}>
      <Pressable
        onPress={() => onChange(clamp(value - step))}
        hitSlop={6}
        style={styles.stepperBtn}>
        <ThemedText style={[styles.stepperBtnText, { color: tint }]}>−</ThemedText>
      </Pressable>
      <View style={styles.stepperValue}>
        <ThemedText style={styles.stepperValueText}>
          {value}
          {unit ? ` ${unit}` : ''}
        </ThemedText>
      </View>
      <Pressable
        onPress={() => onChange(clamp(value + step))}
        hitSlop={6}
        style={styles.stepperBtn}>
        <ThemedText style={[styles.stepperBtnText, { color: tint }]}>+</ThemedText>
      </Pressable>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors, setColor, resetAll } = useStrategyColors();

  const moveOn = useMoveOnTimer();
  const microbreak = useMicrobreakTimer();
  const playItCold = usePlayItColdTimer();
  const bodyMove = useBodyMoveTimer();

  const session = useSession();
  const userEmail = session?.user.email ?? null;
  const subscription = useSubscription();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  async function onSignOut() {
    try {
      await signOut();
    } catch (e) {
      console.warn('[settings] sign-out failed', e);
    }
    router.replace('/sign-in');
  }

  async function onConfirmWipe() {
    setWipeConfirmOpen(false);
    setWiping(true);
    try {
      await wipeUserData();
    } catch (e) {
      console.warn('[settings] wipe failed', e);
    }
    setWiping(false);
    router.replace('/sign-in');
  }

  useEffect(() => {
    (async () => {
      setPassages(await listPassages());
    })();
  }, []);

  const selectedPassage = useMemo(
    () => passages.find((p) => p.id === playItCold.config.pieceId) ?? null,
    [passages, playItCold.config.pieceId],
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Back"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Settings
          </ThemedText>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Strategy colors ────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Strategy colors</ThemedText>
          <Pressable onPress={resetAll} hitSlop={6} style={styles.resetBtn}>
            <ThemedText style={[styles.resetText, { color: C.tint }]}>
              Reset
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText style={styles.sectionHint}>
          These tint the strategy pills in the practice log and the buttons on
          each passage page.
        </ThemedText>

        {STRATEGY_ORDER.map((key) => (
          <View key={key} style={styles.row}>
            <View style={styles.rowHeader}>
              <View style={[styles.swatch, { backgroundColor: colors[key] }]} />
              <ThemedText style={styles.rowLabel}>{STRATEGY_LABELS[key]}</ThemedText>
              {colors[key] !== DEFAULT_STRATEGY_COLORS[key] && (
                <Pressable
                  onPress={() => setColor(key, DEFAULT_STRATEGY_COLORS[key])}
                  hitSlop={6}>
                  <ThemedText style={[styles.perRowReset, { color: C.icon }]}>
                    default
                  </ThemedText>
                </Pressable>
              )}
            </View>
            <View style={styles.palette}>
              {COLOR_PALETTE.map((hex) => {
                const selected = colors[key].toLowerCase() === hex.toLowerCase();
                return (
                  <Pressable
                    key={hex}
                    onPress={() => setColor(key, hex)}
                    style={[
                      styles.swatchChoice,
                      {
                        backgroundColor: hex,
                        borderColor: selected ? C.text : 'transparent',
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        ))}

        {/* ── Practice timers ────────────────────────────────────────── */}
        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <ThemedText style={styles.sectionTitle}>Practice timers</ThemedText>
        </View>
        <ThemedText style={styles.sectionHint}>
          Four focus tools. Toggle them on or off from the ⏱🧠❄️🚶 pill on the
          Timer card in any passage screen; configure them here.
        </ThemedText>

        {/* Rotate */}
        <View style={[styles.timerCard, { borderColor: C.icon + '33' }]}>
          <View style={styles.timerHeader}>
            <ThemedText style={styles.timerTitle}>⏱ Rotate Timer</ThemedText>
            <Switch
              value={moveOn.config.enabled}
              onValueChange={(v) => moveOn.setConfig({ enabled: v })}
              trackColor={{ true: C.tint }}
            />
          </View>
          <ThemedText style={[styles.timerWhy, { color: C.icon }]}>
            Prevents mindless, repetitive practice. When it fires, switch to a
            completely different section — being forced to rotate sharpens
            focus and trains recall of what you were working on.
          </ThemedText>
          <View style={styles.controlRow}>
            <ThemedText style={styles.controlLabel}>Fire every</ThemedText>
            <Stepper
              value={moveOn.config.intervalMin}
              min={2}
              max={5}
              unit="min"
              tint={C.tint}
              icon={C.icon}
              onChange={(n) => moveOn.setConfig({ intervalMin: n })}
            />
          </View>
        </View>

        {/* Micro */}
        <View style={[styles.timerCard, { borderColor: C.icon + '33' }]}>
          <View style={styles.timerHeader}>
            <ThemedText style={styles.timerTitle}>🧠 Micro Timer</ThemedText>
            <Switch
              value={microbreak.config.enabled}
              onValueChange={(v) => microbreak.setConfig({ enabled: v })}
              trackColor={{ true: C.tint }}
            />
          </View>
          <ThemedText style={[styles.timerWhy, { color: C.icon }]}>
            Motor skills consolidate during short rests. Your brain replays
            the passage in fast-forward while you sit still — that&apos;s when
            improvement actually sticks.
          </ThemedText>
          <ThemedText style={[styles.cadenceHint, { color: C.icon }]}>
            Cadence: every 3 clean reps (and on your final rep) in Slow
            Click-Up; every 10 reps in Interleaved Click-Up.
          </ThemedText>
          <View style={styles.controlRow}>
            <ThemedText style={styles.controlLabel}>Break length</ThemedText>
            <Stepper
              value={microbreak.config.breakSeconds}
              min={10}
              max={20}
              unit="s"
              tint={C.tint}
              icon={C.icon}
              onChange={(n) => microbreak.setConfig({ breakSeconds: n })}
            />
          </View>
        </View>

        {/* Cold */}
        <View style={[styles.timerCard, { borderColor: C.icon + '33' }]}>
          <View style={styles.timerHeader}>
            <ThemedText style={styles.timerTitle}>❄️ Cold Timer</ThemedText>
            <Switch
              value={playItCold.config.enabled}
              onValueChange={(v) => {
                if (v && !playItCold.config.pieceId) {
                  setPickerOpen(true);
                  return;
                }
                playItCold.setConfig({ enabled: v });
              }}
              trackColor={{ true: C.tint }}
            />
          </View>
          <ThemedText style={[styles.timerWhy, { color: C.icon }]}>
            Performances only give you one take. This interrupts whatever
            you&apos;re doing and makes you perform your chosen spot once, no
            restarts — building the skill of nailing it on the first try.
          </ThemedText>
          <View style={styles.controlRow}>
            <ThemedText style={styles.controlLabel}>Min interval</ThemedText>
            <Stepper
              value={playItCold.config.intervalMin}
              min={2}
              max={playItCold.config.intervalMax}
              unit="min"
              tint={C.tint}
              icon={C.icon}
              onChange={(n) => playItCold.setConfig({ intervalMin: n })}
            />
          </View>
          <View style={styles.controlRow}>
            <ThemedText style={styles.controlLabel}>Max interval</ThemedText>
            <Stepper
              value={playItCold.config.intervalMax}
              min={playItCold.config.intervalMin}
              max={15}
              unit="min"
              tint={C.tint}
              icon={C.icon}
              onChange={(n) => playItCold.setConfig({ intervalMax: n })}
            />
          </View>
          <View style={styles.controlRow}>
            <ThemedText style={styles.controlLabel}>Passage</ThemedText>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={[styles.pickBtn, { borderColor: C.icon }]}>
              <ThemedText
                style={[styles.pickBtnText, { color: C.text }]}
                numberOfLines={1}>
                {selectedPassage ? selectedPassage.title : 'Pick a passage…'}
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Break — physical stand-up reminder, distinct from Rotate which
            just swaps passages without leaving the chair. */}
        <View style={[styles.timerCard, { borderColor: C.icon + '33' }]}>
          <View style={styles.timerHeader}>
            <ThemedText style={styles.timerTitle}>🚶 Break Timer</ThemedText>
            <Switch
              value={bodyMove.config.enabled}
              onValueChange={(v) => bodyMove.setConfig({ enabled: v })}
              trackColor={{ true: C.tint }}
            />
          </View>
          <ThemedText style={[styles.timerWhy, { color: C.icon }]}>
            A gentle nudge to step away from the instrument, stretch, and walk
            around. Long motionless sessions hurt your back and your focus;
            brief movement breaks reset both.
          </ThemedText>
          <View style={styles.controlRow}>
            <ThemedText style={styles.controlLabel}>Fire every</ThemedText>
            <Stepper
              value={bodyMove.config.intervalMin}
              min={10}
              max={60}
              unit="min"
              tint={C.tint}
              icon={C.icon}
              onChange={(n) => bodyMove.setConfig({ intervalMin: n })}
            />
          </View>
        </View>

        {/* ── Support ─────────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Support</ThemedText>
        </View>
        <ThemedText style={styles.sectionHint}>
          Play Fast Notes is in active development. If it is helping your
          practice, a tip keeps the work going.
        </ThemedText>
        {subscription.isActive && subscription.expiresAt && (
          <ThemedText style={[styles.sectionHint, { color: C.tint }]}>
            Thanks — your free access is active through{' '}
            {formatExpiry(subscription.expiresAt)}.
          </ThemedText>
        )}
        <View style={styles.accountRow}>
          <Button
            label="☕ Buy me a coffee"
            variant="outline"
            onPress={() => Linking.openURL(bmacUrl())}
            fullWidth
          />
        </View>

        {/* ── Account ─────────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Account</ThemedText>
        </View>
        {userEmail && (
          <ThemedText style={styles.sectionHint}>
            Signed in as {userEmail}.
          </ThemedText>
        )}
        <View style={styles.accountRow}>
          <Button
            label="Sign out"
            variant="outline"
            onPress={onSignOut}
            fullWidth
          />
        </View>
        <View style={styles.accountRow}>
          <Button
            label={wiping ? 'Resetting…' : 'Reset all my data'}
            variant="danger"
            onPress={() => setWipeConfirmOpen(true)}
            disabled={wiping}
            fullWidth
          />
          <ThemedText style={[styles.sectionHint, { marginTop: Spacing.xs }]}>
            Deletes every passage, exercise, log entry, recording, and
            folder you own. Sign-in stays so you can start fresh. To fully
            delete your account (including your email), email
            rdskiano@gmail.com.
          </ThemedText>
        </View>

      </ScrollView>

      <PassagePickerModal
        visible={pickerOpen}
        selectedId={playItCold.config.pieceId}
        onClose={() => setPickerOpen(false)}
        onPick={(pieceId) => {
          playItCold.setConfig({ pieceId, enabled: true });
          setPickerOpen(false);
        }}
        title="Pick a Play-It-Cold passage"
      />

      <ConfirmModal
        visible={wipeConfirmOpen}
        title="Reset all your data?"
        message="Every passage, exercise, log entry, recording, and folder you own will be deleted. Your account email stays — you will land on the sign-in screen. This cannot be undone."
        confirmLabel="Yes, wipe everything"
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirmWipe}
        onCancel={() => setWipeConfirmOpen(false)}
      />

      <TutorialStep
        id="settings"
        visible={false}
        title="Settings"
        body={
          "Tune the look and behavior of the app to your practice habits.\n\n" +
          "Strategy colors — pick the tint for each strategy's pill on the passage screen and in the practice log. Tap a swatch to change a color; the per-row 'default' link (shown when you've changed one) restores just that strategy, and 'Reset' at the top restores every strategy at once.\n\n" +
          "Practice timers — Rotate, Micro, Cold, Break. Toggle each on/off and set how often they fire. Configurable from the Timer card on any passage screen too.\n\n" +
          "Cold timer — it needs a designated passage: switching it on prompts you to pick one (or use the Passage row to change it). It then fires once at a random moment inside the Min–Max interval window you set, so you can't predict the cold take.\n\n" +
          "Support — ☕ Buy me a coffee opens a tip link; tips keep development going.\n\n" +
          "Account — sign out or reset all your data. Resetting deletes every passage, exercise, log, recording, and folder you own (your sign-in stays); it's permanent."
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'], gap: Spacing.lg },
  accountRow: { gap: Spacing.xs },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  sectionTitle: { fontWeight: Type.weight.heavy, fontSize: Type.size.xl },
  sectionHint: { opacity: Opacity.muted, fontSize: Type.size.sm, lineHeight: 18, marginTop: -10 },
  resetBtn: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  resetText: { fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  row: { gap: Spacing.sm },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { flex: 1, fontWeight: Type.weight.bold, fontSize: 15 },
  perRowReset: { fontSize: Type.size.xs, fontWeight: Type.weight.bold, textTransform: 'uppercase' },
  swatch: { width: 28, height: 28, borderRadius: Radii.sm },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchChoice: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    borderWidth: 3,
  },

  // Timer cards
  timerCard: { borderWidth: Borders.thin, borderRadius: Radii.xl, padding: 14, gap: 10 },
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerTitle: { fontSize: Type.size.lg, fontWeight: Type.weight.heavy },
  timerWhy: { fontSize: Type.size.sm, lineHeight: 18 },
  cadenceHint: { fontSize: 12, lineHeight: 16, fontStyle: 'italic' },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  controlLabel: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, flex: 1 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: Borders.thin,
    borderRadius: Radii.sm,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  stepperBtnText: { fontSize: Type.size['2xl'], fontWeight: Type.weight.heavy, lineHeight: 22 },
  stepperValue: {
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  stepperValueText: { fontSize: 15, fontWeight: Type.weight.bold },
  pickBtn: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 160,
    maxWidth: 220,
  },
  pickBtnText: { fontWeight: Type.weight.semibold, fontSize: Type.size.md },
});
