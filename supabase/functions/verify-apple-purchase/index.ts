// verify-apple-purchase — the iOS twin of stripe-webhook. The app sends the
// StoreKit 2 signed transaction (a JWS: header.payload.signature, signed by
// Apple) after a purchase or restore; this function proves it really came
// from Apple, really is our product, then records the one-time unlock into
// the subscriptions table exactly the way a paid Stripe checkout does.
//
// Why verify here and not trust the client: the subscriptions table is
// service-role-only by design (RLS allows SELECT only), and an unlock that a
// jailbroken device could grant itself is not an unlock at all.
//
// Verification is done locally against Apple's certificate chain — no Apple
// server call, no App Store Connect API key:
//   1. The JWS header carries the signing chain (x5c: leaf, intermediate,
//      root). The root must be byte-identical to the pinned Apple Root CA G3
//      certificate embedded below (downloaded from apple.com/certificateauthority).
//   2. Each link must actually sign the next (WebCrypto, via @peculiar/x509)
//      and be valid today.
//   3. The chain must carry Apple's App Store markers: OID
//      1.2.840.113635.100.6.2.1 on the intermediate (Apple intermediate CA)
//      and 1.2.840.113635.100.6.11.1 on the leaf (App Store receipt signing).
//   4. The JWS signature must check out against the leaf's public key (ES256).
//   5. The payload must be OUR bundle id + product id, a Non-Consumable, and
//      not revoked/refunded.
//
// Sandbox transactions are accepted on purpose: App Review purchases run in
// the sandbox, and TestFlight testing does too.
//
// The caller is the signed-in user (verify_jwt is on for this function); the
// unlock is written to THAT account. apple_original_transaction_id records
// which Apple purchase it was — a unique index on it stops one purchase from
// unlocking a second account (first account to claim it keeps it; a restore
// on the same account is a no-op upsert). Needs the one-time migration in
// supabase/apple-iap-setup.sql.
//
// No extra secrets required: uses the standard SUPABASE_URL / ANON_KEY /
// SERVICE_ROLE_KEY that every function gets.

import * as x509 from "npm:@peculiar/x509@1.12.3";
import { compactVerify } from "npm:jose@5.9.6";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Same lifetime sentinel as stripe-webhook / constants/billing.ts.
const LIFETIME_EXPIRY_MS = 4_102_444_800_000; // 2100-01-01 UTC

const BUNDLE_ID = "com.playfastnotes.playfastnotes";
const PRODUCT_IDS = new Set(["pfn_pro_lifetime"]);

// Apple Root CA - G3 (DER, base64). Source: https://www.apple.com/certificateauthority/
// Serial 2d:c5:fc:88:d2:c5:4b:95, valid to 2039-04-30. SHA-256 fingerprint
// 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
const APPLE_ROOT_CA_G3_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

const OID_APPLE_INTERMEDIATE = "1.2.840.113635.100.6.2.1";
const OID_APP_STORE_RECEIPT_SIGNING = "1.2.840.113635.100.6.11.1";

// Web callers would need these; native fetch ignores them. x-client-info is
// the repo's hard-won CORS lesson — supabase-js sends it on every browser call.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

type TransactionPayload = {
  bundleId?: string;
  productId?: string;
  type?: string;
  transactionId?: string;
  originalTransactionId?: string;
  appAccountToken?: string;
  environment?: string;
  revocationDate?: number;
  revocationReason?: number;
};

/** Verifies the JWS end-to-end. Returns the decoded payload, or null with a
 *  console.error breadcrumb when any link in the chain fails. */
async function verifyAppleJws(jws: string): Promise<TransactionPayload | null> {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) {
      console.error("jws: not a compact JWS");
      return null;
    }
    const headerJson = new TextDecoder().decode(
      b64ToBytes(parts[0].replace(/-/g, "+").replace(/_/g, "/")),
    );
    const header = JSON.parse(headerJson) as { alg?: string; x5c?: string[] };
    if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length !== 3) {
      console.error("jws: unexpected header shape", header.alg, header.x5c?.length);
      return null;
    }

    const [leaf, intermediate, root] = header.x5c.map(
      (b64) => new x509.X509Certificate(b64),
    );

    // 1. Pinned root: byte-identical to Apple Root CA - G3.
    const pinnedRoot = b64ToBytes(APPLE_ROOT_CA_G3_B64);
    if (!bytesEqual(new Uint8Array(root.rawData), pinnedRoot)) {
      console.error("jws: root certificate is not Apple Root CA G3");
      return null;
    }

    // 2. Chain signatures + validity window, today.
    const now = new Date();
    const interOk = await intermediate.verify({ publicKey: root, date: now });
    const leafOk = await leaf.verify({ publicKey: intermediate, date: now });
    if (!interOk || !leafOk) {
      console.error("jws: certificate chain verification failed", { interOk, leafOk });
      return null;
    }

    // 3. Apple's App Store marker OIDs.
    if (!intermediate.getExtension(OID_APPLE_INTERMEDIATE)) {
      console.error("jws: intermediate is missing the Apple CA marker OID");
      return null;
    }
    if (!leaf.getExtension(OID_APP_STORE_RECEIPT_SIGNING)) {
      console.error("jws: leaf is missing the App Store receipt-signing OID");
      return null;
    }

    // 4. The JWS signature itself, against the leaf's public key.
    const leafKey = await leaf.publicKey.export(
      { name: "ECDSA", namedCurve: "P-256" },
      ["verify"],
    );
    const { payload } = await compactVerify(jws, leafKey, {
      algorithms: ["ES256"],
    });
    return JSON.parse(new TextDecoder().decode(payload)) as TransactionPayload;
  } catch (e) {
    console.error("jws: verification threw", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, reason: "method" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return json(500, { ok: false, reason: "not configured" });
  }

  // Who is asking? verify_jwt already gated the request; resolve the user id.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await asCaller.auth.getUser();
  if (!user) return json(401, { ok: false, reason: "auth" });

  let body: { jws?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, reason: "bad body" });
  }
  const jws = typeof body.jws === "string" ? body.jws : null;
  if (!jws || jws.length > 100_000) {
    return json(400, { ok: false, reason: "bad body" });
  }

  const tx = await verifyAppleJws(jws);
  if (!tx) return json(200, { ok: false, reason: "invalid" });

  // Business checks: our app, our product, still owned.
  if (tx.bundleId !== BUNDLE_ID) {
    console.error("tx rejected: wrong bundle", tx.bundleId);
    return json(200, { ok: false, reason: "invalid" });
  }
  if (!tx.productId || !PRODUCT_IDS.has(tx.productId)) {
    console.error("tx rejected: wrong product", tx.productId);
    return json(200, { ok: false, reason: "invalid" });
  }
  if (tx.type !== "Non-Consumable") {
    console.error("tx rejected: wrong type", tx.type);
    return json(200, { ok: false, reason: "invalid" });
  }
  if (tx.revocationDate != null || tx.revocationReason != null) {
    console.error("tx rejected: revoked/refunded", tx.transactionId);
    return json(200, { ok: false, reason: "revoked" });
  }
  const appleTxId = tx.originalTransactionId ?? tx.transactionId;
  if (!appleTxId) {
    console.error("tx rejected: no transaction id");
    return json(200, { ok: false, reason: "invalid" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // One Apple purchase unlocks one account — the first to claim it.
  const { data: existing, error: lookupError } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("apple_original_transaction_id", appleTxId)
    .maybeSingle();
  if (lookupError) {
    console.error("claim lookup failed", lookupError);
    return json(500, { ok: false, reason: "internal" });
  }
  if (existing && existing.user_id !== user.id) {
    console.error("tx already claimed by another account", appleTxId);
    return json(200, { ok: false, reason: "claimed" });
  }

  const { error: upsertError } = await admin.from("subscriptions").upsert({
    user_id: user.id,
    tier: "pro",
    status: "active",
    apple_original_transaction_id: appleTxId,
    current_period_end: LIFETIME_EXPIRY_MS,
    updated_at: Date.now(),
  });
  if (upsertError) {
    console.error("subscriptions upsert failed", upsertError);
    return json(500, { ok: false, reason: "internal" });
  }

  console.log(
    `unlocked user ${user.id} via apple tx ${appleTxId} (${tx.environment ?? "?"})`,
  );
  return json(200, { ok: true });
});
