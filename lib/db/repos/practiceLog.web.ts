import { parseSections, sectionForPosition } from '@/lib/db/repos/documents';
import { parseRegions } from '@/lib/db/repos/passages';
import { supabase } from '@/lib/supabase/client';

export type PracticeLogEntry = {
  id: number;
  piece_id: string;
  strategy: string;
  practiced_at: number;
  data_json: string | null;
  exercise_id: string | null;
  exercise_name: string | null;
};

export type PracticeLogWithTitle = PracticeLogEntry & {
  piece_title: string;
  // Set when the passage lives inside a document. Used to render entries as
  // "Mahler 9 / IV. Adagio / bars 281-291" in the practice log.
  document_id: string | null;
  document_title: string | null;
  section_name: string | null;
  // True when the passage/document this entry belongs to has since been deleted.
  // The log keeps showing the entry (so you don't lose practice history) and the
  // UI tags it so you know the source is gone from your library. Optional: only
  // the library log resolves it; per-passage views leave it unset.
  is_deleted?: boolean;
};

export type LibraryPracticeLogEntry = PracticeLogWithTitle & {
  folder_id: string | null;
  folder_name: string | null;
};

// ---------------------------------------------------------------------------
// Save resilience. A finished practice session is the one thing this app must
// never lose, and a flaky connection at the moment the user taps "finish" used
// to lose it silently. logPractice now retries transient failures, and if the
// insert still fails it parks the row in localStorage and syncs it on the next
// opportunity (next log attempt or next library visit). The caller gets a
// negative id back so the session flow (stop metronome, navigate home)
// continues normally.

const PENDING_LOGS_KEY = 'pfn:pending-practice-log:v1';
const PENDING_LOGS_MAX = 200;

type PendingLogRow = {
  piece_id: string;
  strategy: string;
  practiced_at: number;
  data_json: string | null;
  exercise_id: string | null;
};

function readPendingLogs(): PendingLogRow[] {
  try {
    const raw = localStorage.getItem(PENDING_LOGS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PendingLogRow[]) : [];
  } catch {
    return [];
  }
}

function writePendingLogs(rows: PendingLogRow[]) {
  try {
    if (rows.length === 0) localStorage.removeItem(PENDING_LOGS_KEY);
    else localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(rows.slice(-PENDING_LOGS_MAX)));
  } catch {
    // localStorage full or unavailable — nothing more we can do.
  }
}

async function insertLogRow(row: PendingLogRow): Promise<number> {
  const { data: inserted, error } = await supabase
    .from('practice_log')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return (inserted as { id: number }).id;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [500, 1500];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= delays.length) throw e;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

/** Re-attempt any practice-log rows that were parked while offline.
 *  Rows keep their original practiced_at, so synced sessions land on the
 *  right day in the log. Stops at the first failure (still offline). */
export async function flushPendingPracticeLogs(): Promise<void> {
  let pending = readPendingLogs();
  while (pending.length > 0) {
    try {
      await insertLogRow(pending[0]);
    } catch {
      break;
    }
    pending = pending.slice(1);
    writePendingLogs(pending);
  }
}

// Tell the user once per visit, not once per failed save.
let warnedPendingThisLoad = false;

export async function logPractice(
  piece_id: string,
  strategy: string,
  data?: Record<string, unknown>,
  exercise_id?: string | null,
): Promise<number> {
  // Opportunistic sync of anything parked by an earlier failure.
  flushPendingPracticeLogs().catch(() => {});
  const row: PendingLogRow = {
    piece_id,
    strategy,
    practiced_at: Date.now(),
    data_json: data ? JSON.stringify(data) : null,
    exercise_id: exercise_id ?? null,
  };
  try {
    return await withRetry(() => insertLogRow(row));
  } catch (e) {
    writePendingLogs([...readPendingLogs(), row]);
    console.warn('practice_log insert failed; parked for retry', e);
    if (!warnedPendingThisLoad && typeof window !== 'undefined') {
      warnedPendingThisLoad = true;
      window.alert(
        "Couldn't reach the server, so this session is saved on this device. " +
          'It will sync automatically the next time the app connects.',
      );
    }
    return -1;
  }
}

// Total number of practice-log entries for the signed-in user. Mirrors the
// native sibling — used by the library to gate the Serial Practice button.
// `head: true` + `count: 'exact'` returns ONLY the count, no row payload.
// RLS already scopes practice_log to the signed-in user.
export async function countPracticeLogEntries(): Promise<number> {
  // The library calls this on every visit — a natural moment to sync any
  // sessions parked while offline.
  flushPendingPracticeLogs().catch(() => {});
  const { count, error } = await supabase
    .from('practice_log')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function getPracticeLogForPassage(
  piece_id: string,
): Promise<PracticeLogEntry[]> {
  // PostgREST cannot infer the practice_log → exercises FK in this Supabase
  // project, so embedded `exercises(name)` joins 400. Fetch the two tables
  // separately and join in JS.
  const [logsRes, exercisesRes] = await Promise.all([
    supabase
      .from('practice_log')
      .select('id, piece_id, strategy, practiced_at, data_json, exercise_id')
      .eq('piece_id', piece_id)
      .order('practiced_at', { ascending: false }),
    supabase.from('exercises').select('id, name').eq('piece_id', piece_id),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (exercisesRes.error) throw exercisesRes.error;

  const exerciseNames = new Map<string, string>();
  for (const e of (exercisesRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    if (e.name) exerciseNames.set(e.id, e.name);
  }

  return ((logsRes.data ?? []) as unknown as Array<{
    id: number;
    piece_id: string;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
  }>).map((r) => ({
    id: r.id,
    piece_id: r.piece_id,
    strategy: r.strategy,
    practiced_at: r.practiced_at,
    data_json: r.data_json,
    exercise_id: r.exercise_id,
    exercise_name: r.exercise_id ? exerciseNames.get(r.exercise_id) ?? null : null,
  }));
}

type PieceWithDoc = {
  id: string;
  title: string;
  folder_id: string | null;
  document_id: string | null;
  regions_json: string | null;
  deleted_at: number | null;
};

type DocLite = {
  id: string;
  title: string;
  sections_json: string | null;
  folder_id: string | null;
  deleted_at: number | null;
};

function resolveSection(
  piece: PieceWithDoc,
  documents: Map<string, DocLite>,
): { document_title: string | null; section_name: string | null } {
  if (!piece.document_id) return { document_title: null, section_name: null };
  const doc = documents.get(piece.document_id);
  if (!doc) return { document_title: null, section_name: null };
  const regions = parseRegions(piece.regions_json);
  const first = regions[0];
  const sections = parseSections(doc.sections_json);
  const section = first ? sectionForPosition(sections, first.page, first.y) : null;
  return { document_title: doc.title, section_name: section?.name ?? null };
}

export async function getPracticeLogForLibrary(): Promise<LibraryPracticeLogEntry[]> {
  // PostgREST cannot infer FKs between practice_log/pieces/exercises/folders in
  // this project's schema cache, so embedded joins (e.g. `pieces!inner(...)`) 400.
  // Fetch each table separately and join in JS.
  const [logsRes, piecesRes, exercisesRes, foldersRes, documentsRes] = await Promise.all([
    supabase
      .from('practice_log')
      .select('id, piece_id, document_id, strategy, practiced_at, data_json, exercise_id')
      .order('practiced_at', { ascending: false }),
    // Include deleted rows here: the practice log is meant to preserve work done
    // on passages/documents even after they've been deleted from the library.
    // We resolve their titles for the log and tag the entry as deleted.
    supabase
      .from('pieces')
      .select('id, title, folder_id, document_id, regions_json, deleted_at'),
    supabase.from('exercises').select('id, name'),
    supabase.from('folders').select('id, name'),
    supabase.from('documents').select('id, title, sections_json, folder_id, deleted_at'),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (piecesRes.error) throw piecesRes.error;
  if (exercisesRes.error) throw exercisesRes.error;
  if (foldersRes.error) throw foldersRes.error;
  if (documentsRes.error) throw documentsRes.error;

  const pieceById = new Map<string, PieceWithDoc>();
  for (const p of (piecesRes.data ?? []) as PieceWithDoc[]) {
    pieceById.set(p.id, p);
  }
  const exerciseNames = new Map<string, string>();
  for (const e of (exercisesRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    if (e.name) exerciseNames.set(e.id, e.name);
  }
  const folderNames = new Map<string, string>();
  for (const f of (foldersRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    if (f.name) folderNames.set(f.id, f.name);
  }
  const documents = new Map<string, DocLite>();
  for (const d of (documentsRes.data ?? []) as DocLite[]) {
    documents.set(d.id, d);
  }

  return ((logsRes.data ?? []) as unknown as Array<{
    id: number;
    piece_id: string | null;
    document_id: string | null;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
  }>)
    .map((r): LibraryPracticeLogEntry | null => {
      const base = {
        id: r.id,
        strategy: r.strategy,
        practiced_at: r.practiced_at,
        data_json: r.data_json,
        exercise_id: r.exercise_id,
        exercise_name: r.exercise_id
          ? exerciseNames.get(r.exercise_id) ?? null
          : null,
      };
      if (r.piece_id) {
        const piece = pieceById.get(r.piece_id);
        if (!piece) return null;
        const { document_title, section_name } = resolveSection(piece, documents);
        return {
          ...base,
          piece_id: r.piece_id,
          piece_title: piece.title,
          document_id: piece.document_id,
          document_title,
          section_name,
          folder_id: piece.folder_id,
          folder_name: piece.folder_id
            ? folderNames.get(piece.folder_id) ?? null
            : null,
          is_deleted: piece.deleted_at != null,
        };
      }
      // A document-level entry (a recording made on the PDF viewer): file it
      // under the document's title, in the document's folder.
      if (r.document_id) {
        const doc = documents.get(r.document_id);
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
            ? folderNames.get(doc.folder_id) ?? null
            : null,
          is_deleted: doc.deleted_at != null,
        };
      }
      return null;
    })
    .filter((r): r is LibraryPracticeLogEntry => r !== null);
}

export async function updatePracticeLogMoodNote(
  id: number,
  patch: { mood: string | null; note: string | null; remindNext?: boolean },
): Promise<void> {
  const { data: row, error: selErr } = await supabase
    .from('practice_log')
    .select('data_json')
    .eq('id', id)
    .maybeSingle();
  if (selErr) throw selErr;
  if (!row) return;

  let data: Record<string, unknown> = {};
  if (row.data_json) {
    try {
      const parsed = JSON.parse(row.data_json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      // Corrupt JSON — start fresh; other keys are unrecoverable anyway.
    }
  }
  if (patch.mood === null) delete data.mood;
  else data.mood = patch.mood;
  if (patch.note === null) delete data.note;
  else data.note = patch.note;
  if (patch.remindNext !== undefined) {
    if (patch.remindNext) data.remindNext = true;
    else delete data.remindNext;
  }
  const nextJson = Object.keys(data).length > 0 ? JSON.stringify(data) : null;

  const { error } = await supabase
    .from('practice_log')
    .update({ data_json: nextJson })
    .eq('id', id);
  if (error) throw error;
}

// A flagged practice-log note that should appear on the passage screen until
// the user dismisses it.
export type PassageReminder = {
  id: number;
  strategy: string;
  note: string;
  practiced_at: number;
  exercise_name: string | null;
};

export async function listPassageReminders(
  piece_id: string,
): Promise<PassageReminder[]> {
  const { data, error } = await supabase
    .from('practice_log')
    .select('id, strategy, practiced_at, data_json, exercise_id')
    .eq('piece_id', piece_id)
    .order('practiced_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: number;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
  }>;

  const reminders: PassageReminder[] = [];
  const exerciseIds = new Set<string>();
  for (const r of rows) {
    if (!r.data_json) continue;
    try {
      const d = JSON.parse(r.data_json);
      if (d?.remindNext !== true) continue;
      const note = typeof d?.note === 'string' ? d.note.trim() : '';
      if (note.length === 0) continue;
      reminders.push({
        id: r.id,
        strategy: r.strategy,
        note,
        practiced_at: r.practiced_at,
        exercise_name: null,
      });
      if (r.exercise_id) exerciseIds.add(r.exercise_id);
    } catch {
      // skip corrupt rows
    }
  }

  if (exerciseIds.size > 0) {
    const { data: exs } = await supabase
      .from('exercises')
      .select('id, name')
      .in('id', Array.from(exerciseIds));
    const nameById = new Map<string, string>();
    for (const e of (exs ?? []) as Array<{ id: string; name: string | null }>) {
      if (e.name) nameById.set(e.id, e.name);
    }
    for (const r of reminders) {
      // Re-attach exercise name from the source row.
      const src = rows.find((x) => x.id === r.id);
      if (src?.exercise_id) r.exercise_name = nameById.get(src.exercise_id) ?? null;
    }
  }

  return reminders;
}

export async function clearReminder(id: number): Promise<void> {
  const { data: row, error: selErr } = await supabase
    .from('practice_log')
    .select('data_json')
    .eq('id', id)
    .maybeSingle();
  if (selErr) throw selErr;
  if (!row || !row.data_json) return;
  try {
    const parsed = JSON.parse(row.data_json);
    if (parsed && typeof parsed === 'object') {
      delete (parsed as Record<string, unknown>).remindNext;
      const nextJson =
        Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : null;
      const { error } = await supabase
        .from('practice_log')
        .update({ data_json: nextJson })
        .eq('id', id);
      if (error) throw error;
    }
  } catch {
    // skip corrupt rows
  }
}

export async function deletePracticeLog(id: number): Promise<void> {
  const { error } = await supabase.from('practice_log').delete().eq('id', id);
  if (error) throw error;
}

// ── History trimming ────────────────────────────────────────────────────────
// "Keep my log from becoming a never-ending scroll." Entries strictly older
// than the cutoff are permanently deleted. RLS scopes everything to the
// signed-in user.

export async function countPracticeLogOlderThan(cutoffMs: number): Promise<number> {
  const { count, error } = await supabase
    .from('practice_log')
    .select('id', { count: 'exact', head: true })
    .lt('practiced_at', cutoffMs);
  if (error) throw error;
  return count ?? 0;
}

export async function deletePracticeLogOlderThan(cutoffMs: number): Promise<number> {
  // Recording entries own audio files in Storage. Delete those files first,
  // or trimming history strands megabytes of orphaned audio — the same leak
  // the 2026-06 storage purge cleaned up. The file path is recovered from
  // the public URL ( .../recordings/<userId>/<recordingId>.<ext> ).
  const { data: recRows, error: recErr } = await supabase
    .from('practice_log')
    .select('id, data_json')
    .eq('strategy', 'recording')
    .lt('practiced_at', cutoffMs);
  if (recErr) throw recErr;
  const paths: string[] = [];
  for (const r of (recRows ?? []) as Array<{ data_json: string | null }>) {
    if (!r.data_json) continue;
    try {
      const d = JSON.parse(r.data_json) as { recording_uri?: string };
      const m = d.recording_uri?.match(/\/recordings\/(.+)$/);
      if (m) paths.push(decodeURIComponent(m[1]));
    } catch {
      // corrupt row — its DB entry still gets deleted below
    }
  }
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from('recordings').remove(paths);
    // Storage failure shouldn't block the trim — orphans are recoverable by
    // a later purge; half-deleted history is more confusing.
    if (rmErr) console.warn('recording cleanup during trim failed', rmErr);
  }

  const { data: deleted, error } = await supabase
    .from('practice_log')
    .delete()
    .lt('practiced_at', cutoffMs)
    .select('id');
  if (error) throw error;
  return (deleted ?? []).length;
}

export async function getPracticeLogForDocument(
  document_id: string,
): Promise<PracticeLogWithTitle[]> {
  // Same join-in-JS pattern as the folder/library variants.
  const [piecesRes, logsRes, exercisesRes, documentsRes] = await Promise.all([
    supabase
      .from('pieces')
      .select('id, title, folder_id, document_id, regions_json')
      .eq('document_id', document_id)
      .is('deleted_at', null),
    supabase
      .from('practice_log')
      .select('id, piece_id, document_id, strategy, practiced_at, data_json, exercise_id')
      .order('practiced_at', { ascending: false }),
    supabase.from('exercises').select('id, name'),
    supabase.from('documents').select('id, title, sections_json, folder_id').eq('id', document_id),
  ]);
  if (piecesRes.error) throw piecesRes.error;
  if (logsRes.error) throw logsRes.error;
  if (exercisesRes.error) throw exercisesRes.error;
  if (documentsRes.error) throw documentsRes.error;

  const pieceById = new Map<string, PieceWithDoc>();
  for (const p of (piecesRes.data ?? []) as PieceWithDoc[]) {
    pieceById.set(p.id, p);
  }
  const exerciseNames = new Map<string, string>();
  for (const e of (exercisesRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    if (e.name) exerciseNames.set(e.id, e.name);
  }
  const documents = new Map<string, DocLite>();
  for (const d of (documentsRes.data ?? []) as DocLite[]) {
    documents.set(d.id, d);
  }

  return ((logsRes.data ?? []) as unknown as Array<{
    id: number;
    piece_id: string | null;
    document_id: string | null;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
  }>)
    .map((r): PracticeLogWithTitle | null => {
      const base = {
        id: r.id,
        strategy: r.strategy,
        practiced_at: r.practiced_at,
        data_json: r.data_json,
        exercise_id: r.exercise_id,
        exercise_name: r.exercise_id
          ? exerciseNames.get(r.exercise_id) ?? null
          : null,
      };
      if (r.piece_id) {
        const piece = pieceById.get(r.piece_id);
        if (!piece) return null;
        const { document_title, section_name } = resolveSection(piece, documents);
        return {
          ...base,
          piece_id: r.piece_id,
          piece_title: piece.title,
          document_id: piece.document_id,
          document_title,
          section_name,
        };
      }
      // A document-level entry (a recording made on the PDF viewer). The
      // documents map holds only this document, so a no-piece row matches
      // here only when it belongs to this document.
      if (r.document_id) {
        const doc = documents.get(r.document_id);
        if (!doc) return null;
        return {
          ...base,
          piece_id: r.document_id,
          piece_title: doc.title,
          document_id: null,
          document_title: null,
          section_name: null,
        };
      }
      return null;
    })
    .filter((r): r is PracticeLogWithTitle => r !== null);
}

export async function getPracticeLogForFolder(
  folder_id: string | null,
): Promise<PracticeLogWithTitle[]> {
  // Load ALL pieces (not pre-filtered by folder). A passage marked inside a
  // document carries its folder membership on the DOCUMENT, not on the piece
  // row (the piece's own folder_id is null), so we resolve each piece's
  // *effective* folder below and filter in JS. Pre-filtering on p.folder_id
  // dropped every document-child passage's history from the folder log.
  const piecesQuery = supabase
    .from('pieces')
    .select('id, title, folder_id, document_id, regions_json')
    .is('deleted_at', null);

  const [piecesRes, logsRes, exercisesRes, documentsRes] = await Promise.all([
    piecesQuery,
    supabase
      .from('practice_log')
      .select('id, piece_id, document_id, strategy, practiced_at, data_json, exercise_id')
      .order('practiced_at', { ascending: false }),
    supabase.from('exercises').select('id, name'),
    supabase.from('documents').select('id, title, sections_json, folder_id').is('deleted_at', null),
  ]);
  if (piecesRes.error) throw piecesRes.error;
  if (logsRes.error) throw logsRes.error;
  if (exercisesRes.error) throw exercisesRes.error;
  if (documentsRes.error) throw documentsRes.error;

  const pieceById = new Map<string, PieceWithDoc>();
  for (const p of (piecesRes.data ?? []) as PieceWithDoc[]) {
    pieceById.set(p.id, p);
  }
  const exerciseNames = new Map<string, string>();
  for (const e of (exercisesRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    if (e.name) exerciseNames.set(e.id, e.name);
  }
  const documents = new Map<string, DocLite>();
  for (const d of (documentsRes.data ?? []) as DocLite[]) {
    documents.set(d.id, d);
  }

  return ((logsRes.data ?? []) as unknown as Array<{
    id: number;
    piece_id: string | null;
    document_id: string | null;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
  }>)
    .map((r): PracticeLogWithTitle | null => {
      const base = {
        id: r.id,
        strategy: r.strategy,
        practiced_at: r.practiced_at,
        data_json: r.data_json,
        exercise_id: r.exercise_id,
        exercise_name: r.exercise_id
          ? exerciseNames.get(r.exercise_id) ?? null
          : null,
      };
      if (r.piece_id) {
        const piece = pieceById.get(r.piece_id);
        if (!piece) return null;
        // Keep only pieces that live in this folder. A document-child passage's
        // membership is its parent document's folder (its own folder_id is
        // null); a standalone passage's is its own folder_id.
        const effectiveFolder = piece.document_id
          ? documents.get(piece.document_id)?.folder_id ?? null
          : piece.folder_id;
        if (effectiveFolder !== folder_id) return null;
        const { document_title, section_name } = resolveSection(piece, documents);
        return {
          ...base,
          piece_id: r.piece_id,
          piece_title: piece.title,
          document_id: piece.document_id,
          document_title,
          section_name,
        };
      }
      // A document-level entry (a recording made on the PDF viewer): keep it
      // only when its document lives in this folder.
      if (r.document_id) {
        const doc = documents.get(r.document_id);
        if (!doc || doc.folder_id !== folder_id) return null;
        return {
          ...base,
          piece_id: r.document_id,
          piece_title: doc.title,
          document_id: null,
          document_title: null,
          section_name: null,
        };
      }
      return null;
    })
    .filter((r): r is PracticeLogWithTitle => r !== null);
}
