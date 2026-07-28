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
import { setPencilAnnotating } from '@/lib/annotation/pencilMode';
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
  // Counts real user edits this session; bumped by onDraw, remembered by
  // saveDrawing. Zero (or already-saved) = nothing to persist, so exiting
  // pencil mode without drawing skips the save entirely — no phantom
  // "Could not save annotation" for an untouched canvas.
  const editSeqRef = useRef(0);
  const savedSeqRef = useRef(0);

  // Foot-pedal capture stands down while a pencil session is live — its
  // first-responder re-claim timer hides the PencilKit tool palette.
  useEffect(() => {
    setPencilAnnotating(annotating);
    return () => setPencilAnnotating(false);
  }, [annotating]);

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

  // Live mirror of the current page's saved overlay-PNG URL, readable from
  // inside saveDrawing without joining its dependency list. When a cloud
  // upload fails we re-save the PREVIOUS URL instead of nulling it out.
  const prevImageUriRef = useRef<string | null>(null);
  useEffect(() => {
    prevImageUriRef.current = annotations.get(currentPage)?.imageUri ?? null;
  }, [annotations, currentPage]);

  // Export the current page's drawing and persist it. Only meaningful while
  // the canvas is mounted (annotation mode on). `silent` skips the dimming
  // overlay AND all error alerts (used by the idle auto-save; a failing
  // auto-save must not nag on every stroke — the exit save retries and is
  // the one allowed to surface a problem).
  //
  // The drawing DATA is the source of truth and is written even when the
  // overlay-PNG upload fails (stale sign-in, offline): on iOS the data write
  // is local SQLite, so the user's marks survive no matter what the network
  // does. A failed upload keeps the previous overlay URL instead of nulling
  // it, and the next successful save heals it.
  const saveDrawing = useCallback(
    async (opts?: { silent?: boolean }) => {
      const handle = canvasRef.current;
      if (!handle || !documentId) return;
      const seq = editSeqRef.current;
      if (!opts?.silent) setSaving(true);
      try {
        const { data, png } = await handle.export();
        let imageUri: string | null = null;
        if (png) {
          try {
            imageUri = await uploadAnnotationImage(
              `${documentId}-page${currentPage}`,
              png,
            );
          } catch (uploadErr) {
            imageUri = prevImageUriRef.current;
            console.warn(
              '[annotation] overlay upload failed — marks saved, overlay not synced:',
              uploadErr,
            );
          }
        }
        const next: Annotation = { data: data || null, imageUri };
        await saveDocumentAnnotation(documentId, currentPage, next);
        setAnnotations((prev) => new Map(prev).set(currentPage, next));
        savedSeqRef.current = seq;
      } catch (e) {
        if (!opts?.silent) {
          Alert.alert(
            'Could not save annotation',
            e instanceof Error ? e.message : 'Please try again.',
          );
        } else {
          console.warn('[annotation] auto-save failed (will retry on exit):', e);
        }
      } finally {
        if (!opts?.silent) setSaving(false);
      }
    },
    [documentId, currentPage],
  );

  // Each pencil edit marks the session dirty and (re)arms the idle auto-save.
  const onDraw = useCallback(() => {
    editSeqRef.current += 1;
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
    // Only save when there are edits the last save didn't capture.
    if (editSeqRef.current !== savedSeqRef.current) await saveDrawing();
    // If that save FAILED (seq still behind), keep the canvas alive — tearing
    // it down would destroy the unsaved strokes right after telling the user
    // the save didn't work. They can fix the cause (or retry) and exit again.
    if (editSeqRef.current !== savedSeqRef.current) return;
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

  // Leaving the screen while annotating: exit pencil mode FIRST, then let nav
  // proceed a beat later. The PKCanvasView is the iOS first responder while
  // the tool palette is up; letting the screen pop tear it down mid-flight —
  // simultaneously with a dismissing modal / resigning keyboard — crashed the
  // app natively on iPad (see useScoreAnnotation for the full story). flush()
  // saves only when there are unsaved edits, drops annotating so the canvas
  // unmounts through its normal hide-tool-picker path, then the pop runs.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!annotating) return;
      e.preventDefault();
      void flush().finally(() => {
        // Two frames: one for React to commit the canvas unmount, one for
        // the native side to apply it (resign first responder, detach the
        // palette) before the screen teardown starts.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => navigation.dispatch(e.data.action)),
        );
      });
    });
    return unsubscribe;
  }, [navigation, annotating, flush]);

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
