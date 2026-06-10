import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Colors } from '@/constants/theme';
import { Opacity, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { deleteAccount, wipeUserData } from '@/lib/supabase/account';
import { signOut, useSession } from '@/lib/supabase/auth';
import { useSubscription } from '@/lib/supabase/subscription';

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

  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onSignOut() {
    try {
      await signOut();
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
        {subscription.isActive && subscription.expiresAt && (
          <ThemedText style={[styles.sectionHint, { color: C.tint }]}>
            Free access is active through {formatExpiry(subscription.expiresAt)}.
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
