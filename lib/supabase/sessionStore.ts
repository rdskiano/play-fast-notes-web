// Filesystem-backed key/value store for the Supabase auth session on native.
// The web client uses localStorage; native has no persistent store wired up,
// and we deliberately avoid adding AsyncStorage / SecureStore — that would
// force a native rebuild. The session is small JSON; one file per key under
// the app's sandboxed document directory is enough.

import { Directory, File, Paths } from 'expo-file-system';

const dir = new Directory(Paths.document, 'supabase-auth');

function fileFor(key: string): File {
  return new File(dir, `${encodeURIComponent(key)}.txt`);
}

export const fileSessionStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      const f = fileFor(key);
      return f.exists ? await f.text() : null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (!dir.exists) dir.create({ intermediates: true });
      const f = fileFor(key);
      if (f.exists) f.delete();
      f.create();
      f.write(value);
    } catch {
      // A failed write just means the user re-signs-in on next launch.
    }
  },
  removeItem(key: string): void {
    try {
      const f = fileFor(key);
      if (f.exists) f.delete();
    } catch {
      // Nothing to clean up.
    }
  },
};
