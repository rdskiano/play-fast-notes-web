import { getDb } from '../client';

export type Folder = {
  id: string;
  name: string;
  parent_folder_id: string | null;
  /** Palette key (e.g. 'petrol', 'green') or null for auto color by position. */
  color: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

function newId(): string {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function insertFolder(
  name: string,
  parent_folder_id: string | null,
): Promise<Folder> {
  const db = getDb();
  const now = Date.now();
  const id = newId();
  await db.runAsync(
    `INSERT INTO folders (id, name, parent_folder_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?);`,
    id,
    name,
    parent_folder_id,
    now,
    now,
  );
  return {
    id,
    name,
    parent_folder_id,
    color: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

export async function setFolderColor(
  id: string,
  color: string | null,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE folders SET color = ?, updated_at = ? WHERE id = ?;`,
    color,
    Date.now(),
    id,
  );
}

export async function listFoldersInParent(
  parent_folder_id: string | null,
): Promise<Folder[]> {
  const db = getDb();
  if (parent_folder_id === null) {
    return db.getAllAsync<Folder>(
      `SELECT * FROM folders WHERE parent_folder_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC;`,
    );
  }
  return db.getAllAsync<Folder>(
    `SELECT * FROM folders WHERE parent_folder_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC;`,
    parent_folder_id,
  );
}

export async function updateFolderSortOrder(id: string, sortOrder: number): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE folders SET sort_order = ? WHERE id = ?;', sortOrder, id);
}

export async function getFolder(id: string): Promise<Folder | null> {
  const db = getDb();
  const row = await db.getFirstAsync<Folder>(
    `SELECT * FROM folders WHERE id = ? AND deleted_at IS NULL;`,
    id,
  );
  return row ?? null;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE folders SET name = ?, updated_at = ? WHERE id = ?;`,
    name,
    Date.now(),
    id,
  );
}

export async function moveFolder(
  id: string,
  parent_folder_id: string | null,
): Promise<void> {
  // guard against moving a folder into itself or a descendant
  if (parent_folder_id === id) return;
  if (parent_folder_id !== null) {
    // walk up to make sure we don't create a cycle
    let cursor: string | null = parent_folder_id;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === id) return; // would create cycle
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const parent = await getFolder(cursor);
      cursor = parent?.parent_folder_id ?? null;
    }
  }
  const db = getDb();
  await db.runAsync(
    `UPDATE folders SET parent_folder_id = ?, updated_at = ? WHERE id = ?;`,
    parent_folder_id,
    Date.now(),
    id,
  );
}

export async function softDeleteFolder(id: string): Promise<void> {
  const db = getDb();
  const target = await getFolder(id);
  if (!target) return;
  const newParent = target.parent_folder_id;
  const now = Date.now();
  await db.runAsync(
    `UPDATE folders SET parent_folder_id = ?, updated_at = ? WHERE parent_folder_id = ? AND deleted_at IS NULL;`,
    newParent,
    now,
    id,
  );
  await db.runAsync(
    `UPDATE pieces SET folder_id = ?, updated_at = ? WHERE folder_id = ? AND deleted_at IS NULL;`,
    newParent,
    now,
    id,
  );
  await db.runAsync(
    `UPDATE folders SET deleted_at = ?, updated_at = ? WHERE id = ?;`,
    now,
    now,
    id,
  );
}

export async function rehomeOrphans(): Promise<{ passages: number; folders: number }> {
  const db = getDb();
  const now = Date.now();
  const passageResult = await db.runAsync(
    `UPDATE pieces
       SET folder_id = NULL, updated_at = ?
     WHERE deleted_at IS NULL
       AND folder_id IS NOT NULL
       AND folder_id NOT IN (SELECT id FROM folders WHERE deleted_at IS NULL);`,
    now,
  );
  const folderResult = await db.runAsync(
    `UPDATE folders
       SET parent_folder_id = NULL, updated_at = ?
     WHERE deleted_at IS NULL
       AND parent_folder_id IS NOT NULL
       AND parent_folder_id NOT IN (SELECT id FROM folders WHERE deleted_at IS NULL);`,
    now,
  );
  return {
    passages: passageResult.changes ?? 0,
    folders: folderResult.changes ?? 0,
  };
}

export async function listAllFolders(): Promise<Folder[]> {
  const db = getDb();
  return db.getAllAsync<Folder>(
    `SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort_order ASC, name ASC;`,
  );
}

export async function getFolderPath(id: string | null): Promise<Folder[]> {
  if (id === null) return [];
  const out: Folder[] = [];
  let cursor: string | null = id;
  const visited = new Set<string>();
  while (cursor) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const f = await getFolder(cursor);
    if (!f) break;
    out.unshift(f);
    cursor = f.parent_folder_id;
  }
  return out;
}
