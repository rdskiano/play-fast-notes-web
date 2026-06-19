import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PaywallModal } from '@/components/PaywallModal';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Colors } from '@/constants/theme';
import { Opacity, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

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
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Back"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Account
          </ThemedText>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {userEmail && (
          <ThemedText style={styles.sectionHint}>
            Signed in as {userEmail}.
          </ThemedText>
        )}
        {/* Practice Pro status + the paywall preview/upgrade entry point.
            While PAYWALL_ENABLED is false everyone reads as Pro and the
            button just previews the sheet. A 'comp' tier is the 6-month
            reward for pre-launch users and tester codes; 'pro' is paid. */}
        <ThemedText style={[styles.sectionHint, { color: C.tint }]}>
          {entitlement.reason === 'subscription'
            ? subscription.tier === 'comp'
              ? subscription.expiresAt
                ? `Practice Pro — free through ${formatExpiry(subscription.expiresAt)}. Thank you for being here early.`
                : 'Practice Pro — on the house. Thank you for being here early.'
              : 'Practice Pro subscription active.'
            : entitlement.reason === 'trial'
              ? `Practice Pro trial — ${entitlement.trialDaysLeft} day${entitlement.trialDaysLeft === 1 ? '' : 's'} left.`
              : entitlement.reason === 'none'
                ? 'Free plan.'
                : null}
        </ThemedText>
        {entitlement.reason !== 'subscription' && (
            <View style={styles.accountActions}>
              <Button
                label={
                  entitlement.reason === 'paywall-off'
                    ? 'Preview Practice Pro'
                    : 'Get Practice Pro'
                }
                size="sm"
                onPress={() => setPaywallOpen(true)}
              />
            </View>
          )}

        <ThemedText style={[styles.sectionHint, { marginTop: Spacing.md }]}>
          Feedback
        </ThemedText>
        <View style={styles.accountActions}>
          <Button label="Send feedback" variant="outline" size="sm" onPress={sendFeedback} />
        </View>
        <ThemedText style={styles.sectionHint}>
          Hit a bug or have an idea — especially about the new “What should I
          practice?” coach (beta)? Email me at rdskiano@gmail.com.
        </ThemedText>

        {/* Native only: friendly entry to the web→device import that used to
            hide behind the /import-supabase URL. */}
        {Platform.OS !== 'web' && (
          <>
            <ThemedText style={[styles.sectionHint, { marginTop: Spacing.md }]}>
              Web account
            </ThemedText>
            <View style={styles.accountActions}>
              <Button
                label="Download my web library"
                variant="outline"
                size="sm"
                onPress={() => router.push('/import-supabase' as never)}
              />
            </View>
            <ThemedText style={styles.sectionHint}>
              Signs in to your playfastnotes.com account and copies its music,
              practice history, and photos onto this device.
            </ThemedText>
          </>
        )}

        <ThemedText style={[styles.sectionHint, { marginTop: Spacing.md }]}>
          Practice history
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
            variant="danger"
            size="sm"
            disabled={trimming}
            onPress={() => pickTrim(0, 'in your history')}
          />
        </View>
        <ThemedText style={styles.sectionHint}>
          Trimming permanently deletes older practice-log entries, including
          any recordings saved with them. Your passages and exercises are not
          touched.
        </ThemedText>
        {trimNote && (
          <ThemedText style={[styles.sectionHint, { color: C.tint }]}>
            {trimNote}
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
          Reset deletes every passage, exercise, log entry, recording, and folder
          you own, but keeps your sign-in so you can start fresh. Delete my account
          removes everything plus your login and email — it is permanent and
          cannot be undone.
        </ThemedText>
        {deleteError && (
          <ThemedText style={[styles.sectionHint, { color: C.tint, marginTop: Spacing.xs }]}>
            {deleteError}
          </ThemedText>
        )}
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
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'], gap: Spacing.lg },
  accountActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  sectionHint: { opacity: Opacity.muted, fontSize: Type.size.sm, lineHeight: 18 },
});
