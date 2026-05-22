// Recordings are saved straight to Supabase (so the web app sees them). The
// iPad's practice-log screens read the local SQLite log, which never contains
// them — so the native practiceLog repo merges these Supabase-resolved
// recording entries in. Web's practiceLog already handles recordings inline.
//
// Returns [] if Supabase is unreachable or the user isn't signed in, so the
// local practice log still renders.

import { parseSections, sectionForPosition } from '@/lib/db/repos/documents';
import { parseRegions } from '@/lib/db/repos/passages';
import type { LibraryPracticeLogEntry } from '@/lib/db/repos/practiceLog';

import { supabase } from './client';

type RawRec = {
  id: number;
  piece_id: string | null;
  document_id: string | null;
  strategy: string;
  practiced_at: number;
  data_json: string | null;
  exercise_id: string | null;
};
type RawPiece = {
  id: string;
  title: string;
  folder_id: string | null;
  document_id: string | null;
  regions_json: string | null;
};
type RawDoc = {
  id: string;
  title: string;
  sections_json: string | null;
  folder_id: string | null;
};

/**
 * Every recording the signed-in user has saved, resolved to the same shape
 * the practice-log screens expect. A passage recording is filed under its
 * passage; a PDF-viewer recording (no passage) under its document's title.
 */
export async function getAllRecordingEntries(): Promise<
  LibraryPracticeLogEntry[]
> {
  try {
    const [recsRes, piecesRes, docsRes, foldersRes] = await Promise.all([
      supabase
        .from('practice_log')
        .select(
          'id, piece_id, document_id, strategy, practiced_at, data_json, exercise_id',
        )
        .eq('strategy', 'recording')
        .order('practiced_at', { ascending: false }),
      supabase
        .from('pieces')
        .select('id, title, folder_id, document_id, regions_json')
        .is('deleted_at', null),
      supabase
        .from('documents')
        .select('id, title, sections_json, folder_id')
        .is('deleted_at', null),
      supabase.from('folders').select('id, name').is('deleted_at', null),
    ]);
    if (
      recsRes.error ||
      piecesRes.error ||
      docsRes.error ||
      foldersRes.error
    ) {
      return [];
    }

    const pieceById = new Map<string, RawPiece>();
    for (const p of (piecesRes.data ?? []) as RawPiece[]) {
      pieceById.set(p.id, p);
    }
    const docById = new Map<string, RawDoc>();
    for (const d of (docsRes.data ?? []) as RawDoc[]) {
      docById.set(d.id, d);
    }
    const folderName = new Map<string, string>();
    for (const f of (foldersRes.data ?? []) as {
      id: string;
      name: string | null;
    }[]) {
      if (f.name) folderName.set(f.id, f.name);
    }

    return ((recsRes.data ?? []) as RawRec[])
      .map((r): LibraryPracticeLogEntry | null => {
        const base = {
          id: r.id,
          strategy: r.strategy,
          practiced_at: r.practiced_at,
          data_json: r.data_json,
          exercise_id: r.exercise_id,
          exercise_name: null,
        };
        if (r.piece_id) {
          const piece = pieceById.get(r.piece_id);
          if (!piece) return null;
          const doc = piece.document_id
            ? docById.get(piece.document_id)
            : undefined;
          let section_name: string | null = null;
          if (doc) {
            const first = parseRegions(piece.regions_json)[0];
            if (first) {
              section_name =
                sectionForPosition(
                  parseSections(doc.sections_json),
                  first.page,
                  first.y,
                )?.name ?? null;
            }
          }
          return {
            ...base,
            piece_id: r.piece_id,
            piece_title: piece.title,
            document_id: piece.document_id,
            document_title: doc?.title ?? null,
            section_name,
            folder_id: piece.folder_id,
            folder_name: piece.folder_id
              ? folderName.get(piece.folder_id) ?? null
              : null,
          };
        }
        // A document-level recording (made on the PDF viewer): filed under
        // the document's title, in the document's folder.
        if (r.document_id) {
          const doc = docById.get(r.document_id);
          if (!doc) return null;
          return {
            ...base,
            piece_id: r.document_id,
            piece_title: doc.title,
            document_id: null,
            document_title: null,
            section_name: null,
            folder_id: doc.folder_id,
            folder_name: doc.folder_id
              ? folderName.get(doc.folder_id) ?? null
              : null,
          };
        }
        return null;
      })
      .filter((r): r is LibraryPracticeLogEntry => r !== null);
  } catch {
    return [];
  }
}
