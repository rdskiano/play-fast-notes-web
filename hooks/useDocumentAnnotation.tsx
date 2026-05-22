// Apple Pencil annotation for a multi-page document. Annotation is per page;
// editing is locked to the page that's on screen when you tap PENCIL (the
// pager is locked while annotating), and that page's drawing is saved on
// exit. Every page still *displays* its saved annotation via the map.

import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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

// Auto-save this long after the last pencil edit.
const AUTOSAVE_IDLE_MS = 2500;

export function useDocumentAnnotation(
  documentId: string | undefined,
  currentPage: number,
) {
  const session = useSession();
  const navigation = useNavigation();
  const [annotations, setAnnotations] = useState<Map<number, Annotation>>(
    new Map(),
  );
  const [annotating, setAnnotating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const canvasRef = useRef<PencilCanvasHandle>(null);
  const idleSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Export the current page's drawing and persist it. Only meaningful while
  // the canvas is mounted (annotation mode on). `silent` skips the dimming
  // overlay (used by the idle auto-save).
  const saveDrawing = useCallback(
    async (opts?: { silent?: boolean }) => {
      const handle = canvasRef.current;
      if (!handle || !documentId) return;
      if (!opts?.silent) setSaving(true);
      try {
        const { data, png } = await handle.export();
        const imageUri = png
          ? await uploadAnnotationImage(`${documentId}-page${currentPage}`, png)
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
        if (!opts?.silent) setSaving(false);
      }
    },
    [documentId, currentPage],
  );

  // Each pencil edit (re)arms the idle auto-save.
  const onDraw = useCallback(() => {
    if (idleSaveRef.current) clearTimeout(idleSaveRef.current);
    idleSaveRef.current = setTimeout(() => {
      idleSaveRef.current = null;
      saveDrawing({ silent: true });
    }, AUTOSAVE_IDLE_MS);
  }, [saveDrawing]);

  // Persist unsaved marks before forward navigation. A push doesn't fire
  // 'beforeRemove', so the screen must await this before navigating — else
  // the next screen loads before the save lands. Pops use 'beforeRemove'.
  const flush = useCallback(async () => {
    if (idleSaveRef.current) {
      clearTimeout(idleSaveRef.current);
      idleSaveRef.current = null;
    }
    if (!annotating) return;
    await saveDrawing();
    setAnnotating(false);
  }, [annotating, saveDrawing]);

  // The PENCIL tab: enter annotation mode on the current page, or exit + save.
  const toggle = useCallback(async () => {
    if (annotating) {
      await flush();
    } else {
      if (session === undefined) return; // session still resolving
      if (!session) {
        setSignInOpen(true);
        return;
      }
      setAnnotating(true);
    }
  }, [annotating, session, flush]);

  // Leaving the screen with unsaved marks: save first, then let nav proceed.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!annotating) return;
      e.preventDefault();
      if (idleSaveRef.current) {
        clearTimeout(idleSaveRef.current);
        idleSaveRef.current = null;
      }
      saveDrawing().finally(() => navigation.dispatch(e.data.action));
    });
    return unsubscribe;
  }, [navigation, annotating, saveDrawing]);

  // Drop a pending auto-save if the screen unmounts.
  useEffect(
    () => () => {
      if (idleSaveRef.current) clearTimeout(idleSaveRef.current);
    },
    [],
  );

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
    /** Pass to the editable canvas's `onChange` — arms the idle auto-save. */
    onDraw,
    /** Await before any forward navigation to persist unsaved marks. */
    flush,
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
