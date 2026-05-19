import { getDb } from '../client';
import { parseSections, sectionForPosition } from './documents';
import { parseRegions } from './passages';

export type PracticeLogEntry = {
  id: number;
  piece_id: string;
  strategy: string;
  practiced_at: number;
  data_json: string | null;
  exercise_id: string | null;
  exercise_name: string | null;
};

type PieceDocFields = {
  document_id: string | null;
  regions_json: string | null;
  document_title: string | null;
  document_sections_json: string | null;
};

export async function logPractice(
  piece_id: string,
  strategy: string,
  data?: Record<string, unknown>,
  exercise_id?: string | null,
): Promise<number> {
  const db = getDb();
  const result = await db.runAsync(
    'INSERT INTO practice_log (piece_id, strategy, practiced_at, data_json, exercise_id) VALUES (?, ?, ?, ?, ?);',
    piece_id,
    strategy,
    Date.now(),
    data ? JSON.stringify(data) : null,
    exercise_id ?? null,
  );
  return result.lastInsertRowId;
}

export async function getPracticeLogForPassage(
  piece_id: string,
): Promise<PracticeLogEntry[]> {
  const db = getDb();
  return db.getAllAsync<PracticeLogEntry>(
    `SELECT pl.id, pl.piece_id, pl.strategy, pl.practiced_at, pl.data_json,
            pl.exercise_id, e.name AS exercise_name
     FROM practice_log pl
     LEFT JOIN exercises e ON e.id = pl.exercise_id
     WHERE pl.piece_id = ?
     ORDER BY pl.practiced_at DESC;`,
    piece_id,
  );
}

export type PracticeLogWithTitle = PracticeLogEntry & {
  piece_title: string;
  document_id: string | null;
  document_title: string | null;
  section_name: string | null;
};

export type LibraryPracticeLogEntry = PracticeLogWithTitle & {
  folder_id: string | null;
  folder_name: string | null;
};

function resolveSectionName(piece: PieceDocFields): string | null {
  if (!piece.document_id || !piece.document_sections_json) return null;
  const regions = parseRegions(piece.regions_json);
  const first = regions[0];
  if (!first) return null;
  const sections = parseSections(piece.document_sections_json);
  return sectionForPosition(sections, first.page, first.y)?.name ?? null;
}

export async function getPracticeLogForLibrary(): Promise<LibraryPracticeLogEntry[]> {
  const db = getDb();
  type Row = {
    id: number;
    piece_id: string;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
    exercise_name: string | null;
    piece_title: string;
    folder_id: string | null;
    folder_name: string | null;
    document_id: string | null;
    regions_json: string | null;
    document_title: string | null;
    document_sections_json: string | null;
  };
  const rows = await db.getAllAsync<Row>(
    `SELECT pl.id, pl.piece_id, pl.strategy, pl.practiced_at, pl.data_json,
            pl.exercise_id, e.name AS exercise_name,
            p.title AS piece_title,
            p.folder_id AS folder_id,
            f.name AS folder_name,
            p.document_id AS document_id,
            p.regions_json AS regions_json,
            d.title AS document_title,
            d.sections_json AS document_sections_json
     FROM practice_log pl
     JOIN pieces p ON pl.piece_id = p.id
     LEFT JOIN exercises e ON e.id = pl.exercise_id
     LEFT JOIN folders f ON f.id = p.folder_id
     LEFT JOIN documents d ON d.id = p.document_id
     WHERE p.deleted_at IS NULL
     ORDER BY pl.practiced_at DESC;`,
  );
  return rows.map((r) => ({
    id: r.id,
    piece_id: r.piece_id,
    strategy: r.strategy,
    practiced_at: r.practiced_at,
    data_json: r.data_json,
    exercise_id: r.exercise_id,
    exercise_name: r.exercise_name,
    piece_title: r.piece_title,
    folder_id: r.folder_id,
    folder_name: r.folder_name,
    document_id: r.document_id,
    document_title: r.document_title,
    section_name: resolveSectionName(r),
  }));
}

export async function updatePracticeLogMoodNote(
  id: number,
  patch: { mood: string | null; note: string | null; remindNext?: boolean },
): Promise<void> {
  const db = getDb();
  const row = await db.getFirstAsync<{ data_json: string | null }>(
    'SELECT data_json FROM practice_log WHERE id = ?;',
    id,
  );
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
  await db.runAsync(
    'UPDATE practice_log SET data_json = ? WHERE id = ?;',
    nextJson,
    id,
  );
}

// A flagged practice-log note that should appear on the passage screen
// until the user dismisses it.
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
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: number;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
  }>(
    `SELECT id, strategy, practiced_at, data_json, exercise_id
     FROM practice_log
     WHERE piece_id = ?
     ORDER BY practiced_at DESC
     LIMIT 40;`,
    piece_id,
  );

  const reminders: PassageReminder[] = [];
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
    } catch {
      // skip corrupt rows
    }
  }

  // Attach exercise names where we have them.
  const ids = Array.from(
    new Set(
      rows
        .filter((r) => reminders.some((rem) => rem.id === r.id) && r.exercise_id)
        .map((r) => r.exercise_id as string),
    ),
  );
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(', ');
    const exs = await db.getAllAsync<{ id: string; name: string | null }>(
      `SELECT id, name FROM exercises WHERE id IN (${placeholders});`,
      ...ids,
    );
    const nameById = new Map<string, string>();
    for (const e of exs) {
      if (e.name) nameById.set(e.id, e.name);
    }
    for (const r of reminders) {
      const src = rows.find((x) => x.id === r.id);
      if (src?.exercise_id) r.exercise_name = nameById.get(src.exercise_id) ?? null;
    }
  }

  return reminders;
}

export async function clearReminder(id: number): Promise<void> {
  const db = getDb();
  const row = await db.getFirstAsync<{ data_json: string | null }>(
    'SELECT data_json FROM practice_log WHERE id = ?;',
    id,
  );
  if (!row || !row.data_json) return;
  try {
    const parsed = JSON.parse(row.data_json);
    if (parsed && typeof parsed === 'object') {
      delete (parsed as Record<string, unknown>).remindNext;
      const nextJson =
        Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : null;
      await db.runAsync(
        'UPDATE practice_log SET data_json = ? WHERE id = ?;',
        nextJson,
        id,
      );
    }
  } catch {
    // skip corrupt rows
  }
}

export async function deletePracticeLog(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM practice_log WHERE id = ?;', id);
}

export async function getPracticeLogForDocument(
  document_id: string,
): Promise<PracticeLogWithTitle[]> {
  const db = getDb();
  type Row = {
    id: number;
    piece_id: string;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
    exercise_name: string | null;
    piece_title: string;
    document_id: string | null;
    regions_json: string | null;
    document_title: string | null;
    document_sections_json: string | null;
  };
  const rows = await db.getAllAsync<Row>(
    `SELECT pl.id, pl.piece_id, pl.strategy, pl.practiced_at, pl.data_json,
            pl.exercise_id, e.name AS exercise_name,
            p.title AS piece_title,
            p.document_id AS document_id,
            p.regions_json AS regions_json,
            d.title AS document_title,
            d.sections_json AS document_sections_json
     FROM practice_log pl
     JOIN pieces p ON pl.piece_id = p.id
     LEFT JOIN exercises e ON e.id = pl.exercise_id
     LEFT JOIN documents d ON d.id = p.document_id
     WHERE p.document_id = ? AND p.deleted_at IS NULL
     ORDER BY pl.practiced_at DESC;`,
    document_id,
  );
  return rows.map((r) => ({
    id: r.id,
    piece_id: r.piece_id,
    strategy: r.strategy,
    practiced_at: r.practiced_at,
    data_json: r.data_json,
    exercise_id: r.exercise_id,
    exercise_name: r.exercise_name,
    piece_title: r.piece_title,
    document_id: r.document_id,
    document_title: r.document_title,
    section_name: resolveSectionName(r),
  }));
}

export async function getPracticeLogForFolder(
  folder_id: string | null,
): Promise<PracticeLogWithTitle[]> {
  const db = getDb();
  const where =
    folder_id === null
      ? 'p.folder_id IS NULL'
      : 'p.folder_id = ?';
  const params = folder_id === null ? [] : [folder_id];
  type Row = {
    id: number;
    piece_id: string;
    strategy: string;
    practiced_at: number;
    data_json: string | null;
    exercise_id: string | null;
    exercise_name: string | null;
    piece_title: string;
    document_id: string | null;
    regions_json: string | null;
    document_title: string | null;
    document_sections_json: string | null;
  };
  const rows = await db.getAllAsync<Row>(
    `SELECT pl.id, pl.piece_id, pl.strategy, pl.practiced_at, pl.data_json,
            pl.exercise_id, e.name AS exercise_name,
            p.title AS piece_title,
            p.document_id AS document_id,
            p.regions_json AS regions_json,
            d.title AS document_title,
            d.sections_json AS document_sections_json
     FROM practice_log pl
     JOIN pieces p ON pl.piece_id = p.id
     LEFT JOIN exercises e ON e.id = pl.exercise_id
     LEFT JOIN documents d ON d.id = p.document_id
     WHERE ${where} AND p.deleted_at IS NULL
     ORDER BY pl.practiced_at DESC;`,
    ...params,
  );
  return rows.map((r) => ({
    id: r.id,
    piece_id: r.piece_id,
    strategy: r.strategy,
    practiced_at: r.practiced_at,
    data_json: r.data_json,
    exercise_id: r.exercise_id,
    exercise_name: r.exercise_name,
    piece_title: r.piece_title,
    document_id: r.document_id,
    document_title: r.document_title,
    section_name: resolveSectionName(r),
  }));
}
