// Apple Pencil annotation for a multi-page document. Annotation is per page;
// editing is locked to the page that's on screen when you tap PENCIL (the
// pager is locked while annotating), and that page's drawing is saved on
// exit. Every page still *displays* its saved annotation via the map.

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { type PencilCanvasHandle } from '@/components/PencilCanvas';
import { SignInModal } from '@/components/SignInModal';
import { ThemedText } from '@/components/themed-text';
import { type Annotation } from '@/lib/db/repos/annotations';
import {
  getDocumentAnnotations,
  saveDocumentAnnotation,
} from '@/lib/db/repos/documentAnnotations';
import { useSession } from '@/lib/supabase/auth';
import { uploadAnnotationImage } from '@/lib/supabase/storage';

export function useDocumentAnnotation(
  documentId: string | undefined,
  currentPage: number,
) {
  const session = useSession();
  const [annotations, setAnnotations] = useState<Map<number, Annotation>>(
    new Map(),
  );
  const [annotating, setAnnotating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const canvasRef = useRef<PencilCanvasHandle>(null);

  // Every page's annotation; re-fetched on focus so marks made elsewhere show.
  useFocusEffect(
    useCallback(() => {
      if (!documentId || !session) {
        setAnnotations(new Map());
        return;
      }
      let cancelled = false;
      getDocumentAnnotations(documentId)
        .then((m) => {
          if (!cancelled) setAnnotations(m);
        })
        .catch(() => {
          if (!cancelled) setAnnotations(new Map());
        });
      return () => {
        cancelled = true;
      };
    }, [documentId, session]),
  );

  // The PENCIL tab: enter annotation mode on the current page, or exit + save.
  const toggle = useCallback(async () => {
    if (annotating) {
      const handle = canvasRef.current;
      if (handle && documentId) {
        setSaving(true);
        try {
          const { data, png } = await handle.export();
          const imageUri = png
            ? await uploadAnnotationImage(
                `${documentId}-page${currentPage}`,
                png,
              )
            : null;
          const next: Annotation = { data: data || null, imageUri };
          await saveDocumentAnnotation(documentId, currentPage, next);
          setAnnotations((prev) => new Map(prev).set(currentPage, next));
        } catch (e) {
          Alert.alert(
            'Could not save annotation',
            e instanceof Error ? e.message : 'Please try again.',
          );
        } finally {
          setSaving(false);
        }
      }
      setAnnotating(false);
    } else {
      if (session === undefined) return; // session still resolving
      if (!session) {
        setSignInOpen(true);
        return;
      }
      setAnnotating(true);
    }
  }, [annotating, documentId, currentPage, session]);

  const overlay = (
    <>
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
  );

  return {
    /** Feed to PracticeToolsLayer's `pencil` prop. */
    pencil: { active: annotating, onToggle: toggle },
    /** True while editing — the screen should lock the pager. */
    annotating,
    /** Saved annotation per page index, for display. */
    annotations,
    /** Attach to the current page's editable AnnotationCanvas. */
    canvasRef,
    /** Drop once at the screen root — saving spinner + sign-in modal. */
    overlay,
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
