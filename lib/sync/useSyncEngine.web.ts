// Web is Supabase-native — every read/write already talks to the cloud, so
// there is no engine to run. No-op sibling keeps the shared _layout mount
// from pulling expo-sqlite into the web bundle.
export function useSyncEngine(): void {}
