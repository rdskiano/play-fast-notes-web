// Apple Pencil score annotation for any screen showing a passage score.
//
// A standalone passage keeps its own annotation (pieces.annotation_data).
// A passage cropped from a PDF instead shares the PDF PAGE's annotation:
// drawing on it edits a region-viewport of the page, so a mark made while
// practicing shows on the PDF and on every other passage from that page.
// One shared set of marks.

import { useFocusEffect, useNavigation } from 'expo-router';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AnnotationCanvas } from '@/components/AnnotationCanvas';
import { CroppedAnnotation } from '@/components/CroppedAnnotation';
import { type PencilCanvasHandle } from '@/components/PencilCanvas';
import { RegionAnnotationCanvas } from '@/components/RegionAnnotationCanvas';
import { SignInModal } from '@/components/SignInModal';
import { ThemedText } from '@/components/themed-text';
import { setPencilAnnotating } from '@/lib/annotation/pencilMode';
import {
  getAnnotation,
  saveAnnotation,
  type Annotation,
} from '@/lib/db/repos/annotations';
import {
  getDocumentAnnotations,
  saveDocumentAnnotation,
} from '@/lib/db/repos/documentAnnotations';
import { getDocument, parsePages } from '@/lib/db/repos/documents';
import {
  parseRegions,
  type PassageRegion,
  type Passage,
} from '@/lib/db/repos/passages';
import { useSession } from '@/lib/supabase/auth';
import { uploadAnnotationImage } from '@/lib/supabase/storage';

// Auto-save this long after the last pencil edit, so marks survive even a
// navigation path that doesn't flush.
const AUTOSAVE_IDLE_MS = 2500;

type DocTarget = { docId: string; page: number; region: PassageRegion };
type DocPageInfo = {
  data: string | null;
  imageUri: string | null;
  pageW: number;
  pageH: number;
};

export function useScoreAnnotation(passage: Passage | null | undefined) {
  const session = useSession();
  const navigation = useNavigation();
  const scoreUri = passage?.source_uri;
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

  // A passage cropped from exactly one PDF page shares that page's annotation.
  const docTarget = useMemo<DocTarget | null>(() => {
    if (!passage?.document_id) return null;
    const regions = parseRegions(passage.regions_json);
    if (regions.length !== 1) return null;
    return {
      docId: passage.document_id,
      page: regions[0].page,
      region: regions[0],
    };
  }, [passage?.document_id, passage?.regions_json]);

  // Standalone passages: their own annotation. Document-backed: the page's.
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [docPage, setDocPage] = useState<DocPageInfo | null>(null);

  // Live mirror of the saved overlay-PNG URL, readable from inside saveDrawing
  // without threading the state through its dependency list. When a cloud
  // upload fails we re-save the PREVIOUS URL instead of nulling it out.
  const prevImageUriRef = useRef<string | null>(null);
  useEffect(() => {
    prevImageUriRef.current =
      (docTarget ? docPage?.imageUri : annotation?.imageUri) ?? null;
  }, [docTarget, docPage?.imageUri, annotation?.imageUri]);

  // Re-fetched on focus so a mark saved on another screen shows on return.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!session) {
        setAnnotation(null);
        setDocPage(null);
        return;
      }
      if (docTarget) {
        (async () => {
          try {
            const [doc, annotations] = await Promise.all([
              getDocument(docTarget.docId),
              getDocumentAnnotations(docTarget.docId),
            ]);
            if (cancelled) return;
            const page = doc
              ? parsePages(doc.pages_json).find(
                  (p) => p.index === docTarget.page,
                )
              : undefined;
            const ann = annotations.get(docTarget.page);
            setDocPage(
              page
                ? {
                    data: ann?.data ?? null,
                    imageUri: ann?.imageUri ?? null,
                    pageW: page.w,
                    pageH: page.h,
                  }
                : null,
            );
          } catch {
            if (!cancelled) setDocPage(null);
          }
        })();
      } else if (passage?.id) {
        getAnnotation(passage.id)
          .then((a) => {
            if (!cancelled) setAnnotation(a);
          })
          .catch(() => {
            if (!cancelled) setAnnotation(null);
          });
      }
      return () => {
        cancelled = true;
      };
    }, [session, docTarget, passage?.id]),
  );

  // Export the live drawing and persist it — to the PDF page for a
  // document-backed passage, else to the passage's own annotation. `silent`
  // skips the dimming overlay AND all error alerts (used by the idle
  // auto-save; a failing auto-save must not nag on every stroke — the exit
  // save retries and is the one allowed to surface a problem).
  //
  // The drawing DATA is the source of truth and is written even when the
  // overlay-PNG upload fails (stale sign-in, offline): on iOS the data write
  // is local SQLite with a best-effort cloud mirror (lib/db/repos/
  // annotations.ts), so the user's marks survive no matter what the network
  // does. A failed upload keeps the previous overlay URL instead of nulling
  // it, and the next successful save heals it. Losing real strokes because a
  // best-effort PNG sync threw was the original data-loss bug here.
  const saveDrawing = useCallback(
    async (opts?: { silent?: boolean }) => {
      const handle = canvasRef.current;
      if (!handle) return;
      const seq = editSeqRef.current;
      if (!opts?.silent) setSaving(true);
      try {
        const { data, png } = await handle.export();
        let imageUri: string | null = null;
        if (png && (docTarget || passage?.id)) {
          try {
            imageUri = await uploadAnnotationImage(
              docTarget
                ? `${docTarget.docId}-page${docTarget.page}`
                : (passage?.id as string),
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
        if (docTarget) {
          const next: Annotation = { data: data || null, imageUri };
          await saveDocumentAnnotation(docTarget.docId, docTarget.page, next);
          setDocPage((prev) =>
            prev
              ? { ...prev, data: next.data, imageUri: next.imageUri }
              : prev,
          );
        } else if (passage?.id) {
          const next: Annotation = { data: data || null, imageUri };
          await saveAnnotation(passage.id, next);
          setAnnotation(next);
        }
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
    [docTarget, passage?.id],
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

  // The PENCIL tab: enter annotation mode, or exit and save.
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
  // simultaneously with a dismissing modal / resigning keyboard (the
  // practice-log prompt's Save) — crashed the app natively on iPad. flush()
  // saves only when there are unsaved edits (no phantom alert on a clean
  // canvas), drops annotating so the canvas unmounts through its normal
  // hide-tool-picker path, and only then does the pop run.
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

  let layer: ReactNode = null;
  if (docTarget) {
    if (docPage && annotating) {
      layer = (
        <RegionAnnotationCanvas
          pageData={docPage.data}
          region={docTarget.region}
          pageW={docPage.pageW}
          pageH={docPage.pageH}
          canvasRef={canvasRef}
          onChange={onDraw}
        />
      );
    } else if (docPage?.imageUri) {
      layer = (
        <CroppedAnnotation
          imageUri={docPage.imageUri}
          region={docTarget.region}
          pageW={docPage.pageW}
          pageH={docPage.pageH}
        />
      );
    }
  } else if (scoreUri) {
    layer = (
      <AnnotationCanvas
        scoreUri={scoreUri}
        editable={annotating}
        initialData={annotation?.data}
        imageUri={annotation?.imageUri}
        canvasRef={canvasRef}
        onChange={onDraw}
      />
    );
  }

  const canvas = scoreUri ? (
    <>
      {layer}
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
    /** Step back the most recent stroke while annotating. */
    undo: () => canvasRef.current?.undo(),
    /** Drop inside the score's (relatively positioned) container. */
    canvas,
    /** Await before any forward navigation to persist unsaved marks. */
    flush,
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
