// Community exercise detail. Free to view + download. Renders the notation
// live (so it's nicer than a PDF thumbnail) and offers "Download PDF" via the
// existing branded export. The contributor can remove their own submission.

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PromptModal } from '@/components/PromptModal';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { configToAbcs, exerciseShapeLabel } from '@/lib/community/exerciseConfig';
import { downloadExercisePdf } from '@/lib/community/exerciseExport';
import {
  getCommunityExercise,
  incrementDownload,
  unpublishExercise,
  updateExerciseTitle,
  type CommunityExercise,
} from '@/lib/community/exercises';
import { INSTRUMENTS } from '@/lib/music/pitch';
import { supabase } from '@/lib/supabase/client';

const PREVIEW_COUNT = 3;

export default function CommunityExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { width } = useWindowDimensions();

  const [ex, setEx] = useState<CommunityExercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [row, sessionRes] = await Promise.all([
          id ? getCommunityExercise(id) : Promise.resolve(null),
          supabase.auth.getSession(),
        ]);
        if (!alive) return;
        setEx(row);
        const uid = sessionRes.data.session?.user.id;
        setIsOwner(!!row && !!uid && row.contributor_user_id === uid);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  function onDownload() {
    if (!ex) return;
    downloadExercisePdf(ex.title, ex.config_json);
    void incrementDownload(ex.id);
  }

  async function onSaveTitle(next: string) {
    const clean = next.trim();
    setEditOpen(false);
    if (!ex || clean.length === 0 || clean === ex.title) return;
    // Optimistic: the community title is a snapshot the owner is correcting.
    setEx({ ...ex, title: clean });
    try {
      await updateExerciseTitle(ex.id, clean);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save the title. Try again.';
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      // Roll back the optimistic change on failure.
      setEx((cur) => (cur ? { ...cur, title: ex.title } : cur));
    }
  }

  async function onRemove() {
    if (!ex) return;
    setRemoveOpen(false);
    try {
      await unpublishExercise(ex.id);
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not remove. Try again.';
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    }
  }

  const previews = ex ? configToAbcs(ex.config_json).slice(0, PREVIEW_COUNT) : [];
  const totalCount = ex ? configToAbcs(ex.config_json).length : 0;
  const instrument =
    INSTRUMENTS.find((i) => i.id === ex?.instrument_id)?.label ?? null;
  const shape = ex ? exerciseShapeLabel(ex.config_json) : null;
  const staffWidth = Math.min(width, 680) - Spacing.md * 2;

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Back"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            {ex?.title ?? 'Exercise'}
          </ThemedText>
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ThemedText style={{ opacity: Opacity.muted }}>Loading…</ThemedText>
        </View>
      ) : !ex ? (
        <View style={styles.center}>
          <ThemedText style={{ opacity: Opacity.muted }}>
            This exercise is no longer available.
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl }}>
          <View style={{ gap: 2 }}>
            <ThemedText type="subtitle">{ex.title}</ThemedText>
            <ThemedText style={[styles.meta, { color: C.icon }]}>
              by {ex.contributor_name}
            </ThemedText>
            {ex.piece_title ? (
              <ThemedText style={[styles.meta, { color: C.icon }]}>
                {ex.piece_title}
                {ex.composer ? ` — ${ex.composer}` : ''}
              </ThemedText>
            ) : null}
            {[instrument, shape].filter(Boolean).length > 0 && (
              <ThemedText style={[styles.meta, { color: C.icon }]}>
                {[instrument, shape].filter(Boolean).join(' · ')}
              </ThemedText>
            )}
            {ex.notes ? <ThemedText style={styles.notes}>{ex.notes}</ThemedText> : null}
          </View>

          <Button label="Download PDF" onPress={onDownload} />

          {previews.length > 0 ? (
            <View style={{ gap: Spacing.md }}>
              {previews.map((p, i) => (
                <View key={i} style={[styles.staffCard, { borderColor: C.icon + '33' }]}>
                  <ThemedText style={[styles.staffNum, { color: C.icon }]}>{i + 1}.</ThemedText>
                  <AbcStaffView abc={p.abc} width={staffWidth} scale={0.9} wrap centered />
                </View>
              ))}
              {totalCount > previews.length && (
                <ThemedText style={[styles.meta, { color: C.icon, textAlign: 'center' }]}>
                  + {totalCount - previews.length} more in the PDF.
                </ThemedText>
              )}
            </View>
          ) : (
            <ThemedText style={[styles.meta, { color: C.icon }]}>
              Preview unavailable — download the PDF to view.
            </ThemedText>
          )}

          {isOwner && (
            <View style={{ gap: Spacing.sm }}>
              <Button
                label="Edit title"
                variant="outline"
                size="sm"
                onPress={() => setEditOpen(true)}
              />
              <Button
                label="Remove from community"
                variant="danger"
                size="sm"
                onPress={() => setRemoveOpen(true)}
              />
            </View>
          )}
        </ScrollView>
      )}

      <PromptModal
        visible={editOpen}
        title="Edit title"
        message="This is the name other players see in the community library."
        initialValue={ex?.title ?? ''}
        placeholder="e.g. mvt. 4 sixteenths, mm. 281–291"
        submitLabel="Save"
        onSubmit={onSaveTitle}
        onCancel={() => setEditOpen(false)}
      />

      <ConfirmModal
        visible={removeOpen}
        title="Remove from community?"
        message="This takes your exercise out of the community library. Your own copy stays in your passage."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        onConfirm={onRemove}
        onCancel={() => setRemoveOpen(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  meta: { fontSize: Type.size.sm },
  notes: { fontSize: Type.size.sm, marginTop: Spacing.xs },
  staffCard: { borderWidth: 1, borderRadius: Radii.md, padding: Spacing.sm, gap: 4 },
  staffNum: { fontSize: Type.size.xs, fontWeight: Type.weight.semibold },
});
