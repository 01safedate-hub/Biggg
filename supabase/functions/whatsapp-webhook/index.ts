// Meta WhatsApp Cloud API webhook: GET verification challenge and signed POST status updates.
// Configure WA_APP_SECRET and WA_VERIFY_TOKEN. POST payload signatures use X-Hub-Signature-256.
import { createClient } from "npm:@supabase/supabase-js@2";

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(raw: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return constantTimeEqual(`sha256=${hex(new Uint8Array(signed))}`, signature);
}

Deno.serve(async (req) => {
  const verifyToken = Deno.env.get("WA_VERIFY_TOKEN");
  const appSecret = Deno.env.get("WA_APP_SECRET");
  if (!verifyToken || !appSecret) return new Response("webhook_not_configured", { status: 503 });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && challenge && constantTimeEqual(token, verifyToken)) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256"), appSecret))) {
    return new Response("invalid_signature", { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("server_not_configured", { status: 500 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  let payload: { entry?: Array<{ changes?: Array<{ value?: {
    statuses?: Array<{ id?: string; status?: string; timestamp?: string; errors?: unknown[] }>;
    messages?: Array<{ from?: string; id?: string; timestamp?: string; text?: { body?: string }; location?: { latitude?: number; longitude?: number; name?: string; address?: string }; type?: string }>;
  } }> }> };
  try { payload = JSON.parse(raw); } catch { return new Response("invalid_json", { status: 400 }); }

  const expectedPhoneNumberId = Deno.env.get("WA_PHONE_NUMBER_ID");
  if (!expectedPhoneNumberId) return new Response("phone_number_routing_not_configured", { status: 503 });
  let updated = 0;
  let optOuts = 0;
  let inboundSeen = 0;
  let statusesSeen = 0;
  let phoneIdMismatches = 0;
  let enqueueErrors = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      // Fail closed: never process events for another WhatsApp number on the shared WABA.
      const eventPhoneNumberId = String(value.metadata?.phone_number_id ?? "");
      if (eventPhoneNumberId !== expectedPhoneNumberId) {
        phoneIdMismatches++;
        console.warn("whatsapp_webhook_phone_id_mismatch", { expectedPhoneNumberId, eventPhoneNumberId });
        continue;
      }
      for (const item of value.statuses ?? []) {
        statusesSeen++;
        if (!item.id || !item.status) continue;
        const at = item.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString() : new Date().toISOString();
        const status = item.status.toLowerCase();
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (status === "sent") patch.status = "sent";
        else if (status === "delivered") { patch.status = "delivered"; patch.delivered_at = at; }
        else if (status === "read") { patch.status = "read"; patch.delivered_at = at; patch.read_at = at; }
        else if (status === "failed") {
          patch.status = "failed";
          patch.last_error = JSON.stringify(item.errors ?? []).slice(0, 500);
        } else continue;

        const { data, error } = await db.from("whatsapp_outbox")
          .update(patch).eq("provider_message_id", item.id).select("id").maybeSingle();
        if (!error && data) updated++;
      }

      // Store inbound messages durably and deduplicate by Meta's message ID.
      // STOP is processed immediately and is never sent to the AI queue.
      for (const message of value.messages ?? []) {
        inboundSeen++;
        if (!message.from || !message.id) continue;
        if (message.type === "text" && /^\s*STOP\s*$/i.test(message.text?.body ?? "")) {
          const { data, error } = await db.rpc("whatsapp_opt_out_by_phone", { _phone: message.from });
          if (!error && data === true) optOuts++;
          continue;
        }
        const textBody = message.type === "text"
          ? (message.text?.body ?? "").trim()
          : message.type === "location"
            ? JSON.stringify({
                latitude: message.location?.latitude,
                longitude: message.location?.longitude,
                name: message.location?.name ?? null,
                address: message.location?.address ?? null,
              })
            : null;
        const { error } = await db.from("whatsapp_inbound_messages").upsert({
          provider_message_id: message.id,
          from_phone: message.from,
          message_type: message.type ?? "unknown",
          message_text: textBody?.slice(0, 4000) ?? null,
          provider_timestamp: message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
          status: "queued",
          updated_at: new Date().toISOString(),
        }, { onConflict: "provider_message_id", ignoreDuplicates: true });
        if (error) {
          enqueueErrors++;
          console.error("inbound_message_enqueue_failed", error.message);
        }
      }
    }
  }

  // Process inbound customer chat immediately through the dedicated inbound processor.
  // This RPC queues an authenticated pg_net request to whatsapp-inbound-processor;
  // whatsapp-worker remains exclusively responsible for outbound notification templates.
  if (inboundSeen > 0 && enqueueErrors === 0) {
    const { data: kickRequestId, error: kickError } = await db.rpc("kick_whatsapp_inbound_processor");
    if (kickError) {
      console.error("whatsapp_processor_kick_failed", kickError.message);
    } else {
      console.info("whatsapp_processor_kicked", { requestId: kickRequestId });
    }
  }
  console.info("whatsapp_webhook_summary", { inboundSeen, statusesSeen, phoneIdMismatches, enqueueErrors, updated, optOuts });
  return Response.json({ received: true, inboundSeen, statusesSeen, phoneIdMismatches, enqueueErrors, updated, optOuts });
});
