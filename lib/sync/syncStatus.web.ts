// Web sibling — web IS the cloud copy, so there is no engine and no status.
// Shared screens gate their sync UI on Platform.OS !== 'web'; these stubs
// only exist so the import resolves in the web bundle.
export type SyncStatus = {
  state: 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out' | 'waiting-server';
  lastSyncAt: number | null;
  pendingCount: number;
  lastError: string | null;
  stuck: { label: string; reason: string }[];
};

export async function getSyncStatus(): Promise<SyncStatus> {
  return { state: 'idle', lastSyncAt: null, pendingCount: 0, lastError: null, stuck: [] };
}

export async function syncNow(): Promise<void> {}

export async function fullResync(): Promise<void> {}
