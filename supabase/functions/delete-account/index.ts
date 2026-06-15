// delete-account — permanently deletes the calling user's account.
//
// Apple App Store guideline 5.1.1(v) requires that any app offering account
// creation also lets the user delete the account itself (not just its data)
// from inside the app. That deletion needs the service-role key, which must
// never ship in the client — hence this function.
//
// Flow:
//   1. Verify the caller's JWT and derive their userId from it. We NEVER trust
//      a userId from the request body — a user can only ever delete themselves.
//   2. Service-role client removes their files from the storage buckets
//      (storage objects are not covered by the auth.users FK cascade).
//   3. Service-role admin call deletes the auth.users row. Every user-scoped
//      table FKs to auth.users(id) ON DELETE CASCADE, so all rows go with it.
//
// POST, no body. Auth via the Bearer token that supabase.functions.invoke
// attaches automatically.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const BUCKETS = ["pieces", "recordings"];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "access-control-allow-methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return jsonError(405, "method not allowed");
  }

  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth) return jsonError(401, "missing authorization header");
    const token = auth.replace(/^Bearer\s+/i, "").trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Who is calling? Derive the user from the verified token — never the body.
    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userError } = await asUser.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonError(401, "unauthenticated", { detail: userError?.message });
    }
    const userId = userData.user.id;

    // Service-role client for the privileged deletes.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Remove the user's storage objects (recursively under <userId>/...).
    //    Tables cascade from the auth.users delete below; storage does not.
    for (const bucket of BUCKETS) {
      try {
        await removeUserFolder(admin, bucket, userId);
      } catch (e) {
        // Don't abort the account deletion over a storage hiccup — log and
        // continue. Orphaned files are recoverable; a half-deleted account
        // that still has a login is the App Store rejection we're avoiding.
        console.warn(`[delete-account] ${bucket} cleanup failed:`, e);
      }
    }

    // 2. Delete the auth user. ON DELETE CASCADE clears every user-scoped row.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      return jsonError(500, "could not delete account", { detail: delErr.message });
    }

    return jsonOk({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return jsonError(500, message, { stack });
  }
});

// Recursively list and remove everything under <userId>/ in a bucket. The
// Storage API lists one folder level at a time, so we walk subfolders too
// (e.g. recordings live at <userId>/<file>, document pages at
// <userId>/documents/<docId>/<file>).
async function removeUserFolder(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<void> {
  const { data: entries, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
  });
  if (error) throw error;
  if (!entries || entries.length === 0) return;

  const files: string[] = [];
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    // A null `id` means it's a folder placeholder, not a file — recurse into it.
    if (entry.id === null) {
      await removeUserFolder(admin, bucket, path);
    } else {
      files.push(path);
    }
  }
  if (files.length > 0) {
    const { error: rmErr } = await admin.storage.from(bucket).remove(files);
    if (rmErr) throw rmErr;
  }
}

function jsonOk(payload: object): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json", ...CORS },
  });
}

function jsonError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
