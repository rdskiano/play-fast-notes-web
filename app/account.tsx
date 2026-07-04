import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PaywallModal } from '@/components/PaywallModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import {
  DOWNGRADE_TITLE,
  TRIAL_WARNING_DAYS,
  compEndingBody,
  downgradeBody,
  isLifetimeExpiry,
  trialEndingBody,
} from '@/constants/billing';
import { useEntitlement } from '@/lib/billing/entitlements';
import {
  countPracticeLogOlderThan,
  deletePracticeLogOlderThan,
} from '@/lib/db/repos/practiceLog';
import { deleteAccount, wipeUserData } from '@/lib/supabase/account';
import { signOut, useSession } from '@/lib/supabase/auth';
import { useSubscription } from '@/lib/supabase/subscription';
import { DEMO_TUTORIAL_EMAIL } from '@/lib/tutorials/demoMode';

function formatExpiry(unixMs: number): string {
  const d = new Date(unixMs);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const session = useSession();
  const userEmail = session?.user.email ?? null;
  const subscription = useSubscription();
  const entitlement = useEntitlement();

  const [paywallOpen, setPaywallOpen] = useState(false);
  // Practice-history trimming. trimConfirm holds the pending choice while
  // the confirm dialog is up; trimNote is the post-action feedback line.
  const [trimConfirm, setTrimConfirm] = useState<{
    cutoffMs: number;
    label: string;
    count: number;
  } | null>(null);
  const [trimming, setTrimming] = useState(false);
  const [trimNote, setTrimNote] = useState<string | null>(null);
  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function pickTrim(months: number, label: string) {
    const cutoffMs =
      months === 0
        ? Date.now()
        : Date.now() - months * 30 * 24 * 60 * 60 * 1000;
    setTrimNote(null);
    const count = await countPracticeLogOlderThan(cutoffMs).catch(() => 0);
    if (count === 0) {
      setTrimNote('Nothing that old in your history — nothing to delete.');
      return;
    }
    setTrimConfirm({ cutoffMs, label, count });
  }

  async function onConfirmTrim() {
    if (!trimConfirm) return;
    setTrimming(true);
    try {
      const n = await deletePracticeLogOlderThan(trimConfirm.cutoffMs);
      setTrimNote(
        `Deleted ${n} practice ${n === 1 ? 'entry' : 'entries'}.`,
      );
    } catch {
      setTrimNote('Could not trim history — check your connection and try again.');
    } finally {
      setTrimming(false);
      setTrimConfirm(null);
    }
  }

  async function onSignOut() {
    try {
      // The QA / onboarding test account (newbie@newbie.com) is meant to be
      // "forever new": wipe all its data on the way out so the next sign-in
      // always re-enters onboarding with an empty library. wipeUserData()
      // clears every user-scoped table + storage file, then signs out itself.
      if (userEmail === DEMO_TUTORIAL_EMAIL) {
        await wipeUserData();
      } else {
        await signOut();
      }
    } catch (e) {
      console.warn('[account] sign-out failed', e);
    }
    router.replace('/sign-in');
  }

  async function onConfirmWipe() {
    setWipeConfirmOpen(false);
    setWiping(true);
    try {
      await wipeUserData();
    } catch (e) {
      console.warn('[account] wipe failed', e);
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
      console.warn('[account] account deletion failed', msg);
      setDeleteError(
        "Something went wrong deleting your account. Nothing was changed — please try again, or email rdskiano@gmail.com.",
      );
    } finally {
      setDeleting(false);
    }
  }

  function sendFeedback() {
    const platform = Platform.OS === 'web' ? 'web' : Platform.OS;
    // The trailing context line helps triage a report (which build, who).
    const body =
      '\n\n\n—\n(Please keep the line below — it helps me look into it.)\n' +
      `Play Fast Notes · ${platform}${userEmail ? ' · ' + userEmail : ''}`;
    const url =
      'mailto:rdskiano@gmail.com' +
      `?subject=${encodeURIComponent('Play Fast Notes feedback')}` +
      `&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() => {
      // No mail client wired up — the address is shown on screen as a fallback.
    });
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}>
        <View style={styles.column}>
          {/* Big-title header (DESIGN_RULES §3 — left-aligned page title) */}
          <View style={styles.headerBlock}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <ThemedText style={styles.backLink}>‹ Back</ThemedText>
            </Pressable>
            <ThemedText type="title">Account</ThemedText>
          </View>

          {/* Plan + status */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Your plan</ThemedText>
            <View style={styles.card}>
              {userEmail && (
                <ThemedText style={styles.hint}>Signed in as {userEmail}.</ThemedText>
              )}
              {/* Practice Pro status. 'comp' = granted free (founding users,
                  testers); 'pro' = bought the one-time unlock. */}
              <ThemedText style={styles.statusLine}>
                {entitlement.reason === 'subscription'
                  ? subscription.tier === 'comp'
                    ? subscription.expiresAt && !isLifetimeExpiry(subscription.expiresAt)
                      ? `Practice Pro — free through ${formatExpiry(subscription.expiresAt)}. Thank you for being here early.`
                      : 'Practice Pro — free, on the house. Thank you for being here early.'
                    : 'Practice Pro — unlocked, yours forever.'
                  : entitlement.reason === 'trial'
                    ? `Practice Pro trial — ${entitlement.trialDaysLeft} day${entitlement.trialDaysLeft === 1 ? '' : 's'} left.`
                    : entitlement.reason === 'none'
                      ? 'Free plan.'
                      : null}
              </ThemedText>
              {/* Trial-ending warning — only in the final stretch. Honest about
                  what changes, reassuring that nothing is deleted. */}
              {entitlement.reason === 'trial' &&
                entitlement.trialDaysLeft != null &&
                entitlement.trialDaysLeft <= TRIAL_WARNING_DAYS && (
                  <ThemedText style={styles.hint}>
                    {trialEndingBody(entitlement.trialDaysLeft)}
                  </ThemedText>
                )}
              {/* Comp-ending warning — same final stretch, for dated comps
                  (free-month / six-month cohorts) that skip the trial path. */}
              {entitlement.reason === 'subscription' &&
                subscription.tier === 'comp' &&
                subscription.expiresAt != null &&
                !isLifetimeExpiry(subscription.expiresAt) &&
                subscription.expiresAt - Date.now() <=
                  TRIAL_WARNING_DAYS * 24 * 60 * 60 * 1000 && (
                  <ThemedText style={styles.hint}>
                    {compEndingBody(formatExpiry(subscription.expiresAt))}
                  </ThemedText>
                )}
              {/* Downgrade — once on the free plan, lead with reassurance. */}
              {entitlement.reason === 'none' && (
                <ThemedText style={styles.hint}>
                  {DOWNGRADE_TITLE}. {downgradeBody(0)}
                </ThemedText>
              )}
              {/* Upgrade entry point: trial + free users, PLUS dated-comp
                  holders (their access ends — the expiry emails invite them to
                  buy, so the button must exist while the comp is still live).
                  Hidden for lifetime holders (bought or lifetime comp — nothing
                  to sell) and while the paywall is off ('paywall-off' preview). */}
              {(entitlement.reason === 'trial' ||
                entitlement.reason === 'none' ||
                (entitlement.reason === 'subscription' &&
                  subscription.tier === 'comp' &&
                  subscription.expiresAt != null &&
                  !isLifetimeExpiry(subscription.expiresAt))) && (
                  <View style={styles.accountActions}>
                    <Button
                      label="Unlock Practice Pro"
                      size="sm"
                      onPress={() => setPaywallOpen(true)}
                    />
                  </View>
                )}
            </View>
          </View>

          {/* Feedback */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Feedback</ThemedText>
            <View style={styles.card}>
              <ThemedText style={styles.hint}>
                Hit a bug or have an idea — especially about the new “What should I
                practice?” coach (beta)? Email me at rdskiano@gmail.com.
              </ThemedText>
              <View style={styles.accountActions}>
                <Button label="Send feedback" variant="outline" size="sm" onPress={sendFeedback} />
              </View>
            </View>
          </View>

          {/* Native only: friendly entry to the web→device import that used to
              hide behind the /import-supabase URL. */}
          {Platform.OS !== 'web' && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Web account</ThemedText>
              <View style={styles.card}>
                <ThemedText style={styles.hint}>
                  Signs in to your playfastnotes.com account and copies its music,
                  practice history, and photos onto this device.
                </ThemedText>
                <View style={styles.accountActions}>
                  <Button
                    label="Download my web library"
                    variant="outline"
                    size="sm"
                    onPress={() => router.push('/import-supabase' as never)}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Practice history */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Practice history</ThemedText>
            <View style={styles.card}>
              <ThemedText style={styles.hint}>
                Trimming permanently deletes older practice-log entries, including
                any recordings saved with them. Your passages and exercises are not
                touched.
              </ThemedText>
              <View style={styles.accountActions}>
                <Button
                  label="Keep last 6 months"
                  variant="outline"
                  size="sm"
                  disabled={trimming}
                  onPress={() => pickTrim(6, 'logged more than 6 months ago')}
                />
                <Button
                  label="Keep last month"
                  variant="outline"
                  size="sm"
                  disabled={trimming}
                  onPress={() => pickTrim(1, 'logged more than a month ago')}
                />
                <Button
                  label="Clear all history"
                  variant="dangerGhost"
                  size="sm"
                  disabled={trimming}
                  onPress={() => pickTrim(0, 'in your history')}
                />
              </View>
              {trimNote && (
                <ThemedText style={[styles.hint, { color: Palette.accent }]}>
                  {trimNote}
                </ThemedText>
              )}
            </View>
          </View>

          {/* Account / danger zone */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Account</ThemedText>
            <View style={styles.card}>
              {/* DESIGN_RULES §5: one filled-danger per screen (Delete);
                  everything lower-risk is tertiary or ghost. */}
              <Button
                label="Sign out"
                variant="tertiary"
                size="sm"
                fullWidth
                onPress={onSignOut}
              />
              <View style={styles.dangerRow}>
                <Button
                  label={wiping ? 'Resetting…' : 'Reset all my data'}
                  variant="dangerGhost"
                  size="sm"
                  onPress={() => setWipeConfirmOpen(true)}
                  disabled={wiping || deleting}
                  style={styles.dangerHalf}
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
                  style={styles.dangerHalf}
                />
              </View>
              <ThemedText style={[styles.hint, { textAlign: 'center' }]}>
                Deleting your account is permanent and can’t be undone.
              </ThemedText>
              {deleteError && (
                <ThemedText style={[styles.hint, { color: Palette.danger }]}>
                  {deleteError}
                </ThemedText>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <PaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
      />

      <ConfirmModal
        visible={trimConfirm !== null}
        title="Trim practice history?"
        message={`${trimConfirm?.count ?? 0} practice ${
          (trimConfirm?.count ?? 0) === 1 ? 'entry' : 'entries'
        } ${trimConfirm?.label ?? ''} will be permanently deleted, including any recordings in them. This cannot be undone.`}
        confirmLabel={trimming ? 'Deleting…' : 'Delete them'}
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirmTrim}
        onCancel={() => setTrimConfirm(null)}
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
        id="account"
        visible={false}
        title="Account"
        body={
          'Sign out, reset all your data, or delete your account.\n\n' +
          'Reset all my data deletes every passage, exercise, log, recording, and folder you own but keeps your sign-in, so you can start fresh.\n\n' +
          'Delete my account removes all of that plus your login and email. Both are permanent and cannot be undone.'
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'], alignItems: 'center' },
  // Centered column on wide screens (iPad / laptop); full width on phone.
  column: { width: '100%', maxWidth: 640, gap: Spacing.xl },
  headerBlock: { gap: Spacing.xs, marginBottom: Spacing.xs },
  backLink: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, color: Palette.accent },
  section: { gap: Spacing.sm },
  sectionTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    letterSpacing: -0.2,
  },
  card: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Lift,
  },
  statusLine: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
    fontVariant: ['tabular-nums'],
  },
  accountActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  // Reset (ghost) + Delete (filled) share a row; each takes half.
  dangerRow: { flexDirection: 'row', gap: Spacing.sm },
  dangerHalf: { flex: 1 },
  hint: { color: Palette.textSecondary, fontSize: Type.size.sm, lineHeight: 18 },
});
