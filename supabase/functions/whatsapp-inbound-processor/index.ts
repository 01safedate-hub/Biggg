import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const suppliedSecret = req.headers.get("x-worker-secret");
  if (!supabaseUrl || !serviceKey) return json({ error: "database_not_configured" }, 503);
  if (!suppliedSecret) return json({ error: "unauthorized" }, 401);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Use Coverage zones as the source of truth for active service locations.
  const [
    { data: activeZones, error: zonesError },
    { data: hubSetting, error: settingError },
    { data: activePlans, error: plansError },
    { data: subscriptionDefaults, error: subscriptionDefaultsError },
  ] = await Promise.all([
    db.from("zones")
      .select("kind,name,slug,centre_lat,centre_lng,radius_m,villages,note,postal_code")
      .eq("is_live", true)
      .order("sort_order")
      .order("name"),
    db.from("settings").select("value").eq("key", "hub").maybeSingle(),
    db.from("plans")
      .select("name,blurb,monthly_price_kobo,yearly_discount_pct,pieces_per_month,weekly_allowance,overage_price_kobo,category_limits")
      .eq("active", true)
      .order("sort_order"),
    db.from("settings").select("value").eq("key", "subscription").maybeSingle(),
  ]);
  if (zonesError) console.error("active_coverage_zones_lookup_failed", zonesError.message);
  if (settingError) console.error("hub_address_lookup_failed", settingError.message);
  if (plansError) console.error("active_subscription_plans_lookup_failed", plansError.message);
  if (subscriptionDefaultsError) console.error("subscription_defaults_lookup_failed", subscriptionDefaultsError.message);
  const naira = (kobo: number | null | undefined) =>
    kobo == null ? null : "₦" + (kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });
  const plansContext = (activePlans ?? []).map((plan: {
    name: string; blurb: string | null; monthly_price_kobo: number | null;
    yearly_discount_pct: number | null; pieces_per_month: number | null;
    weekly_allowance: number | null; overage_price_kobo: number | null;
    category_limits: Record<string, unknown> | null;
  }) => [
    plan.name,
    plan.blurb,
    plan.monthly_price_kobo != null ? "monthly price " + naira(Number(plan.monthly_price_kobo)) : null,
    plan.yearly_discount_pct != null ? "yearly discount " + plan.yearly_discount_pct + "%" : null,
    plan.pieces_per_month != null ? plan.pieces_per_month + " garments per month" : null,
    plan.weekly_allowance != null ? plan.weekly_allowance + " garments per week" : null,
    plan.overage_price_kobo != null ? "overage price " + naira(Number(plan.overage_price_kobo)) + " per extra garment" : null,
    plan.category_limits ? "category limits " + JSON.stringify(plan.category_limits) : null,
  ].filter(Boolean).join(" — ")).join("\\n") || "No active subscription plans are configured in the database.";
  const subscriptionSetting = (subscriptionDefaults?.value ?? {}) as { pickups_per_month?: number; yearly_discount_pct?: number };
  const subscriptionContext = [
    "Active subscription plans from the live Plans table:",
    plansContext,
    subscriptionSetting.pickups_per_month != null ? "Default subscription pickups per month: " + subscriptionSetting.pickups_per_month : null,
    subscriptionSetting.yearly_discount_pct != null ? "Default annual subscription discount: " + subscriptionSetting.yearly_discount_pct + "%" : null,
  ].filter(Boolean).join("\\n");
  const hubValue = (hubSetting?.value ?? {}) as { address?: string; maps_url?: string; lat?: number; lng?: number };
  const coverageContext = (activeZones ?? []).map((zone: { kind: string; name: string; centre_lat: number | null; centre_lng: number | null; radius_m: number | null; villages: string[] | null; note: string | null; postal_code: string | null }) =>
    [zone.kind, zone.name, zone.radius_m ? "radius " + zone.radius_m + "m" : null,
     zone.centre_lat != null && zone.centre_lng != null ? "coordinates " + zone.centre_lat + "," + zone.centre_lng : null,
     zone.postal_code ? "postal code " + zone.postal_code : null,
     zone.villages?.length ? "villages: " + zone.villages.join(", ") : null, zone.note].filter(Boolean).join(" — ")
  ).join("\\n") || "No active coverage zones are configured. Do not promise service coverage; ask the customer to contact LaundryPoint staff.";
  const hubContext = [
    "Current main hub address: " + (hubValue.address || "not configured"),
    hubValue.maps_url ? "Hub map: " + hubValue.maps_url : null,
    hubValue.lat != null && hubValue.lng != null ? "Hub coordinates: " + hubValue.lat + "," + hubValue.lng : null,
    "Active coverage zones from Admin > Coverage zones:\\n" + coverageContext,
  ].filter(Boolean).join("\\n");
  const { data: allowed, error: authError } = await db.rpc("verify_whatsapp_worker_secret", { _s: suppliedSecret });
  if (authError || allowed !== true) return json({ error: "unauthorized" }, 401);

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const waToken = Deno.env.get("WA_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WA_PHONE_NUMBER_ID");
  const expectedPhoneNumberId = "1495104737011591";
  if (phoneNumberId !== expectedPhoneNumberId) {
    console.error("inbound_processor_phone_number_id_mismatch");
    return json({ error: "phone_number_routing_not_configured" }, 503);
  }

  const { data: batch, error: claimError } = await db.rpc("whatsapp_claim_inbound_messages", { _limit: 10 });
  if (claimError) {
    console.error("whatsapp_claim_inbound_messages_failed", claimError.message);
    return json({ error: "queue_claim_failed" }, 500);
  }
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

      const { data: allowedRate, error: rateError } = await db.rpc("whatsapp_inbound_rate_allowed", { _phone: from });
      if (rateError) throw new Error("rate_limit_check_failed");
      if (!allowedRate) {
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

      // Persist the inbound turn idempotently before generating a reply.
      const { data: existingInboundHistory, error: inboundLookupError } = await db.from("whatsapp_conversation_messages")
        .select("id").eq("inbound_message_id", item.id).maybeSingle();
      if (inboundLookupError) throw new Error("conversation_inbound_lookup_failed");
      if (!existingInboundHistory) {
        const { error: inboundHistoryError } = await db.from("whatsapp_conversation_messages").insert({
          phone: from, direction: "inbound", body: body.slice(0, 3500),
          inbound_message_id: item.id, provider_message_id: item.provider_message_id || null,
          delivery_status: "received",
        });
        if (inboundHistoryError) throw new Error("conversation_inbound_save_failed");
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

      if (!openAiKey || !waToken || !phoneNumberId || !withinCustomerCareWindow) {
        await db.from("whatsapp_inbound_messages").update({
          status: "failed", run_after: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
          last_error: !withinCustomerCareWindow ? "outside_24h_customer_care_window" : "ai_or_whatsapp_credentials_missing",
        }).eq("id", item.id);
        failed++;
        continue;
      }

      const { data: conversationHistory, error: historyError } = await db.from("whatsapp_conversation_messages")
        .select("direction,body,created_at").eq("phone", from)
        .order("created_at", { ascending: false }).limit(10);
      if (historyError) throw new Error("conversation_history_load_failed");
      const aiInput = (conversationHistory ?? []).reverse().map((m: { direction: string; body: string }) => ({
        role: m.direction === "inbound" ? "user" : "assistant", content: m.body
      }));

      const aiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: Deno.env.get("WHATSAPP_AI_MODEL") || "gpt-4.1-mini",
          instructions: [
            "You are LaundryPoint's WhatsApp customer-service assistant.",
            `LaundryPoint hub and coverage information loaded live from Admin > Coverage zones:\\n${hubContext}`,
            "LaundryPoint business rule: EVERY active (is_live=true) entry in Admin > Coverage zones represents a LaundryPoint hub/location. This includes Owerri west while it remains active. Never say we have no hub in an active zone. When asked about a location, check the active zone list and answer directly: if it matches an active zone, confirm we have a hub there; otherwise say it is not currently listed as an active hub.",
            "Never expose internal coordinates, GPS values, radius in metres, database fields, or implementation details to customers. Use the area name only, and provide the main hub address/map only when asked for the main hub or directions.",
            "Use active Coverage zones as the source of truth. Do not confuse the main hub address setting with the full list of hubs.",
            `Current laundry services, pricing and subscription rules from live database data:\\\\n${subscriptionContext}`,
            "LaundryPoint offers laundry and dry-cleaning services. Do not invent per-item washing or dry-cleaning prices; only quote amounts explicitly available in the live plans data. If a specific service price is not listed, offer to have the team confirm it.",
            "Pickup and delivery help: customers request a pickup through the LaundryPoint customer website after signing in and opening the Orders/Book pickup flow. If the customer asks how to book, explain the steps; do not claim a booking has been created in WhatsApp. If they need the page, share the website link only if it is configured/known; otherwise direct them to the LaundryPoint website and Orders section.",
            "Pickup booking steps: sign in or create a customer account, open the pickup booking form, allow location permission or choose the pickup location on the map, verify the address/landmark, choose now or an available scheduled slot, review the details, then submit the pickup request. The location must be covered by an active Admin > Coverage zones entry; if coverage is unclear, ask for the area/address and do not promise coverage.",
            "Pickup confirmation/payment: for subscription customers, the request is created awaiting agent assignment and no payment is taken at booking. For one-time pickups, the customer must pay the displayed transport fare and the booking is not confirmed until the payment is verified. Laundry charges are separate and are calculated after the pickup agent counts the garments. Never say a pickup is confirmed until the system confirms it.",
            "Collection process: an assigned agent contacts/visits the customer; the customer should verify the arrival code shown for that order before handover. The agent counts/records garments and any garments beyond the active subscription allowance are charged separately at the configured overage rate. Do not promise an exact pickup or delivery time unless a confirmed slot/status is available.",
            "Order updates and tracking: direct customers to sign in and open Orders to view their order details/status. Do not invent agent assignment, arrival, garment count, payment, processing or delivery status. If a customer asks about a specific order, explain where to check it; if the status is missing or unclear, create a staff handoff.",
            "Delivery/payment rules: explain only the policy supported by the current order and configured system. Do not ask customers to pay cash to agents. Do not create bookings, payment links, or change an order through WhatsApp; guide them to the existing secure website flow.",
            "Location privacy: ask for the area, street/landmark, or the location submitted in the booking form only when needed. Never request passwords, OTPs, card details or other payment credentials in WhatsApp.",
            "For subscription questions, use the live active Plans table as the source of truth for plan names, prices, garment limits, weekly allowances, overage price and category limits. Explain only relevant details and never make up missing values.",
            "The subscription allowance is based on garment count, not a restriction on clothing type, unless a live plan category limit explicitly says otherwise. If a pickup exceeds the included allowance, the pickup agent records the extra garments and the customer pays for the excess separately; do not claim extra garments are included.",
            "For account-specific subscription status, remaining garment balance, payment status or exact overage due, pass the request to the team rather than guessing. Do not create subscriptions, payment links or change account data.",
            "Answer in WhatsApp-friendly plain text. Use short headings and bullets when listing multiple plans.",
            "When asked to list all subscription plans, include every active plan with its monthly price, monthly garment allowance, weekly allowance, annual discount and extra-garment price. Finish the entire list. Do not omit a plan or cut off the final plan.",
            "When asked which plan to choose, recommend conditionally based on the customer's stated household or garment volume. If their needs are not known, explain who each plan is designed for and ask roughly how many garments they expect per month; do not make an unsupported personal recommendation.",
            "Do not describe the weekly allowance as more important than the monthly garment limit. State both exactly as configured in the live Plans table.",
            "Family Bond has a configured weekly allowance of 500 and Family Max has 150. Repeat the live database values exactly; never swap or normalize them.",
            "Keep replies very brief (usually 1–3 sentences), answer only what was asked, and do not repeat generic greetings in every reply.",
            "Be concise, polite, and clear. Do not claim to be a human.",
            "Never invent prices, coverage areas, pickup times, order status, payment status, or policy.",
            "Do not create orders, payments, payment links, subscriptions, or change account data.",
            "If the user asks for prices, availability, order-specific information, refunds, complaints, or anything requiring account access, say you will pass it to the team and do not guess.",
            "For a human request, complaint, refund, damaged/missing clothing, or payment dispute, escalate instead of answering.",
            "If unsure, say a team member needs to confirm.",
          ].join(" "),
          input: aiInput,
          max_output_tokens: 700,
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

      if (/pass (this|it) to (the )?team|team member needs to confirm|staff member/i.test(answer)) {
        const { error: handoffError } = await db.from("whatsapp_handoffs").upsert({
          inbound_message_id: item.id, from_phone: from,
          reason: "assistant_could_not_safely_resolve", message_text: body.slice(0, 2000), status: "open",
        }, { onConflict: "inbound_message_id", ignoreDuplicates: true });
        if (handoffError) throw new Error("handoff_create_failed");
      }
      const outboundProviderId = await sendWhatsApp(from, answer, waToken, phoneNumberId);
      const { error: outboundHistoryError } = await db.from("whatsapp_conversation_messages").insert({
        phone: from, direction: "outbound", body: answer.slice(0, 3500),
        provider_message_id: outboundProviderId ?? null, delivery_status: "sent",
      });
      if (outboundHistoryError) throw new Error("conversation_outbound_save_failed");
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