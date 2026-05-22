// Apple Pencil score annotation, packaged for any screen that shows a passage
// score. Centralises the fetch / edit-toggle / save / sign-in logic so each
// screen only has to: call the hook, drop `canvas` into the score's container,
// and pass `pencil` to PracticeToolsLayer's PENCIL tab.

import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AnnotationCanvas } from '@/components/AnnotationCanvas';
import { DocumentPageUnderlay } from '@/components/DocumentPageUnderlay';
import { type PencilCanvasHandle } from '@/components/PencilCanvas';
import { SignInModal } from '@/components/SignInModal';
import { ThemedText } from '@/components/themed-text';
import {
  getAnnotation,
  saveAnnotation,
  type Annotation,
} from '@/lib/db/repos/annotations';
import { type Passage } from '@/lib/db/repos/passages';
import { useSession } from '@/lib/supabase/auth';
import { uploadAnnotationImage } from '@/lib/supabase/storage';

export function useScoreAnnotation(passage: Passage | null | undefined) {
  const passageId = passage?.id;
  const scoreUri = passage?.source_uri;
  const session = useSession();
  const navigation = useNavigation();
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const canvasRef = useRef<PencilCanvasHandle>(null);

  // Annotations live in Supabase; they load once we have a session.
  useEffect(() => {
    if (!passageId || !session) {
      setAnnotation(null);
      return;
    }
    let cancelled = false;
    getAnnotation(passageId)
      .then((a) => {
        if (!cancelled) setAnnotation(a);
      })
      .catch(() => {
        if (!cancelled) setAnnotation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [passageId, session]);

  // Export the live drawing and persist it. Only meaningful while the canvas
  // is mounted (annotation mode on).
  const saveDrawing = useCallback(async () => {
    const handle = canvasRef.current;
    if (!handle || !passageId) return;
    setSaving(true);
    try {
      const { data, png } = await handle.export();
      const imageUri = png ? await uploadAnnotationImage(passageId, png) : null;
      const next: Annotation = { data: data || null, imageUri };
      await saveAnnotation(passageId, next);
      setAnnotation(next);
    } catch (e) {
      Alert.alert(
        'Could not save annotation',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [passageId]);

  // The PENCIL tab: enter annotation mode, or exit and save.
  const toggle = useCallback(async () => {
    if (annotating) {
      await saveDrawing();
      setAnnotating(false);
    } else {
      if (session === undefined) return; // session still resolving
      if (!session) {
        setSignInOpen(true);
        return;
      }
      setAnnotating(true);
    }
  }, [annotating, session, saveDrawing]);

  // Leaving the screen (exit / back / done) with unsaved marks: save first,
  // then let the navigation proceed.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!annotating) return;
      e.preventDefault();
      saveDrawing().finally(() => navigation.dispatch(e.data.action));
    });
    return unsubscribe;
  }, [navigation, annotating, saveDrawing]);

  const canvas = scoreUri ? (
    <>
      {passage && <DocumentPageUnderlay passage={passage} />}
      <AnnotationCanvas
        scoreUri={scoreUri}
        editable={annotating}
        initialData={annotation?.data}
        imageUri={annotation?.imageUri}
        canvasRef={canvasRef}
      />
      {saving && (
        <View style={styles.savingOverlay}>
          <View style={styles.savingPill}>
            <ActivityIndicator color="#fff" />
            <ThemedText style={styles.savingText}>Saving…</ThemedText>
          </View>
        </View>
      )}
      <SignInModal
        visible={signInOpen}
        onClose={() => setSignInOpen(false)}
        onSignedIn={() => {
          setSignInOpen(false);
          setAnnotating(true);
        }}
      />
    </>
  ) : null;

  return {
    /** Feed to PracticeToolsLayer's `pencil` prop. */
    pencil: { active: annotating, onToggle: toggle },
    /** Drop inside the score's (relatively positioned) container. */
    canvas,
  };
}

const styles = StyleSheet.create({
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0000003a',
  },
  savingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#222',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  savingText: { color: '#fff', fontWeight: '800' },
});
