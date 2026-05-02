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

export type PracticeLogWithTitle = PracticeLogEntry & { piece_title: string };

export type LibraryPracticeLogEntry = PracticeLogWithTitle & {
  folder_id: string | null;
  folder_name: string | null;
};

export async function logPractice(
  piece_id: string,
  strategy: string,
  data?: Record<string, unknown>,
  exercise_id?: string | null,
): Promise<number> {
  const row = {
    piece_id,
    strategy,
    practiced_at: Date.now(),
    data_json: data ? JSON.stringify(data) : null,
    exercise_id: exercise_id ?? null,
  };
  const { data: inserted, error } = await supabase
    .from('practice_log')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return (inserted as { id: number }).id;
}

export async function getPracticeLogForPiece(
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

export async function getPracticeLogForLibrary(): Promise<LibraryPracticeLogEntry[]> {
  // PostgREST cannot infer FKs between practice_log/pieces/exercises/folders in
  // this project's schema cache, so embedded joins (e.g. `pieces!inner(...)`) 400.
  // Fetch each table separately and join in JS.
  const [logsRes, piecesRes, exercisesRes, foldersRes] = await Promise.all([
    supabase
      .from('practice_log')
      .select('id, piece_id, strategy, practiced_at, data_json, exercise_id')
      .order('practiced_at', { ascending: false }),
    supabase
      .from('pieces')
      .select('id, title, folder_id, deleted_at')
      .is('deleted_at', null),
    supabase.from('exercises').select('id, name'),
    supabase.from('folders').select('id, name').is('deleted_at', null),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (piecesRes.error) throw piecesRes.error;
  if (exercisesRes.error) throw exercisesRes.error;
  if (foldersRes.error) throw foldersRes.error;

  const pieceById = new Map<
    string,
    { title: string; folder_id: string | null }
  >();
  for (const p of (piecesRes.data ?? []) as Array<{
    id: string;
    title: string;
    folder_id: string | null;
  }>) {
    pieceById.set(p.id, { title: p.title, folder_id: p.folder_id });
  }
  const exerciseNames = new Map<string, string>();
  for (const e of (exercisesRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    if (e.name) exerciseNames.set(e.id, e.name);
  }
  const folderNames = new Map<string, string>();
  for (const f of (foldersRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    if (f.name) folderNames.set(f.id, f.name);
  }

  return ((logsRes.data ?? []) as unknown as Array<{
    id: number;
    piece_id: string;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
  }>)
    .map((r) => {
      const piece = pieceById.get(r.piece_id);
      if (!piece) return null;
      return {
        id: r.id,
        piece_id: r.piece_id,
        strategy: r.strategy,
        practiced_at: r.practiced_at,
        data_json: r.data_json,
        exercise_id: r.exercise_id,
        exercise_name: r.exercise_id ? exerciseNames.get(r.exercise_id) ?? null : null,
        piece_title: piece.title,
        folder_id: piece.folder_id,
        folder_name: piece.folder_id ? folderNames.get(piece.folder_id) ?? null : null,
      };
    })
    .filter((r): r is LibraryPracticeLogEntry => r !== null);
}

export async function updatePracticeLogMoodNote(
  id: number,
  patch: { mood: string | null; note: string | null },
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
  const nextJson = Object.keys(data).length > 0 ? JSON.stringify(data) : null;

  const { error } = await supabase
    .from('practice_log')
    .update({ data_json: nextJson })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePracticeLog(id: number): Promise<void> {
  const { error } = await supabase.from('practice_log').delete().eq('id', id);
  if (error) throw error;
}

export async function getPracticeLogForFolder(
  folder_id: string | null,
): Promise<PracticeLogWithTitle[]> {
  let query = supabase
    .from('practice_log')
    .select(
      `id, piece_id, strategy, practiced_at, data_json, exercise_id,
       exercises(name),
       pieces!inner(title, folder_id, deleted_at)`,
    )
    .order('practiced_at', { ascending: false });

  // Filter on the joined pieces.folder_id
  query =
    folder_id === null
      ? query.is('pieces.folder_id', null)
      : query.eq('pieces.folder_id', folder_id);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    id: number;
    piece_id: string;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
    exercises: { name: string | null } | null;
    pieces: { title: string; folder_id: string | null; deleted_at: number | null };
  }>)
    .filter((r) => r.pieces.deleted_at === null)
    .map((r) => ({
      id: r.id,
      piece_id: r.piece_id,
      strategy: r.strategy,
      practiced_at: r.practiced_at,
      data_json: r.data_json,
      exercise_id: r.exercise_id,
      exercise_name: r.exercises?.name ?? null,
      piece_title: r.pieces.title,
    }));
}
