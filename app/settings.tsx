import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
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
import { deleteAccount, wipeUserData } from '@/lib/supabase/account';
import { signOut, useSession } from '@/lib/supabase/auth';

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  tempo_ladder: 'Tempo Ladder',
  click_up: 'Interleaved Click-Up',
  rhythmic: 'Rhythmic Variation',
  micro_chaining: 'Micro-Chaining',
  macro_chaining: 'Macro-Chaining',
  interleaved: 'Rep Rotator',
  rep_rotator: 'Rep Rotator',
};

// Display order for the color customizer. macro_chaining is omitted until that
// strategy ships its UI (the label above keeps the StrategyKey record complete).
const STRATEGY_ORDER: StrategyKey[] = [
  'tempo_ladder',
  'click_up',
  'rhythmic',
  'micro_chaining',
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

  const [colorsExpanded, setColorsExpanded] = useState(false);
  const [timersExpanded, setTimersExpanded] = useState(false);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function onConfirmDelete() {
    setDeleteConfirmOpen(false);
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount();
      router.replace('/sign-in');
    } catch (e) {
      // Keep the user here with a visible error rather than dumping them on the
      // sign-in screen as if it worked — a half-finished delete needs a retry.
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[settings] account deletion failed', msg);
      setDeleteError(
        "Something went wrong deleting your account. Nothing was changed — please try again, or email rdskiano@gmail.com.",
      );
    } finally {
      setDeleting(false);
    }
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
          <Pressable
            onPress={() => setColorsExpanded((v) => !v)}
            hitSlop={6}
            style={styles.collapseHeader}>
            <ThemedText style={[styles.chevron, { color: C.icon }]}>
              {colorsExpanded ? '▾' : '▸'}
            </ThemedText>
            <ThemedText style={styles.sectionTitle}>Strategy colors</ThemedText>
          </Pressable>
          {colorsExpanded && (
            <Pressable onPress={resetAll} hitSlop={6} style={styles.resetBtn}>
              <ThemedText style={[styles.resetText, { color: C.tint }]}>
                Reset
              </ThemedText>
            </Pressable>
          )}
        </View>

        {colorsExpanded && (
          <>
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
          </>
        )}

        {/* ── Practice timers ────────────────────────────────────────── */}
        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <Pressable
            onPress={() => setTimersExpanded((v) => !v)}
            hitSlop={6}
            style={styles.collapseHeader}>
            <ThemedText style={[styles.chevron, { color: C.icon }]}>
              {timersExpanded ? '▾' : '▸'}
            </ThemedText>
            <ThemedText style={styles.sectionTitle}>Practice timers</ThemedText>
          </Pressable>
        </View>

        {timersExpanded && (
          <>
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
          </>
        )}

        {/* ── Account ─────────────────────────────────────────────────── */}
        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <Pressable
            onPress={() => setAccountExpanded((v) => !v)}
            hitSlop={6}
            style={styles.collapseHeader}>
            <ThemedText style={[styles.chevron, { color: C.icon }]}>
              {accountExpanded ? '▾' : '▸'}
            </ThemedText>
            <ThemedText style={styles.sectionTitle}>Account</ThemedText>
          </Pressable>
        </View>

        {accountExpanded && (
          <>
            {userEmail && (
              <ThemedText style={styles.sectionHint}>
                Signed in as {userEmail}.
              </ThemedText>
            )}
            {subscription.isActive && subscription.expiresAt && (
              <ThemedText style={[styles.sectionHint, { color: C.tint }]}>
                Free access is active through{' '}
                {formatExpiry(subscription.expiresAt)}.
              </ThemedText>
            )}
            <View style={styles.accountActions}>
              <Button
                label="Sign out"
                variant="outline"
                size="sm"
                onPress={onSignOut}
              />
              <Button
                label={wiping ? 'Resetting…' : 'Reset all my data'}
                variant="danger"
                size="sm"
                onPress={() => setWipeConfirmOpen(true)}
                disabled={wiping || deleting}
              />
              <Button
                label={deleting ? 'Deleting…' : 'Delete my account'}
                variant="danger"
                size="sm"
                onPress={() => {
                  setDeleteError(null);
                  setDeleteConfirmOpen(true);
                }}
                disabled={wiping || deleting}
              />
            </View>
            <ThemedText style={[styles.sectionHint, { marginTop: Spacing.xs }]}>
              Reset deletes every passage, exercise, log entry, recording, and
              folder you own, but keeps your sign-in so you can start fresh.
              Delete my account removes everything plus your login and email —
              it is permanent and cannot be undone.
            </ThemedText>
            {deleteError && (
              <ThemedText style={[styles.sectionHint, { color: C.tint, marginTop: Spacing.xs }]}>
                {deleteError}
              </ThemedText>
            )}
          </>
        )}

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

      <ConfirmModal
        visible={deleteConfirmOpen}
        title="Delete your account?"
        message={
          'This permanently deletes your account and everything in it — every passage, exercise, log entry, recording, and folder, plus your sign-in email. ' +
          'You will not be able to sign back in or recover any of it. This cannot be undone.'
        }
        confirmLabel="Delete my account"
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
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
          "Account — sign out, reset all your data, or delete your account. Resetting deletes every passage, exercise, log, recording, and folder you own but keeps your sign-in; deleting removes all of that plus your login and email. Both are permanent."
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'], gap: Spacing.lg },
  accountRow: { gap: Spacing.xs },
  accountActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  sectionTitle: { fontWeight: Type.weight.heavy, fontSize: Type.size.xl },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  chevron: { fontSize: Type.size.md, fontWeight: Type.weight.bold },
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
