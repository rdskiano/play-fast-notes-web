// expiry-reminder — daily cron: emails anyone whose full Practice Pro access
// ends in ~3 days, with a BCC to Ralph (the "remind me and them" feature,
// 2026-07-04). Covers BOTH kinds of full access:
//   • dated comp rows (the free-month / six-month cohorts from 2026-06-26)
//   • 30-day new-account trials (no subscriptions row at all)
// Lifetime comps and purchased (pro) rows never match the window.
//
// Called by pg_cron (see supabase/expiry-reminder-cron.sql) once a day at
// 13:00 UTC (~9am Detroit). Window = expiry in [now+2d, now+3d), so each
// account is caught on exactly one daily run; the expiry_reminders table
// dedupes re-runs and edge overlaps. No JWT (config.toml verify_jwt=false);
// instead the caller must present the shared CRON_SECRET header.
//
// Required secrets:
//   RESEND_API_KEY   re_... from resend.com (domain playfastnotes.com verified)
//   CRON_SECRET      any long random string; must match the cron job's header
//
// Email design (Ralph-approved copy below): plain text, from
// ralph@playfastnotes.com, reply-to his real Gmail so replies land in his
// inbox like all his user mail. One template for both cohorts — the 30-day
// trial and the comped "free month" both read naturally as a free month.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const TRIAL_DAYS = 30; // keep in sync with constants/billing.ts
const DAY_MS = 24 * 60 * 60 * 1000;
const FROM = "Ralph at Play Fast Notes <ralph@playfastnotes.com>";
const REPLY_TO = "rdskiano@gmail.com";
const BCC = "rdskiano@gmail.com";

function plain(status: number, body: string): Response {
  return new Response(body, { status });
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "America/Detroit",
  });
}

function emailText(dateLabel: string): { subject: string; text: string } {
  return {
    subject: `Your free month of Practice Pro wraps up ${dateLabel}`,
    text:
      `Hi there,\n\n` +
      `A quick heads-up: your free month of full Practice Pro access wraps up ` +
      `on ${dateLabel} — about three days from now.\n\n` +
      `Nothing dramatic happens. Your first three passages stay free to ` +
      `practice with every tool, forever, and everything else stays saved ` +
      `exactly where you left it.\n\n` +
      `If you'd like to keep the whole thing — unlimited passages, full PDF ` +
      `parts, the Exercise Builder — it's now a single $19.99 purchase. One ` +
      `payment, yours forever, no subscription.\n\n` +
      `Either way, thanks for practicing with me. Just reply if you have ` +
      `questions — it's really me on the other end.\n\n` +
      `— Ralph\nplayfastnotes.com`,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return plain(405, "method not allowed");

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return plain(401, "unauthorized");
  }
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return plain(500, "email not configured");

  // Test mode: POST {"test": true} (with the cron secret) sends one sample
  // reminder to Ralph and touches nothing else — proves the Resend key,
  // domain, and template end-to-end without waiting for a real expiry.
  const body = await req.json().catch(() => ({}));
  if (body && body.test === true) {
    const { subject, text } = emailText(fmtDate(Date.now() + 3 * DAY_MS));
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [BCC],
        reply_to: REPLY_TO,
        subject: `[TEST] ${subject}`,
        text,
      }),
    });
    const detail = await res.text();
    return plain(res.ok ? 200 : 500, JSON.stringify({ test: true, ok: res.ok, detail }));
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = Date.now();
  const windowStart = now + 2 * DAY_MS;
  const windowEnd = now + 3 * DAY_MS;

  // Every subscriptions row once — small table (≈ user count). Used both to
  // find expiring comps and to exclude covered users from the trial sweep.
  const { data: subs, error: subsError } = await admin
    .from("subscriptions")
    .select("user_id, tier, status, current_period_end");
  if (subsError) {
    console.error("subscriptions read failed", subsError);
    return plain(500, "db error");
  }
  const activeCovered = new Set(
    (subs ?? [])
      .filter(
        (s) =>
          (s.tier === "comp" || s.tier === "pro") &&
          s.status === "active" &&
          typeof s.current_period_end === "number" &&
          s.current_period_end > now,
      )
      .map((s) => s.user_id as string),
  );

  // Targets: user_id → the expiry that triggers the reminder.
  const targets = new Map<string, number>();

  for (const s of subs ?? []) {
    if (s.tier !== "comp" || s.status !== "active") continue;
    const end = s.current_period_end as number | null;
    if (typeof end === "number" && end >= windowStart && end < windowEnd) {
      targets.set(s.user_id as string, end);
    }
  }

  // Trials: accounts with no active comp/pro row whose created_at + 30d lands
  // in the window. listUsers is paginated; the user base is small.
  const emails = new Map<string, string>();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      console.error("listUsers failed", error);
      return plain(500, "auth error");
    }
    for (const u of data.users) {
      if (u.email) emails.set(u.id, u.email);
      if (activeCovered.has(u.id)) continue;
      const trialEnd = Date.parse(u.created_at) + TRIAL_DAYS * DAY_MS;
      if (trialEnd >= windowStart && trialEnd < windowEnd) {
        targets.set(u.id, trialEnd);
      }
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  let sent = 0;
  let skipped = 0;
  for (const [userId, expiresAt] of targets) {
    const email = emails.get(userId);
    if (!email) continue;

    // Dedupe: insert first; a conflict means this exact reminder went out on
    // an earlier run (or a concurrent one) — skip quietly.
    const { error: insertError } = await admin
      .from("expiry_reminders")
      .insert({ user_id: userId, expires_at: expiresAt });
    if (insertError) {
      skipped += 1;
      continue;
    }

    const { subject, text } = emailText(fmtDate(expiresAt));
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        bcc: [BCC],
        reply_to: REPLY_TO,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      // Undo the dedupe row so tomorrow's run retries this person.
      console.error("resend failed", email, res.status, await res.text());
      await admin
        .from("expiry_reminders")
        .delete()
        .eq("user_id", userId)
        .eq("expires_at", expiresAt);
      continue;
    }
    sent += 1;
  }

  console.log(`expiry-reminder: ${sent} sent, ${skipped} already-sent`);
  return plain(200, JSON.stringify({ sent, skipped }));
});
