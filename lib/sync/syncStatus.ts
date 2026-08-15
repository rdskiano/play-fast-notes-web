// Platform-resolved facade so SHARED screens (Account) can show sync state
// without pulling expo-sqlite into the web bundle. Native = the real engine.
export { getSyncStatus, syncNow } from './engine';
export type { SyncStatus } from './engine';
