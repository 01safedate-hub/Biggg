import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-whatsapp-worker-secret",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function normPhone(value: string) { return value.replace(/\D/g, ""); }
function needsHuman(text: string) {
  return /\b(human|agent|secretary|staff|complain|complaint|refund|dispute|manager|speak to someone|talk to someone|wrong charge|overcharged|damaged|missing clothes|lost clothes)\b/i.test(text);
}
function isStop(text: string) { return /^\s*(stop|unsubscribe|opt\s*out)\s*$/i.test(text); }

async function sendWhatsApp(phone: string, text: string, token: string, phoneNumberId: string) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: { preview_url: false, body: text.slice(0, 3500) },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`meta_send_failed_${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  return payload?.messages?.[0]?.id as string | undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("WHATSAPP_INBOUND_PROCESSOR_SECRET");
  const suppliedSecret = req.headers.get("x-whatsapp-worker-secret");
  if (!expectedSecret || !suppliedSecret) return json({ error: "unauthorized" }, 401);
  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey("raw", enc.encode(expectedSecret!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", secretKey, enc.encode(suppliedSecret!)),
    crypto.subtle.sign("HMAC", secretKey, enc.encode(expectedSecret!)),
  ]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  if (diff !== 0) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const waToken = Deno.env.get("WA_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WA_PHONE_NUMBER_ID");
  if (!supabaseUrl || !serviceKey) return json({ error: "database_not_configured" }, 503);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: batch, error: claimError } = await db.rpc("whatsapp_claim_inbound_messages", { _limit: 10 });
  if (claimError) return json({ error: "queue_claim_failed" }, 500);
  let processed = 0, handedOff = 0, skipped = 0, failed = 0;

  for (const item of (batch ?? [])) {
    try {
      const body = (item.message_text ?? "").trim();
      const from = String(item.from_phone ?? "");
      if (!from || item.message_type !== "text" || !body) {
        await db.from("whatsapp_inbound_messages").update({
          status: "ignored", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          last_error: item.message_type === "text" ? "empty_text_message" : "unsupported_message_type",
        }).eq("id", item.id);
        skipped++;
        continue;
      }

      if (isStop(body)) {
        await db.rpc("whatsapp_opt_out_by_phone", { _phone: from });
        await db.from("whatsapp_inbound_messages").update({
          status: "processed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        processed++;
        continue;
      }

      const { data: allowed, error: rateError } = await db.rpc("whatsapp_inbound_rate_allowed", { _phone: from });
      if (rateError) throw new Error("rate_limit_check_failed");
      if (!allowed) {
        await db.from("whatsapp_inbound_messages").update({
          status: "ignored", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          last_error: "sender_rate_limit_exceeded",
        }).eq("id", item.id);
        skipped++;
        continue;
      }

      const { data: optedOut, error: optOutCheckError } = await db.rpc("whatsapp_is_opted_out_by_phone", { _phone: from });
      if (optOutCheckError) throw new Error("opt_out_check_failed");
      if (optedOut === true) {
        await db.from("whatsapp_inbound_messages").update({
          status: "ignored", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          last_error: "customer_opted_out",
        }).eq("id", item.id);
        skipped++;
        continue;
      }

      const receivedAt = item.provider_timestamp ? new Date(item.provider_timestamp) : new Date(item.received_at);
      const withinCustomerCareWindow = Number.isFinite(receivedAt.getTime()) &&
        Date.now() - receivedAt.getTime() <= 24 * 60 * 60 * 1000 &&
        Date.now() >= receivedAt.getTime();

      if (needsHuman(body)) {
        const { error: handoffError } = await db.from("whatsapp_handoffs").upsert({
          inbound_message_id: item.id,
          from_phone: from,
          reason: "customer_requested_human_or_support_issue",
          message_text: body.slice(0, 2000),
          status: "open",
        }, { onConflict: "inbound_message_id", ignoreDuplicates: true });
        if (handoffError) throw new Error("handoff_create_failed");
        handedOff++;
        if (withinCustomerCareWindow && waToken && phoneNumberId) {
          await sendWhatsApp(from, "Thanks for letting us know. I've flagged this for our team to review. A staff member will follow up as soon as possible.", waToken, phoneNumberId);
        }
        await db.from("whatsapp_inbound_messages").update({
          status: "processed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        processed++;
        continue;
      }

      // Fail closed: no generated answer is sent unless all AI and WhatsApp credentials exist
      // and the customer-care 24-hour window is still open.
      if (!openAiKey || !waToken || !phoneNumberId || !withinCustomerCareWindow) {
        await db.from("whatsapp_inbound_messages").update({
          status: "failed", run_after: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
          last_error: !withinCustomerCareWindow ? "outside_24h_customer_care_window" : "ai_or_whatsapp_credentials_missing",
        }).eq("id", item.id);
        failed++;
        continue;
      }

      const aiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: Deno.env.get("WHATSAPP_AI_MODEL") || "gpt-4.1-mini",
          instructions: [
            "You are LaundryPoint's WhatsApp customer-service assistant.",
            "Be concise, polite, and clear. Do not claim to be a human.",
            "Never invent prices, coverage areas, pickup times, order status, payment status, or policy.",
            "Do not create orders, payments, payment links, subscriptions, or change account data.",
            "If the user asks for prices, availability, order-specific information, refunds, complaints, or anything requiring account access, say you will pass it to the team and do not guess.",
            "For a human request, complaint, refund, damaged/missing clothing, or payment dispute, escalate instead of answering.",
            "If unsure, say a team member needs to confirm.",
          ].join(" "),
          input: body,
          max_output_tokens: 220,
        }),
      });
      const ai = await aiResponse.json().catch(() => ({}));
      if (!aiResponse.ok) throw new Error(`openai_failed_${aiResponse.status}`);
      const answer = (ai.output ?? []).flatMap((o: any) => o.content ?? [])
        .filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("\n").trim();
      if (!answer) throw new Error("empty_ai_response");

      // Escalate if model identifies a request it cannot safely resolve.
      if (/pass (this|it) to (the )?team|team member needs to confirm|staff member/i.test(answer)) {
        const { error: handoffError } = await db.from("whatsapp_handoffs").upsert({
          inbound_message_id: item.id, from_phone: from,
          reason: "assistant_could_not_safely_resolve", message_text: body.slice(0, 2000), status: "open",
        }, { onConflict: "inbound_message_id", ignoreDuplicates: true });
        if (handoffError) throw new Error("handoff_create_failed");
      }
      await sendWhatsApp(from, answer, waToken, phoneNumberId);
      await db.from("whatsapp_inbound_messages").update({
        status: "processed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      processed++;
    } catch (error) {
      const attempts = Number(item.attempts ?? 1);
      await db.from("whatsapp_inbound_messages").update({
        status: attempts >= 5 ? "failed" : "queued",
        run_after: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60 * 1000).toISOString(),
        last_error: String(error instanceof Error ? error.message : error).slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      failed++;
    }
  }

  return json({ claimed: (batch ?? []).length, processed, handedOff, skipped, failed });
});
