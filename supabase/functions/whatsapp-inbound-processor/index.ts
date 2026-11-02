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
  return /\b(human|agent|secretary|staff|complain|complaint|refund|dispute|manager|speak to someone|talk to someone|wrong charge|overcharged|damaged|missing clothes|lost clothes|missed pickup|pickup did not arrive|pickup hasn't arrived|missed delivery|delivery did not arrive)\b/i.test(text);
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
  // Pull current facts from the admin-maintained tables; do not hardcode coverage or plans.
  const [{ data: activeZones, error: zonesError }, { data: activePlans, error: plansError },
    { data: hubSetting, error: hubError }] = await Promise.all([
    db.from("zones").select("kind,name,villages,note").eq("is_live", true).order("sort_order").order("name"),
    db.from("plans").select("name,blurb,monthly_price_kobo,yearly_discount_pct,pieces_per_month,weekly_allowance,overage_price_kobo,category_limits").eq("active", true).order("sort_order"),
    db.from("settings").select("value").eq("key", "hub").maybeSingle(),
  ]);
  if (zonesError) console.error("active_zones_lookup_failed", zonesError.message);
  if (plansError) console.error("active_plans_lookup_failed", plansError.message);
  if (hubError) console.error("main_hub_lookup_failed", hubError.message);
  const money = (v: number | null | undefined) => v == null ? null : "₦" + (Number(v) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });
  const zonesContext = (activeZones ?? []).map((z: any) => [z.name, z.kind, z.villages?.length ? "areas: " + z.villages.join(", ") : null, z.note].filter(Boolean).join(" — ")).join("\n") || "No active zones configured; do not promise coverage.";
  const plansContext = (activePlans ?? []).map((p: any) => [p.name, p.blurb, p.monthly_price_kobo != null ? "monthly " + money(p.monthly_price_kobo) : null, p.pieces_per_month != null ? p.pieces_per_month + " garments/month" : null, p.weekly_allowance != null ? p.weekly_allowance + " garments/week" : null, p.yearly_discount_pct != null ? p.yearly_discount_pct + "% yearly discount" : null, p.overage_price_kobo != null ? money(p.overage_price_kobo) + " per extra garment" : null, p.category_limits ? "category limits " + JSON.stringify(p.category_limits) : null].filter(Boolean).join(" — ")).join("\n") || "No active plans configured; do not invent plan details.";
  const hub = (hubSetting?.value ?? {}) as { address?: string; maps_url?: string };
  const liveContext = ["Active hubs from Admin > Coverage zones (each active zone is a hub):\n" + zonesContext, "Main hub address: " + (hub.address || "not configured"), hub.maps_url ? "Main hub map: " + hub.maps_url : null, "Active subscription plans:\n" + plansContext].filter(Boolean).join("\n");
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

      // Only an explicit STOP/opt-out blocks replies. A missing notification opt-in\n      // must not silence a customer who has just messaged the business.\n      const { data: optedOut, error: optOutCheckError } = await db.rpc("whatsapp_is_opted_out_by_phone", { _phone: from });
      if (optOutCheckError) throw new Error("opt_out_check_failed");
      if (optedOut === true) {
        await db.from("whatsapp_inbound_messages").update({
          status: "ignored", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          last_error: "customer_opted_out",
        }).eq("id", item.id);
        skipped++;
        continue;
      }

      const { data: priorInbound, error: priorInboundError } = await db.from("whatsapp_conversation_messages").select("id").eq("inbound_message_id", item.id).maybeSingle();
      if (priorInboundError) throw new Error("conversation_inbound_lookup_failed");
      if (!priorInbound) {
        const { error: saveInboundError } = await db.from("whatsapp_conversation_messages").insert({ phone: from, direction: "inbound", body: body.slice(0, 3500), inbound_message_id: item.id, provider_message_id: item.provider_message_id || null, delivery_status: "received" });
        if (saveInboundError) throw new Error("conversation_inbound_save_failed");
      }
      // Account access is email-verified and scoped to this WhatsApp sender.
      const sensitiveIntent = /\\b(my account|my profile|my address|my order|track my|order status|my subscription|subscription status|remaining garments|garment balance|payment status|request (a )?(for )?pickup|book (a )?pickup|schedule (a )?pickup|change my address|cancel my order)\\b/i.test(body);
      const { data: verification } = await db.from("whatsapp_account_verifications").select("phone,email,code_hash,expires_at,verified_until,attempts,last_sent_at").eq("phone", from).maybeSingle();
      const normalizedEmail = body.trim().match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
      const isCode = /^[A-Z0-9]{6}$/i.test(body.trim());
      const nowMs = Date.now();
      const activeVerified = Boolean(verification?.verified_until && new Date(verification.verified_until).getTime() > nowMs);
      const activeChallenge = Boolean(verification?.code_hash && verification?.expires_at && new Date(verification.expires_at).getTime() > nowMs);
      if (activeChallenge && isCode && !activeVerified) {
        if (Number(verification.attempts ?? 0) >= 6) {
          await db.from("whatsapp_account_verifications").update({ code_hash: null, expires_at: null, updated_at: new Date().toISOString() }).eq("phone", from);
          await sendWhatsApp(from, "For your security, that verification attempt has expired. Please send your email address to request a new code.", waToken!, phoneNumberId!);
        } else {
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.trim().toUpperCase()));
          const codeHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
          if (codeHash === verification.code_hash) {
            await db.from("whatsapp_account_verifications").update({ code_hash: null, expires_at: null, attempts: 0, verified_until: new Date(nowMs + 30 * 60 * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("phone", from);
            await sendWhatsApp(from, "Your email is verified. I can now help with your own LaundryPoint account for the next 30 minutes. What would you like to do?", waToken!, phoneNumberId!);
          } else {
            await db.from("whatsapp_account_verifications").update({ attempts: Number(verification.attempts ?? 0) + 1, updated_at: new Date().toISOString() }).eq("phone", from);
            await sendWhatsApp(from, "That code doesn't match. Please check the latest email code and try again.", waToken!, phoneNumberId!);
          }
        }
        await db.from("whatsapp_inbound_messages").update({ status: "processed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", item.id);
        processed++; continue;
      }
      if (normalizedEmail && (!activeVerified || verification?.email !== normalizedEmail)) {
        const { data: profile, error: profileError } = await db.from("profiles").select("id,email").ilike("email", normalizedEmail).maybeSingle();
        if (profileError) throw new Error("customer_email_lookup_failed");
        if (!profile) {
          await db.from("whatsapp_account_verifications").upsert({ phone: from, email: normalizedEmail, code_hash: null, expires_at: null, verified_until: null, attempts: 0, updated_at: new Date().toISOString() }, { onConflict: "phone" });
          await sendWhatsApp(from, "I couldn't find a LaundryPoint customer account for that email. Please create your account first at https://laundrypoint.app/signup, then return here and send the email address linked to your account.", waToken!, phoneNumberId!);
        } else {
          const lastSent = verification?.last_sent_at ? new Date(verification.last_sent_at).getTime() : 0;
          if (nowMs - lastSent < 60 * 1000) await sendWhatsApp(from, "For security, please wait a minute before requesting another verification code.", waToken!, phoneNumberId!);
          else {
            const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", random = new Uint8Array(6); crypto.getRandomValues(random);
            const code = Array.from(random, n => alphabet[n % alphabet.length]).join("");
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
            const codeHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
            const { error: saveError } = await db.from("whatsapp_account_verifications").upsert({ phone: from, email: normalizedEmail, code_hash: codeHash, expires_at: new Date(nowMs + 10 * 60 * 1000).toISOString(), verified_until: null, attempts: 0, last_sent_at: new Date(nowMs).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "phone" });
            if (saveError) throw new Error("verification_challenge_save_failed");
            const { error: emailError } = await db.from("email_outbox").insert({ to_email: normalizedEmail, template: "whatsapp_verification", payload: { code, expires_minutes: 10 }, status: "queued", idempotency_key: "wa-verify:" + from + ":" + nowMs });
            if (emailError) throw new Error("verification_email_queue_failed");
            await sendWhatsApp(from, "I've sent a six-character verification code to that email address. It expires in 10 minutes. Reply with the code to continue.", waToken!, phoneNumberId!);
          }
        }
        await db.from("whatsapp_inbound_messages").update({ status: "processed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", item.id);
        processed++; continue;
      }
      if (sensitiveIntent && !activeVerified) {
        await sendWhatsApp(from, "I can help with your own pickup, orders, subscription or account, but first I need to verify your email. Please reply with the email address linked to your LaundryPoint account. If you don't have an account yet, sign up at https://laundrypoint.app/signup.", waToken!, phoneNumberId!);
        await db.from("whatsapp_inbound_messages").update({ status: "processed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", item.id);
        processed++; continue;
      }
      let verifiedAccountContext = "No verified customer account; do not reveal personal data.";
      if (activeVerified && verification?.email) {
        const { data: profile } = await db.from("profiles").select("id,full_name,email,status").ilike("email", verification.email).maybeSingle();
        if (profile) {
          const [{ data: orders }, { data: subscriptions }] = await Promise.all([
            db.from("orders").select("order_no,status,scheduled_for,created_at").eq("customer_id", profile.id).order("created_at", { ascending: false }).limit(5),
            db.from("subscriptions").select("status,billing_period,current_period_end,price_kobo").eq("customer_id", profile.id).order("created_at", { ascending: false }).limit(3)
          ]);
          verifiedAccountContext = JSON.stringify({ name: profile.full_name, email: profile.email, status: profile.status, recent_orders: orders ?? [], subscriptions: subscriptions ?? [] });
        }
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

      const { data: history, error: historyError } = await db.from("whatsapp_conversation_messages").select("direction,body,created_at").eq("phone", from).order("created_at", { ascending: false }).limit(10);
      if (historyError) throw new Error("conversation_history_load_failed");
      const aiInput = (history ?? []).reverse().map((m: { direction: string; body: string }) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: m.body }));
      const aiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: Deno.env.get("WHATSAPP_AI_MODEL") || "gpt-4.1-mini",
          instructions: [
            "You are LaundryPoint's WhatsApp customer-service assistant. Be concise, warm, direct, and answer the actual question.",
            "Account privacy: only use this verified account context for the current WhatsApp sender; never infer or disclose another customer's data.",
            `Verified account context: ${verifiedAccountContext}`,
            `Verified live LaundryPoint facts from the database:\n${liveContext}`,
            "Every active entry in Admin > Coverage zones is a LaundryPoint hub. If Owerri West or Amawbia appears in the active list, confirm we have a hub there. Never say an active zone has no hub. If a place is absent, say it is not currently listed as active. Never reveal internal coordinates, radii, database fields, or implementation details.",
            "Intent handling: distinguish general information, new pickup booking, existing-order tracking, subscription, payment, delivery, complaint, and human-support requests.",
            "Do not assume every mention of pickup/delivery means the customer wants to book. Questions about how pickup-to-delivery works are informational; explain the process briefly and do not immediately ask for an address/date/time.",
            "Only collect booking details when the customer explicitly asks to book, schedule, arrange, or request a new pickup. WhatsApp guidance does not create a booking. Direct customers to sign in to the LaundryPoint website and use Orders/Book pickup; never claim a booking exists without system confirmation.",
            "For tracking, direct customers to sign in and open Orders. Never invent order status or claim staff has been contacted unless a real handoff was saved.",
            "Explain the process briefly: submit a pickup request on the website, confirm address and available slot, check status in Orders, verify the arrival code with the assigned agent, the agent records garment count, and follow updates in Orders. Do not promise unconfirmed times/status.",
            "Excess subscription garments are recorded by the pickup agent and paid through the approved online flow. Never tell customers to pay cash to agents.",
            "Escalate real complaints, refunds, payment disputes, missing/damaged clothes, missed pickups/deliveries, or explicit human requests by saving a real staff handoff. Do not claim escalation unless it was saved.",
            "Use only the live active plans and active coverage list below. Do not invent prices, policies, hubs, bookings, or order statuses.",
            "Answer in WhatsApp-friendly plain text. Use short headings and bullets when listing multiple plans.",
            "When asked to list all subscription plans, include every active plan with its monthly price, monthly garment allowance, weekly allowance, annual discount and extra-garment price. Finish the entire list. Do not omit a plan or cut off the final plan.",
            "When asked which plan to choose, recommend conditionally based on the customer's stated household or garment volume. If their needs are not known, explain who each plan is designed for and ask roughly how many garments they expect per month; do not make an unsupported personal recommendation.",
            "State both the monthly garment limit and weekly allowance exactly as configured in the live Plans table.",
            "Family Bond has a configured weekly allowance of 500 and Family Max has 150. Repeat the live database values exactly; never swap or normalize them.",
            "Be concise, polite, and clear. Do not claim to be a human.",
            "Never invent prices, coverage areas, pickup times, order status, payment status, or policy.",
            "Do not create orders, payments, payment links, subscriptions, or change account data.",
            "If the user asks for prices, availability, order-specific information, refunds, complaints, or anything requiring account access, say you will pass it to the team and do not guess.",
            "For a human request, complaint, refund, damaged/missing clothing, or payment dispute, escalate instead of answering.",
            "If unsure, say a team member needs to confirm.",
          ].join(" "),
          input: aiInput,
          max_output_tokens: 900,
        }),
      });
      const ai = await aiResponse.json().catch(() => ({}));
      if (!aiResponse.ok) throw new Error(`openai_failed_${aiResponse.status}`);
      const answer = (ai.output ?? []).flatMap((o: any) => o.content ?? [])
        .filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("\n").trim();
      if (!answer) throw new Error("empty_ai_response");
      if (ai.status === "incomplete" || ai.incomplete_details?.reason === "max_output_tokens") {
        throw new Error("ai_response_incomplete_max_output_tokens");
      }

      // Escalate if model identifies a request it cannot safely resolve.
      if (/pass (this|it) to (the )?team|team member needs to confirm|staff member/i.test(answer)) {
        const { error: handoffError } = await db.from("whatsapp_handoffs").upsert({
          inbound_message_id: item.id, from_phone: from,
          reason: "assistant_could_not_safely_resolve", message_text: body.slice(0, 2000), status: "open",
        }, { onConflict: "inbound_message_id", ignoreDuplicates: true });
        if (handoffError) throw new Error("handoff_create_failed");
      }
      const providerMessageId = await sendWhatsApp(from, answer, waToken, phoneNumberId);
      const { error: saveOutboundError } = await db.from("whatsapp_conversation_messages").insert({ phone: from, direction: "outbound", body: answer.slice(0, 3500), provider_message_id: providerMessageId ?? null, delivery_status: "sent" });
      if (saveOutboundError) throw new Error("conversation_outbound_save_failed");
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
