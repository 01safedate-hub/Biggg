// Sends queued WhatsApp template messages through Meta Cloud API.
// Called every minute by pg_cron. No message is sent unless consent is true,
// phone normalization passes, and a Meta-approved template name is configured.
import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH = 50;
const GRAPH_VERSION = Deno.env.get("WA_GRAPH_VERSION") ?? "v23.0";
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";

type Row = {
  id: string;
  user_id: string | null;
  order_id: string | null;
  to_phone: string;
  event: string;
  template: string;
  variables: Record<string, unknown>;
  attempts: number;
  run_after: string;
  condition: Record<string, unknown> | null;
  idempotency_key: string;
};

function responseError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function inLagosQuietHours(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now));
  return hour >= 21 || hour < 7;
}

function safeError(value: unknown) {
  const raw = value instanceof Error ? value.message : String(value ?? "provider_error");
  return raw.replace(/\s+/g, " ").slice(0, 500);
}

function retryAt(attempts: number) {
  const mins = Math.min(60, 2 ** Math.min(attempts, 6));
  return new Date(Date.now() + mins * 60_000).toISOString();
}

function templateComponents(vars: Record<string, unknown>) {
  // Meta utility templates use a numbered body parameter list. Keep values strings
  // and pass data only in the approved template's expected order.
  const values = Array.isArray(vars.template_params)
    ? (vars.template_params as unknown[]).map((x) => String(x ?? ""))
    : [];
  return values.length
    ? [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }]
    : [];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return responseError("method_not_allowed", 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const workerSecret = req.headers.get("x-worker-secret");
  const token = Deno.env.get("WA_TOKEN");
  const phoneNumberId = Deno.env.get("WA_PHONE_NUMBER_ID");
  if (!supabaseUrl || !serviceKey || !workerSecret) return responseError("worker_not_configured", 500);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: allowed, error: authError } = await db.rpc("verify_whatsapp_worker_secret", { _s: workerSecret });
  if (authError || allowed !== true) return responseError("unauthorized", 401);

  // Do not lease jobs if the provider is not configured; leave the outbox safely queued.
  if (!token || !phoneNumberId) {
    return Response.json({ claimed: 0, sent: 0, failed: 0, skipped: "provider_not_configured" });
  }

  // Only dispatch approved template identifiers, configured explicitly by the owner.
  const templateMap: Record<string, string | undefined> = {
    pickup_confirmed: Deno.env.get("WA_TEMPLATE_PICKUP_CONFIRMED"),
    agent_assigned: Deno.env.get("WA_TEMPLATE_AGENT_ASSIGNED"),
    agent_arrived: Deno.env.get("WA_TEMPLATE_AGENT_ARRIVED"),
    count_ready: Deno.env.get("WA_TEMPLATE_COUNT_READY"),
    count_reminder: Deno.env.get("WA_TEMPLATE_COUNT_REMINDER"),
    stain_notice: Deno.env.get("WA_TEMPLATE_STAIN_NOTICE"),
    payment_receipt: Deno.env.get("WA_TEMPLATE_PAYMENT_RECEIPT"),
    hub_received: Deno.env.get("WA_TEMPLATE_HUB_RECEIVED"),
    instant_started: Deno.env.get("WA_TEMPLATE_INSTANT_STARTED"),
    instant_late: Deno.env.get("WA_TEMPLATE_INSTANT_LATE"),
    order_ready: Deno.env.get("WA_TEMPLATE_ORDER_READY"),
    ready_reminder: Deno.env.get("WA_TEMPLATE_READY_REMINDER"),
    delivery_payment_link: Deno.env.get("WA_TEMPLATE_DELIVERY_PAYMENT_LINK"),
    delivery_payment_reminder: Deno.env.get("WA_TEMPLATE_DELIVERY_PAYMENT_REMINDER"),
    rider_assigned: Deno.env.get("WA_TEMPLATE_RIDER_ASSIGNED"),
    delivery_failed: Deno.env.get("WA_TEMPLATE_DELIVERY_FAILED"),
    delivered: Deno.env.get("WA_TEMPLATE_DELIVERED"),
    rate_reminder: Deno.env.get("WA_TEMPLATE_RATE_REMINDER"),
    storage_warning: Deno.env.get("WA_TEMPLATE_STORAGE_WARNING"),
    storage_started: Deno.env.get("WA_TEMPLATE_STORAGE_STARTED"),
    subscription_pickup_reminder: Deno.env.get("WA_TEMPLATE_SUBSCRIPTION_PICKUP"),
    subscription_invoice_due: Deno.env.get("WA_TEMPLATE_SUBSCRIPTION_INVOICE"),
  };

  const { data: rows, error: claimError } = await db.rpc("claim_whatsapp_outbox", { _limit: BATCH });
  if (claimError) {
    console.error("claim_whatsapp_outbox failed", claimError.message);
    return responseError("queue_claim_failed", 500);
  }

  let sent = 0;
  let failed = 0;
  for (const row of (rows ?? []) as Row[]) {
    const postpone = async (reason: string, runAfter: string) => {
      await db.from("whatsapp_outbox").update({
        status: "queued",
        run_after: runAfter,
        last_error: reason,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "processing");
    };

    // Quiet hours apply to reminders only; transactional status notices can pass.
    const isReminder = row.event.endsWith("_reminder") ||
      row.event === "count_reminder" ||
      row.event === "subscription_invoice_due" ||
      row.event === "subscription_pickup_reminder";
    if (isReminder && inLagosQuietHours()) {
      const next = new Date();
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(next);
      const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
      const target = new Date(`${p.year}-${p.month}-${p.day}T07:00:00+01:00`);
      if (next.getTime() >= target.getTime()) target.setDate(target.getDate() + 1);
      await postpone("quiet_hours_lagos", target.toISOString());
      continue;
    }

    const templateName = templateMap[row.event] ?? templateMap[row.template];
    if (!templateName) {
      await db.from("whatsapp_outbox").update({
        status: "failed",
        attempts: row.attempts + 1,
        last_error: `template_not_configured:${row.event}`,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "processing");
      failed++;
      continue;
    }

    // Current-state guards for delayed reminders are checked at send time.
    const { data: eligible, error: eligibilityError } = await db.rpc("whatsapp_outbox_is_eligible", { _id: row.id });
    if (eligibilityError || eligible !== true) {
      await db.from("whatsapp_outbox").update({
        status: "cancelled",
        last_error: eligibilityError ? "eligibility_check_failed" : "condition_no_longer_true",
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "processing");
      continue;
    }

    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: row.to_phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: templateComponents(row.variables ?? {}),
      },
    };

    try {
      const provider = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await provider.json().catch(() => ({}));
      if (!provider.ok) {
        const description = safeError((result as { error?: { message?: string } }).error?.message ?? `meta_http_${provider.status}`);
        await db.from("whatsapp_outbox").update({
          status: row.attempts + 1 >= 8 ? "failed" : "queued",
          attempts: row.attempts + 1,
          run_after: row.attempts + 1 >= 8 ? row.run_after : retryAt(row.attempts),
          last_error: description,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("status", "processing");
        failed++;
        continue;
      }
      const msgId = (result as { messages?: Array<{ id?: string }> }).messages?.[0]?.id;
      await db.from("whatsapp_outbox").update({
        status: "sent",
        attempts: row.attempts + 1,
        sent_at: new Date().toISOString(),
        provider_message_id: msgId ?? null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "processing");
      sent++;
    } catch (err) {
      await db.from("whatsapp_outbox").update({
        status: row.attempts + 1 >= 8 ? "failed" : "queued",
        attempts: row.attempts + 1,
        run_after: retryAt(row.attempts),
        last_error: safeError(err),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "processing");
      failed++;
    }
  }

  return Response.json({ claimed: (rows ?? []).length, sent, failed, site: SITE });
});
