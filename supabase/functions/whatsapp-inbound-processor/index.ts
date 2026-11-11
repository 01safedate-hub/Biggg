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
async function getWhatsAppPaymentProvider(db: ReturnType<typeof createClient>): Promise<"paystack" | "flutterwave" | null> {
  const { data, error } = await db.rpc("active_payment_providers");
  if (error || !Array.isArray(data)) {
    console.error("whatsapp_payment_provider_lookup_failed", { code: error?.code ?? null });
    return null;
  }
  const enabled = data.filter((value): value is "paystack" | "flutterwave" => value === "paystack" || value === "flutterwave");
  return enabled.includes("paystack") ? "paystack" : enabled.includes("flutterwave") ? "flutterwave" : null;
}

async function createWhatsAppCheckout(
  provider: "paystack" | "flutterwave",
  intent: any,
  options: { callbackUrl: string; metadata: Record<string, unknown>; description: string },
): Promise<string> {
  const secret = Deno.env.get(provider === "paystack" ? "PAYSTACK_SECRET_KEY" : "FLUTTERWAVE_SECRET_KEY");
  if (!secret) throw new Error(provider + "_not_configured");
  if (provider === "paystack") {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify({ email: intent.email, amount: intent.amount_kobo, currency: "NGN", reference: intent.reference, callback_url: options.callbackUrl, metadata: options.metadata }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.status === true && payload.data?.authorization_url) return String(payload.data.authorization_url);
    console.error("whatsapp_paystack_checkout_failed", { status: response.status, reference: intent.reference });
    throw new Error("paystack_checkout_failed");
  }
  const response = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: intent.reference, amount: Number(intent.amount_kobo) / 100, currency: "NGN", redirect_url: options.callbackUrl,
      customer: { email: intent.email, name: intent.name ?? "LaundryPoint customer", phonenumber: intent.phone ?? undefined },
      customizations: { title: "LaundryPoint", description: options.description }, meta: options.metadata,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok && payload?.status === "success" && payload.data?.link) return String(payload.data.link);
  console.error("whatsapp_flutterwave_checkout_failed", { status: response.status, reference: intent.reference });
  throw new Error("flutterwave_checkout_failed");
}

function needsHuman(text: string) {
  return /\b(human|agent|secretary|staff|complain|complaint|refund|dispute|manager|speak to someone|talk to someone|wrong charge|overcharged|damaged|missing clothes|lost clothes)\b/i.test(text);
}
function isStop(text: string) { return /^\s*(stop|unsubscribe|opt\s*out)\s*$/i.test(text); }

async function sendWhatsApp(phone: string, text: string, token: string, phoneNumberId: string) {
  const graphVersion = Deno.env.get("WA_GRAPH_VERSION") ?? "v23.0";
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
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

// Persist both sides of a WhatsApp conversation for staff follow-up.
// Duplicate inbound webhook deliveries are harmless because the database has a unique
// index on inbound_message_id; duplicate-key errors are intentionally ignored.
async function recordConversationMessage(
  db: ReturnType<typeof createClient>,
  entry: { phone: string; direction: "inbound" | "outbound"; body: string; inboundMessageId?: string; providerMessageId?: string; deliveryStatus?: string },
) {
  let conversationId: string | null = null;
  if (entry.inboundMessageId) {
    const { data: existingMessage } = await db.from("whatsapp_conversation_messages")
      .select("conversation_id").eq("inbound_message_id", entry.inboundMessageId).maybeSingle();
    conversationId = existingMessage?.conversation_id ?? null;
  }
  if (!conversationId) {
    const { data, error: conversationError } = await db.rpc("whatsapp_active_support_conversation", { _phone: entry.phone });
    if (conversationError || !data) {
      console.error("whatsapp_support_conversation_resolve_failed", { code: conversationError?.code });
      return;
    }
    conversationId = data;
  }
  const row: Record<string, unknown> = {
    phone: entry.phone,
    conversation_id: conversationId,
    direction: entry.direction,
    body: entry.body.slice(0, 4000),
    delivery_status: entry.deliveryStatus ?? (entry.direction === "inbound" ? "received" : "sent"),
  };
  if (entry.inboundMessageId) row.inbound_message_id = entry.inboundMessageId;
  if (entry.providerMessageId) row.provider_message_id = entry.providerMessageId;
  const { error } = await db.from("whatsapp_conversation_messages").insert(row);
  if (error && error.code !== "23505") {
    // Conversation history is important, but logging failures must not trigger duplicate customer replies.
    console.error("whatsapp_conversation_log_failed", { direction: entry.direction, code: error.code, message: error.message });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const suppliedSecret = req.headers.get("x-worker-secret") ?? req.headers.get("x-whatsapp-worker-secret");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const waToken = Deno.env.get("WA_ACCESS_TOKEN") ?? Deno.env.get("WA_TOKEN");
  const phoneNumberId = Deno.env.get("WA_PHONE_NUMBER_ID");
  if (!supabaseUrl || !serviceKey) return json({ error: "database_not_configured" }, 503);
  if (!suppliedSecret) return json({ error: "unauthorized" }, 401);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: secretAllowed, error: secretError } = await db.rpc("verify_whatsapp_worker_secret", { _s: suppliedSecret });
  if (secretError || secretAllowed !== true) return json({ error: "unauthorized" }, 401);
  const { data: batch, error: claimError } = await db.rpc("whatsapp_claim_inbound_messages", { _limit: 10 });
  if (claimError) return json({ error: "queue_claim_failed" }, 500);

  // Read coverage live from the same table configured by Admin > Coverage zones.
  // Never hard-code locations: newly activated zones become available to the AI automatically.
  const { data: activeZones } = await db
    .from("zones")
    .select("id,parent_id,kind,name,note,villages")
    .eq("is_live", true)
    .order("kind")
    .order("name");
  // Fetch current active subscription plans and pay-per-item prices from Supabase every run.
  const { data: activePlans, error: plansError } = await db
    .from("plans")
    .select("name,slug,blurb,monthly_price_kobo,monthly_discount_pct,three_month_discount_pct,six_month_discount_pct,yearly_discount_pct,pieces_per_month,weekly_allowance,category_limits")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  const { data: activeItems, error: itemsError } = await db
    .from("items")
    .select("id,name,description,price_kobo")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  const { data: servicePriceRows, error: servicePricesError } = await db.rpc("item_service_prices");
  const { data: pricingSettings, error: pricingSettingsError } = await db
    .from("settings")
    .select("key,value")
    .in("key", ["iron_only","instant"]);
  const pricingSettingsByKey = new Map((pricingSettings ?? []).map((setting: any) => [setting.key, setting.value ?? {}]));
  const instantSettings: any = pricingSettingsByKey.get("instant") ?? {};
  const servicePricesByItem = new Map((servicePriceRows ?? []).map((row: any) => [row.item_id, row]));
  const moneyNaira = (kobo: number | string | null | undefined) => {
    const amount = kobo === null || kobo === undefined ? NaN : Number(kobo);
    return Number.isFinite(amount) ? `₦${(amount / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}` : "not configured";
  };
  const plansContext = plansError
    ? "Live plans could not be loaded. Do not quote plan details; offer staff follow-up."
    : (activePlans ?? []).map((plan: any) =>
      `- ${plan.name}: monthly ${moneyNaira(plan.monthly_price_kobo)}; monthly garment allowance ${plan.pieces_per_month ?? "not configured"}; per-pickup garment cap ${plan.weekly_allowance ?? "not configured"}; garments above the allowance are billed at the standard price of each item; 3-month discount ${plan.three_month_discount_pct ?? "not configured"}%; 6-month discount ${plan.six_month_discount_pct ?? "not configured"}%; annual discount ${plan.yearly_discount_pct ?? "not configured"}%; details: ${plan.blurb ?? "not provided"}; category limits: ${JSON.stringify(plan.category_limits ?? {})}`
    ).join("\\n") || "No active subscription plans are configured.";
  const itemPricesContext = itemsError || servicePricesError
    ? "Live item/service prices could not be loaded. Do not quote item prices; offer staff follow-up."
    : (activeItems ?? []).map((item: any) => {
      const prices: any = servicePricesByItem.get(item.id);
      if (!prices) return `- ${item.name}: current service prices unavailable; do not quote. ${item.description ?? ""}`;
      const ironPrice = prices.iron_only_kobo === null || prices.iron_only_kobo === undefined
        ? "iron only unavailable"
        : `iron only ${moneyNaira(prices.iron_only_kobo)}`;
      return `- ${item.name}: dry clean ${moneyNaira(prices.dry_clean_kobo)}; ${ironPrice}. ${item.description ?? ""}`;
    }).join("\\n") || "No active item prices are configured.";
  const instantPricingContext = pricingSettingsError
    ? "Instant-service pricing could not be loaded. Do not quote instant fees or promise instant availability; offer staff follow-up."
    : instantSettings.enabled === true
      ? `Instant service is enabled. Extra fee per item: dry clean ${moneyNaira(instantSettings.fee_per_item_kobo)}; iron only ${moneyNaira(instantSettings.fee_per_item_iron_kobo)}. Target turnaround ${instantSettings.target_hours ?? "not configured"} hours; loads of ${instantSettings.large_load_items ?? "not configured"} items or more may require ${instantSettings.large_load_hours ?? "not configured"} hours.`
      : "Instant service is currently disabled. Do not offer or quote instant service.";
  const zoneMap = new Map((activeZones ?? []).map((zone: any) => [zone.id, zone]));
  const zoneLabel = (zone: any) => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let current = zone;
    while (current && !seen.has(current.id) && parts.length < 5) {
      seen.add(current.id);
      parts.unshift(String(current.name));
      current = current.parent_id ? zoneMap.get(current.parent_id) : null;
    }
    return parts.join(", ");
  };
  const activeCoverageZones = (activeZones ?? []).filter((zone: any) => zone.kind === "area");
  const activeCoverageContext = activeCoverageZones
    .map((zone: any) => {
      const details = [
        zone.note ? String(zone.note).trim() : "",
        Array.isArray(zone.villages) && zone.villages.length ? `Villages: ${zone.villages.join(", ")}` : "",
      ].filter(Boolean).join("; ");
      return `- ${zoneLabel(zone)}${details ? `: ${details}` : ""}`;
    })
    .join("\n") || "No service areas are currently marked active.";
  const compactCoverageContext = activeCoverageContext.length > 9000
    ? activeCoverageContext.slice(0, 9000)
    : activeCoverageContext;
  let processed = 0, handedOff = 0, skipped = 0, failed = 0;

  for (const item of (batch ?? [])) {
    try {
      let body = (item.message_text ?? "").trim();
      const from = String(item.from_phone ?? "");
      const normalizedPhone = normPhone(from);
      const receivedAt = item.provider_timestamp ? new Date(item.provider_timestamp) : new Date();
      let resumeVerificationIntent = false;
      const sendFixedReply = async (message: string) => {
        const providerMessageId = await sendWhatsApp(from, message, waToken!, phoneNumberId!);
        await recordConversationMessage(db, { phone: from, direction: "outbound", body: message, providerMessageId, deliveryStatus: "sent" });
        await db.from("whatsapp_inbound_messages").update({
          status: "processed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        processed++;
      };
      if (!from || !["text", "location"].includes(String(item.message_type)) || (item.message_type === "text" && !body)) {
        await db.from("whatsapp_inbound_messages").update({
          status: "ignored", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          last_error: item.message_type === "text" ? "empty_text_message" : "unsupported_message_type",
        }).eq("id", item.id);
        skipped++;
        continue;
      }

      // Record the customer's message before processing so staff can follow up even if AI fails.
      await recordConversationMessage(db, {
        phone: from,
        direction: "inbound",
        body,
        inboundMessageId: String(item.id),
        deliveryStatus: "received",
      });
      const { data: conversationId, error: conversationIdError } = await db.rpc("whatsapp_active_support_conversation", { _phone: from });
      if (conversationIdError || !conversationId) throw new Error("support_conversation_lookup_failed");

      // Do not infer WhatsApp consent from an inbound message. Consent is requested
      // only after verified account access and saved only after an explicit YES.
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

      // Only an explicit STOP/opt-out blocks replies.
      const optOutResult = await db.rpc("whatsapp_is_opted_out_by_phone", { _phone: from });
      if (optOutResult.error) throw new Error("opt_out_check_failed");
      const optedOut = optOutResult.data === true;
      if (optedOut) {
        await db.from("whatsapp_inbound_messages").update({
          status: "ignored", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          last_error: "customer_opted_out",
        }).eq("id", item.id);
        skipped++;
        continue;
      }



      // Respect staff ownership before running any automated booking or AI workflow.
      // An expired handoff resumes AI using the persisted conversation history below.
      const { data: supportState, error: supportStateError } = await db
        .from("whatsapp_support_conversations")
        .select("id,mode,response_due_at")
        .eq("id", conversationId)
        .maybeSingle();
      if (supportStateError) throw new Error("support_mode_lookup_failed");
      if (supportState?.mode === "human") {
        const expired = supportState.response_due_at
          ? Date.parse(String(supportState.response_due_at)) <= Date.now()
          : false;
        if (expired) {
          const { error: resumeError } = await db.from("whatsapp_support_conversations")
            .update({ mode: "ai", assigned_to: null, handoff_started_at: null, response_due_at: null, updated_at: new Date().toISOString() })
            .eq("id", conversationId).eq("mode", "human");
          if (resumeError) throw new Error("support_timeout_resume_failed");
        } else {
          await db .from("whatsapp_support_conversations")
            .update({ unread_at: receivedAt.toISOString(), updated_at: new Date().toISOString() })
            .eq("id", conversationId);
          await db.from("whatsapp_inbound_messages").update({
            status: "processed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq("id", item.id);
          processed++;
          continue;
        }
      }

      async function getVerifiedSession() {
        const { data, error } = await db.from("whatsapp_account_verifications")
          .select("customer_id,verified_until")
          .eq("phone", normalizedPhone)
          .gt("verified_until", new Date().toISOString())
          .order("verified_until", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error("verification_status_check_failed");
        return data;
      }
      async function getSlots(customerId: string, date: string) {
        const { data, error } = await db.rpc("whatsapp_available_slots_for_customer", { _customer: customerId, _date: date });
        if (error) throw new Error(error.message || "slot_lookup_failed");
        return Array.isArray(data) ? data : [];
      }
      async function getDates(customerId: string) {
        const { data, error } = await db.from("settings").select("key,value").in("key", ["slots","business"]);
        if (error) throw new Error("scheduling_settings_read_failed");
        const cfg: Record<string, any> = Object.fromEntries((data ?? []).map((x: any) => [x.key,x.value]));
        if (cfg.slots?.enabled !== true) return [];
        const tz = String(cfg.business?.timezone || "Africa/Lagos");
        const maxDays = Math.max(1,Math.min(14,Number(cfg.slots?.max_days_ahead || 7)));
        const local = new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
        const [y,m,d] = local.split("-").map(Number);
        const midnight = Date.UTC(y,m-1,d);
        const dates: any[] = [];
        for(let n=0;n<=maxDays;n++){
          const date = new Date(midnight+n*86400000).toISOString().slice(0,10);
          const slots = await getSlots(customerId,date);
          if(slots.length){
            const label = n===0 ? "Today" : n===1 ? "Tomorrow" : new Intl.DateTimeFormat("en-GB",{timeZone:tz,weekday:"short",day:"numeric",month:"short"}).format(new Date(date+"T12:00:00Z"));
            dates.push({date,label});
          }
        }
        return dates;
      }
      async function getPending(prefix: string) {
        const { data, error } = await db.from("whatsapp_conversation_messages").select("body")
          .eq("conversation_id",conversationId).eq("direction","outbound").eq("delivery_status","internal")
          .like("body",prefix+"%").order("created_at",{ascending:false}).limit(20);
        if(error) throw new Error("pickup_state_lookup_failed");
        for (const row of (data ?? [])) {
          try {
            const state = JSON.parse(String(row.body ?? "").slice(prefix.length));
            if (state && state.completed !== true) return state;
          } catch { console.error("whatsapp_pending_state_invalid", { prefix }); }
        }
        return null;
      }
      async function startDateSelection(customerId: string, lat: number, lng: number, address: string, mode: string = "auto") {
        const dates = await getDates(customerId);
        if(!dates.length){ await sendFixedReply("Our pickup schedule currently has no available dates. Please contact our team for assistance."); return; }
        await db.from("whatsapp_conversation_messages").insert({
          phone:from,direction:"outbound",
          body:"PICKUP_DATE_PENDING:"+JSON.stringify({customer_id:customerId,lat,lng,address,dates,mode}),
          delivery_status:"internal"
        });
        await sendFixedReply("Your pickup location is confirmed. Choose a pickup date:\n"+dates.map((x:any,i:number)=>`${i+1}. ${x.label}`).join("\n")+"\n\nReply with the number of your preferred date.");
      }

      // Location pins are handled before ready-order fulfilment and stale wizard states.
      // Coverage checks are public: use the live zones geofences, not the AI's area-name list.
      if (item.message_type === "location") {
        let loc: any;
        try { loc = JSON.parse(String(item.message_text ?? "")); } catch { loc = null; }
        const lat = Number(loc?.latitude ?? loc?.lat);
        const lng = Number(loc?.longitude ?? loc?.lng);
        const address = String(loc?.address ?? "").trim();
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          await sendFixedReply("I couldn't read that location pin. Please try again.\n\nHow to share your location on WhatsApp:\n\n1. Android: tap the paperclip 📎 beside the message box.\n2. iPhone: tap the + beside the message box.\n3. Choose Location.\n4. Tap Send your current location.\n\nChoose Send your current location, not Share live location. LaundryPoint only needs a one-time pin, not live tracking. If the pin is not exactly where you are, move the map to the correct spot and send that pin.");
          continue;
        }

        const pendingPickupRequest = await getPending("PICKUP_REQUEST_PENDING:");
        const isPendingPickupRequest = Boolean(pendingPickupRequest);
        const pickupMode = pendingPickupRequest?.mode === "one_time" ? "one_time" : "auto";
        const { data: quote, error: quoteError } = await db.rpc("quote_pickup", { _lat: lat, _lng: lng });
        if (quoteError) throw new Error("coverage_quote_failed");

        // Read the customer's preceding message to distinguish a coverage question from an active booking request.
        const { data: recentMessages, error: recentMessagesError } = await db.from("whatsapp_conversation_messages")
          .select("direction,body,created_at")
          .eq("conversation_id", conversationId)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(5);
        if (recentMessagesError) throw new Error("location_intent_lookup_failed");
        const previousText = (recentMessages ?? [])
          .map((m: any) => String(m.body ?? ""))
          .find((text: string) => text && !text.trim().startsWith("{")) ?? "";
        const asksCoverage = /\b(coverage|covered|serve|service area|my area|check if|available in my area)\b/i.test(previousText);
        const asksPickup = isPendingPickupRequest || (/\b(book|booking|arrang|request|schedule|create|need|want)\b/i.test(previousText)
          && /\b(pick ?up|collection)\b/i.test(previousText));

        if (!quote?.served) {
          await sendFixedReply("Thanks for sharing your location. This pin is outside our currently configured pickup coverage zones. If you believe this is incorrect, please contact our team so they can review the area.");
          continue;
        }

        const zoneName = String(quote.zone_name || "our service area");
        if (!asksPickup || (asksCoverage && !isPendingPickupRequest)) {
          await sendFixedReply("Yes! Your location pin falls within our " + zoneName + " coverage area. Would you like to arrange a pickup?");
          continue;
        }

        const session = await getVerifiedSession();
        if (!session?.customer_id) {
          await sendFixedReply("Your location is within our " + zoneName + " coverage area. To arrange a pickup, please verify your LaundryPoint account first by sending your registered email address.");
          continue;
        }
        await db.from("whatsapp_conversation_messages").insert({
          phone: from, direction: "outbound",
          body: "PICKUP_REQUEST_PENDING:" + JSON.stringify({ ...pendingPickupRequest, completed: true, completed_at: new Date().toISOString() }),
          delivery_status: "internal"
        });
        if (!address || address.length < 5) {
          await db.from("whatsapp_conversation_messages").insert({
            phone: from, direction: "outbound",
            body: "LOCATION_PENDING:" + JSON.stringify({ customer_id: session.customer_id, lat, lng, zone_name: zoneName, mode: pickupMode }),
            delivery_status: "internal"
          });
          await sendFixedReply("Your location is within our " + zoneName + " coverage area. Please send your house number, street and a nearby landmark so we can arrange the pickup.");
          continue;
        }
        await startDateSelection(String(session.customer_id), lat, lng, address, pickupMode);
        continue;
      }

      let activeSession = await getVerifiedSession();
      const asksLocationHelp = /\bhow\s+(?:can|do)\s+i\s+share\s+(?:my\s+)?(?:current\s+)?location\b|\bhow\s+to\s+share\s+(?:my\s+)?location\b|\bhow\s+do\s+i\s+send\s+(?:my\s+)?location\b/i.test(body);
      if (asksLocationHelp) {
        const [pickupHelpState, locationHelpState, dateHelpState, slotHelpState] = await Promise.all([
          getPending("PICKUP_REQUEST_PENDING:"), getPending("LOCATION_PENDING:"),
          getPending("PICKUP_DATE_PENDING:"), getPending("PICKUP_SLOT_PENDING:")
        ]);
        if (pickupHelpState || locationHelpState || dateHelpState || slotHelpState) {
          await sendFixedReply("Of course — here's how to send a one-time location pin in WhatsApp:\\n\\n1. Android: tap the paperclip 📎 beside the message box.\\n2. iPhone: tap the + beside the message box.\\n3. Choose Location.\\n4. Tap Send your current location.\\n\\nPlease choose Send your current location, not Share live location. We only need a single pin, not live tracking. Then return here; I'll continue your pickup request from where we paused.");
          continue;
        }
      }
      const newPickupIntent = /\b(?:(?:i\s+(?:want|would like|need)\s+to)\s+)?(?:book|create|request(?:\s+for)?|schedule|arrange)\s+(?:(?:a|my|the)\s+)?(?:pickup|pick\s*up|collection)\b|\bI need (?:a )?(?:pickup|collection)\b/i.test(body)
        || /^(?:pick\s*up|pickup)$/i.test(body.trim());

      // Dedicated, deterministic fulfilment flow for ready orders. This is deliberately
      // additive: existing pickup, reschedule, verification and general AI flows remain intact.
      if (activeSession?.customer_id) {
        const getFulfilmentPending = async () => {
          const {data,error}=await db.from("whatsapp_conversation_messages").select("body")
            .eq("conversation_id",conversationId).eq("direction","outbound").eq("delivery_status","internal")
            .like("body","ORDER_READY_FULFILLMENT_PENDING:%").order("created_at",{ascending:false}).limit(1);
          if(error) throw new Error("fulfilment_state_lookup_failed");
          if(!data?.length) return null;
          try {
            const state=JSON.parse(String(data[0].body).slice("ORDER_READY_FULFILLMENT_PENDING:".length));
            return state;
          } catch { return null; }
        };
        let fulfilment = await getFulfilmentPending();
        // A new pickup booking is not the same as collecting an already-finished order.
        // Give explicit new-pickup requests priority over the ready-order fulfilment flow.
        if (newPickupIntent) {
          // Subscription entitlement is checked before collecting location or offering dates.
          const { data: activeSub, error: activeSubError } = await db.from("subscriptions")
            .select("id,plan_id,current_period_start,current_period_end")
            .eq("customer_id", activeSession.customer_id).eq("status", "active")
            .lte("current_period_start", new Date().toISOString()).gt("current_period_end", new Date().toISOString())
            .order("current_period_end", { ascending: false }).limit(1).maybeSingle();
          if (activeSubError) throw new Error("pickup_subscription_lookup_failed");
          if (activeSub) {
            const { data: plan, error: planError } = await db.from("plans").select("name")
              .eq("id", activeSub.plan_id).maybeSingle();
            if (planError) throw new Error("pickup_plan_lookup_failed");
            const { data: pickups, error: pickupsError } = await db.from("subscription_pickups")
              .select("scheduled_for,status").eq("subscription_id", activeSub.id)
              .gte("scheduled_for", activeSub.current_period_start).lt("scheduled_for", activeSub.current_period_end)
              .not("status", "in", "(missed,skipped)").order("scheduled_for", { ascending: false });
            if (pickupsError) throw new Error("subscription_pickup_usage_lookup_failed");
            const used = (pickups ?? []).length;
            const last = pickups?.[0]?.scheduled_for ? new Date(pickups[0].scheduled_for) : null;
            const nextIncluded = last ? new Date(last.getTime() + 14 * 86400000) : null;
            const mustUseOneTime = used >= 2 || Boolean(nextIncluded && nextIncluded.getTime() > Date.now());
            if (mustUseOneTime) {
              const explanation = used >= 2
                ? "You've already used both pickups included in your " + String(plan?.name || "subscription") + " plan this monthly cycle."
                : "Your previous included pickup is scheduled for " + new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium" }).format(last!) + ". The next included pickup can be scheduled from " + new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium" }).format(nextIncluded!) + ".";
              await db.from("whatsapp_conversation_messages").insert({
                phone: from, direction: "outbound",
                body: "SUBSCRIPTION_PICKUP_CHOICE_PENDING:" + JSON.stringify({ customer_id: activeSession.customer_id, subscription_id: activeSub.id, wait_until: nextIncluded?.toISOString() ?? null, created_at: new Date().toISOString() }),
                delivery_status: "internal"
              });
              await sendFixedReply(explanation + " You can arrange another pickup now as a one-time paid service, separate from your subscription. Reply ONE-TIME to continue, or WAIT for your next included pickup.");
              continue;
            }
          }
          if (fulfilment && fulfilment.customer_id === activeSession.customer_id && fulfilment.completed !== true) {
            await db.from("whatsapp_conversation_messages").insert({
              phone: from, direction: "outbound",
              body: "ORDER_READY_FULFILLMENT_PENDING:" + JSON.stringify({ ...fulfilment, completed: true, closed_reason: "customer_started_new_pickup", completed_at: new Date().toISOString() }),
              delivery_status: "internal"
            });
          }
          const pendingPickup = await getPending("PICKUP_REQUEST_PENDING:");
          if (!pendingPickup || pendingPickup.customer_id !== activeSession.customer_id) {
            await db.from("whatsapp_conversation_messages").insert({
              phone: from, direction: "outbound",
              body: "PICKUP_REQUEST_PENDING:" + JSON.stringify({ customer_id: activeSession.customer_id, created_at: new Date().toISOString() }),
              delivery_status: "internal"
            });
          }
          await sendFixedReply("Absolutely — I can help arrange a pickup. Please share your current location pin here so I can check that your address is within our service coverage.\n\nHow to share it on WhatsApp:\n1. Android: tap the paperclip 📎 beside the message box.\n2. iPhone: tap the + beside the message box.\n3. Choose Location, then tap Send your current location.\n\nPlease choose Send your current location, not Share live location. We only need a one-time pin.");
          continue;
        }
        if (activeSession?.customer_id) {
        const { data: pickupChoiceRow, error: pickupChoiceError } = await db.from("whatsapp_conversation_messages")
          .select("body").eq("conversation_id", conversationId).eq("direction", "outbound").eq("delivery_status", "internal")
          .like("body", "SUBSCRIPTION_PICKUP_CHOICE_PENDING:%").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (pickupChoiceError) throw new Error("subscription_pickup_choice_lookup_failed");
        if (pickupChoiceRow?.body) {
          let choice: any = null;
          try { choice = JSON.parse(String(pickupChoiceRow.body).slice("SUBSCRIPTION_PICKUP_CHOICE_PENDING:".length)); } catch { choice = null; }
          if (choice?.customer_id === activeSession.customer_id && choice?.completed !== true) {
            if (/^(one[ -]?time|paid pickup|yes|continue)$/i.test(body.trim())) {
              await db.from("whatsapp_conversation_messages").insert({ phone: from, direction: "outbound", body: "SUBSCRIPTION_PICKUP_CHOICE_PENDING:" + JSON.stringify({ ...choice, completed: true, choice: "one_time", completed_at: new Date().toISOString() }), delivery_status: "internal" });
              await db.from("whatsapp_conversation_messages").insert({ phone: from, direction: "outbound", body: "PICKUP_REQUEST_PENDING:" + JSON.stringify({ customer_id: activeSession.customer_id, mode: "one_time", created_at: new Date().toISOString() }), delivery_status: "internal" });
              await sendFixedReply("Certainly. This will be a one-time paid pickup and will not use your subscription allowance. Please share your current WhatsApp location pin so I can check coverage.");
              continue;
            }
            if (/^(wait|later|next cycle|no)$/i.test(body.trim())) {
              await db.from("whatsapp_conversation_messages").insert({ phone: from, direction: "outbound", body: "SUBSCRIPTION_PICKUP_CHOICE_PENDING:" + JSON.stringify({ ...choice, completed: true, choice: "wait", completed_at: new Date().toISOString() }), delivery_status: "internal" });
              await sendFixedReply(choice.wait_until
                ? "No problem. Your next included pickup can be scheduled from " + new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium" }).format(new Date(choice.wait_until)) + "."
                : "No problem. You can request your next included pickup in your next monthly cycle.");
              continue;
            }
            await sendFixedReply("Would you like to continue with a one-time paid pickup, or wait for your next included pickup? Reply ONE-TIME or WAIT.");
            continue;
          }
        }
      }

            const fulfilmentIntent = /\b(collect|collection|deliver|delivery|bring it|send it|ready order|finished order|receive my (?:clothes|order))\b/i.test(body)
          || /\b(?:order\s*#?\s*|#)\d{1,10}\b/i.test(body);
        if (!fulfilment && fulfilmentIntent) {
          const requestedReadyOrder = body.match(/\b(?:order\s*#?\s*|#)(\d{1,10})\b/i);
          const { data: readyOrders, error: readyLookupError } = await db.from("orders")
            .select("id,order_no,source,status,pickup_address,pickup_lat,pickup_lng,fulfillment_choice,return_prepaid_kobo")
            .eq("customer_id", activeSession.customer_id)
            .in("status", ["ready","awaiting_delivery_fare"])
            .order("updated_at", { ascending: false }).limit(10);
          if (readyLookupError) throw new Error("ready_order_lookup_failed");
          let candidates = readyOrders ?? [];
          if (requestedReadyOrder) candidates = candidates.filter((o:any) => String(o.order_no) === requestedReadyOrder[1]);
          if (candidates.length === 1) {
            const o:any = candidates[0];
            fulfilment = {customer_id:activeSession.customer_id,order_id:o.id,order_no:o.order_no,stage:"choice",saved_address:o.pickup_address,saved_lat:o.pickup_lat,saved_lng:o.pickup_lng,prepaid_kobo:Number(o.return_prepaid_kobo??0)};
            await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"ORDER_READY_FULFILLMENT_PENDING:"+JSON.stringify(fulfilment),delivery_status:"internal"});
          } else if (candidates.length > 1 && requestedReadyOrder) {
            await sendFixedReply("I couldn't match that order number to a ready order on your account. Please check the number.");
            continue;
          } else if (candidates.length > 1) {
            await sendFixedReply("You have more than one order ready. Please reply with the order number you want to arrange, for example: Order #108.");
            continue;
          }
        }
        if (fulfilment && fulfilment.customer_id === activeSession.customer_id && fulfilment.completed !== true) {
          const choiceText = body.trim().toLowerCase();
          const wantsCollect = /^(1|collect|collection|i'?ll collect|i will collect|come and pick ?up|pick ?up myself|i will come)$/i.test(choiceText);
          const wantsDeliver = /^(2|deliver|delivery|bring it|send it|deliver to me)$/i.test(choiceText);
          const wantsYes = /^(yes|y|yeah|yep|correct|use it|use saved address|proceed|pay|1)$/i.test(choiceText);
          const wantsNo = /^(no|n|nope|change|new address|different address|2)$/i.test(choiceText);
          const saveState = async (next:any) => {
            await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"ORDER_READY_FULFILLMENT_PENDING:"+JSON.stringify(next),delivery_status:"internal"});
          };
          const closeState = async () => saveState({...fulfilment,completed:true,completed_at:new Date().toISOString()});
          const naira = (kobo:number) => "₦"+(kobo/100).toLocaleString("en-NG",{maximumFractionDigits:2});
          const quoteAndAsk = async (lat:number,lng:number,address:string) => {
            const {data:quote,error:quoteError}=await db.rpc("whatsapp_set_return_delivery_for_customer",{
              _customer:activeSession.customer_id,_order:fulfilment.order_id,_lat:lat,_lng:lng,_address:address
            });
            if(quoteError) {
              const reason=String(quoteError.message||"");
              if(/delivery_location_not_served/i.test(reason)){await sendFixedReply("Sorry, delivery is not currently available at that location. You can still collect your clothes from the hub for free, or contact our team for help.");return;}
              throw new Error("return_delivery_quote_failed");
            }
            const prepaid=Number(quote.prepaid_kobo??0);
            if(quote.covered===true||Number(quote.fare_kobo)<=0) {
              await closeState();
              await sendFixedReply("All set! Your return delivery to "+quote.address+" was already paid when you booked Order #"+fulfilment.order_no+", so there is nothing more to pay.\n\nWe'll assign a rider and message you when they set off. Please do not pay cash to anyone.");
              return;
            }
            const next={...fulfilment,stage:"confirm_payment",delivery_address:quote.address,delivery_lat:lat,delivery_lng:lng,fare_kobo:Number(quote.fare_kobo),prepaid_kobo:prepaid};
            await saveState(next);
            if(prepaid>0) {
              await sendFixedReply("Delivery address: "+quote.address+"\nReturn delivery paid at booking: "+naira(prepaid)+"\nExtra for this further address: "+naira(Number(quote.fare_kobo))+"\n\nReply YES to pay only the extra, NO to choose a different address, or COLLECT to pick up from the hub.");
            } else {
              await sendFixedReply("Delivery address: "+quote.address+"\nDelivery fee: "+naira(Number(quote.fare_kobo))+"\n\nWould you like to proceed with secure payment? Reply YES to pay, NO to change the address, or COLLECT to pick up free.");
            }
          };
          if(wantsCollect && ["choice","address_choice","new_location","new_address_text","confirm_payment"].includes(String(fulfilment.stage))) {
            const {data:result,error}=await db.rpc("whatsapp_choose_collection_for_customer",{_customer:activeSession.customer_id,_order:fulfilment.order_id});
            if(error) throw new Error("collection_selection_failed");
            await closeState();
            const hubDetails = result.hub_note ? String(result.hub_note) : "The designated collection area is "+String(result.hub_name)+", based on your order coverage zone. The exact street address is not yet listed in our hub directory, so please contact LaundryPoint support before travelling.";
            const lineBreak = String.fromCharCode(10);
            await sendFixedReply("Confirmed! Order #"+result.order_no+" is set for hub collection. Collection is FREE — no delivery fee is payable."+(Number(fulfilment.prepaid_kobo??0)>0?" The return fare paid at booking is not refunded.":"")+lineBreak+lineBreak+"Your designated LaundryPoint collection hub/coverage area: "+String(result.hub_name)+"."+lineBreak+hubDetails+lineBreak+lineBreak+"Please tell the hub staff your order number.");
            continue;
          }
          if(fulfilment.stage==="choice") {
            if(wantsCollect) {
              const {data:result,error}=await db.rpc("whatsapp_choose_collection_for_customer",{_customer:activeSession.customer_id,_order:fulfilment.order_id});
              if(error) throw new Error("collection_selection_failed");
              await closeState();
              const hubDetails = result.hub_note ? String(result.hub_note) : "The designated collection area is "+String(result.hub_name)+", based on your order coverage zone. The exact street address is not yet listed in our hub directory, so please contact LaundryPoint support before travelling.";
            const lineBreak = String.fromCharCode(10);
            await sendFixedReply("Confirmed! Order #"+result.order_no+" is set for hub collection. Collection is FREE — no delivery fee is payable."+(Number(fulfilment.prepaid_kobo??0)>0?" The return fare paid at booking is not refunded.":"")+lineBreak+lineBreak+"Your designated LaundryPoint collection hub/coverage area: "+String(result.hub_name)+"."+lineBreak+hubDetails+lineBreak+lineBreak+"Please tell the hub staff your order number.");
              continue;
            }
            if(wantsDeliver) {
              if(fulfilment.saved_address && Number.isFinite(Number(fulfilment.saved_lat)) && Number.isFinite(Number(fulfilment.saved_lng))) {
                await saveState({...fulfilment,stage:"address_choice"});
                await sendFixedReply("Your saved pickup address is: "+fulfilment.saved_address+"\n\nShould we deliver your clothes there? Reply YES to use it, or NO to share a new delivery location.");
              } else {
                await saveState({...fulfilment,stage:"new_location"});
                await sendFixedReply("Please share your WhatsApp location pin for the delivery address.\n\nHow to share your location on WhatsApp:\n\n1. Android: tap the paperclip 📎 beside the message box.\n2. iPhone: tap the + beside the message box.\n3. Choose Location.\n4. Tap Send your current location.\n\nChoose Send your current location, not Share live location. LaundryPoint only needs a one-time pin, not live tracking. If the pin is not exactly where you are, move the map to the correct spot and send that pin.\n\nAfter that, send your house number, street and a nearby landmark.");
              }
              continue;
            }
            await sendFixedReply(Number(fulfilment.prepaid_kobo??0)>0
              ? "Please choose how to receive Order #"+fulfilment.order_no+":\n1. Collect from the hub (the return fare you prepaid is not refunded)\n2. Deliver to me — already paid when you booked.\nReply 1 or 2."
              : "Please choose how to receive Order #"+fulfilment.order_no+":\n1. Collect from the hub — FREE\n2. Deliver to an address — delivery fee applies.\nReply 1 or 2.");
            continue;
          }
          if(fulfilment.stage==="address_choice") {
            if(wantsYes) {
              await quoteAndAsk(Number(fulfilment.saved_lat),Number(fulfilment.saved_lng),String(fulfilment.saved_address));
              continue;
            }
            if(wantsNo) {
              await saveState({...fulfilment,stage:"new_location",new_lat:null,new_lng:null});
              await sendFixedReply("No problem. Please share your new WhatsApp location pin.\n\nHow to share your location on WhatsApp:\n\n1. Android: tap the paperclip 📎 beside the message box.\n2. iPhone: tap the + beside the message box.\n3. Choose Location.\n4. Tap Send your current location.\n\nChoose Send your current location, not Share live location. LaundryPoint only needs a one-time pin, not live tracking. If the pin is not exactly where you are, move the map to the correct spot and send that pin.\n\nThen send your house number, street and a nearby landmark.");
              continue;
            }
            await sendFixedReply("Use your saved address? Reply YES to use it or NO to share a new delivery location. You can also reply COLLECT for free hub collection.");
            continue;
          }
          if(fulfilment.stage==="new_location") {
            if(item.message_type!=="location") {
              await sendFixedReply("Please share your location pin.\n\nHow to share your location on WhatsApp:\n\n1. Android: tap the paperclip 📎 beside the message box.\n2. iPhone: tap the + beside the message box.\n3. Choose Location.\n4. Tap Send your current location.\n\nChoose Send your current location, not Share live location. LaundryPoint only needs a one-time pin, not live tracking. If the pin is not exactly where you are, move the map to the correct spot and send that pin.\n\nThen send your house number, street and a nearby landmark.");
              continue;
            }
            let loc:any; try{loc=JSON.parse(String(item.message_text??""));}catch{loc=null;}
            const lat=Number(loc?.latitude??loc?.lat),lng=Number(loc?.longitude??loc?.lng);
            if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180) {
              await sendFixedReply("I couldn't read that location pin. Please try again: tap the + (iPhone) or paperclip (Android) beside the WhatsApp message box, choose Location, then tap Send your current location. You can also choose a place on the map and send that pin.");
              continue;
            }
            await saveState({...fulfilment,stage:"new_address_text",new_lat:lat,new_lng:lng});
            await sendFixedReply("Location received. Now type your house number, street and a nearby landmark so the rider can find you.");
            continue;
          }
          if(fulfilment.stage==="new_address_text") {
            if(item.message_type==="location" || body.trim().length<5 || body.trim().length>300) {
              await sendFixedReply("Please type the full delivery address, including house number, street and a nearby landmark.");
              continue;
            }
            await quoteAndAsk(Number(fulfilment.new_lat),Number(fulfilment.new_lng),body.trim());
            continue;
          }
          if(fulfilment.stage==="confirm_payment") {
            if(wantsYes) {
              const provider = await getWhatsAppPaymentProvider(db);
              if (!provider) { await sendFixedReply("Online payments are currently unavailable. Your delivery choice is saved, but no payment has been collected. Please contact our team or choose free hub collection."); continue; }
              const {data:intent,error:intentError}=await db.rpc("whatsapp_create_return_delivery_payment_intent",{
                _customer:activeSession.customer_id,_order:fulfilment.order_id,_provider:provider
              });
              if(intentError||!intent?.reference||!intent?.amount_kobo||!intent?.email) {
                console.error("whatsapp_return_delivery_payment_intent_failed",{order:fulfilment.order_no,error:intentError?.message});
                await sendFixedReply("I couldn't prepare secure payment for this delivery. No payment has been collected. Please try again or choose free hub collection.");
                continue;
              }
              let checkoutUrl="";
              try {
                checkoutUrl = await createWhatsAppCheckout(provider, intent, {
                  callbackUrl: "https://laundrypoint.app/orders/" + String(fulfilment.order_id) + "?returning=1",
                  metadata: { order_id: fulfilment.order_id, purpose: "delivery_fare", source: "whatsapp" },
                  description: "Delivery fee for order #" + String(fulfilment.order_no),
                });
              } catch(error) { console.error("whatsapp_return_delivery_checkout_error", String(error).slice(0,250)); }
              if(!checkoutUrl) { await sendFixedReply("I couldn't generate the secure payment link. No payment has been collected. Please try again shortly or contact our team."); continue; }
              await closeState();
              await sendFixedReply("Here is your secure " + (provider === "flutterwave" ? "Flutterwave" : "Paystack") + " payment link for Order #"+fulfilment.order_no+":\n"+checkoutUrl+"\n\nDelivery will be arranged after " + (provider === "flutterwave" ? "Flutterwave" : "Paystack") + " confirms your payment. Please do not pay cash to an agent.");
              continue;
            }
            if(wantsNo) {
              await saveState({...fulfilment,stage:"new_location",new_lat:null,new_lng:null});
              await sendFixedReply("Please share the new delivery location pin.\n\nHow to share your location on WhatsApp:\n\n1. Android: tap the paperclip 📎 beside the message box.\n2. iPhone: tap the + beside the message box.\n3. Choose Location.\n4. Tap Send your current location.\n\nChoose Send your current location, not Share live location. LaundryPoint only needs a one-time pin, not live tracking. If the pin is not exactly where you are, move the map to the correct spot and send that pin.\n\nThen type the full address.");
              continue;
            }
            await sendFixedReply((Number(fulfilment.prepaid_kobo??0)>0?"The extra to pay for this address is ":"The delivery fee is ")+naira(Number(fulfilment.fare_kobo))+". Reply YES to receive a secure payment link, NO to change the address, or COLLECT for free hub collection.");
            continue;
          }
        }
      }
      if (activeSession?.customer_id && item.message_type==="location") {
        // Leave unrelated location-sharing requests to the existing pickup workflow below.
      } else if (!activeSession?.customer_id && (/\b(collect|collection|deliver|delivery|ready order)\b/i.test(body) || /\b(?:order\s*#?\s*|#)\d{1,10}\b/i.test(body))) {
        await sendFixedReply("To protect your order details, please verify your LaundryPoint account first by sending the email address registered to your account.");
        continue;
      }
      // Intent-first customer order handling must run before stale pickup wizard prompts.
      const wantsStatus = /\b(status|track|tracking|progress|where is|update on|update about)\b/i.test(body)
        && /\b(order|pickup|booking|collection|it|my)\b/i.test(body);
      const wantsReschedule = /\b(change|reschedule|postpone|move|update|shift)\b/i.test(body)
        && /\b(pickup|collection|date|time|schedule|order)\b/i.test(body);
      const requestedOrderMatch = body.match(/\b(?:order\s*#?\s*|#)(\d{1,10})\b/i);
      if (!activeSession?.customer_id && (wantsStatus || wantsReschedule)) {
        await sendFixedReply("I can help with that order request, but your WhatsApp verification has expired. Please send the email address registered to your LaundryPoint account to verify again.");
        continue;
      }
      if (activeSession?.customer_id && (wantsStatus || wantsReschedule)) {
        const { data: customerOrders, error: orderLookupError } = await db.from("orders")
          .select("id,order_no,source,status,scheduled_for,pickup_agent_id")
          .eq("customer_id", activeSession.customer_id)
          .order("created_at", { ascending: false }).limit(20);
        if (orderLookupError) throw new Error("customer_orders_lookup_failed");
        let matchedOrders = customerOrders ?? [];
        if (requestedOrderMatch) matchedOrders = matchedOrders.filter((o:any)=>String(o.order_no)===requestedOrderMatch[1]);
        if (!matchedOrders.length) {
          await sendFixedReply(requestedOrderMatch
            ? "I couldn't find that active order on your account. Please check the order number, or contact our team."
            : "I couldn't find an active pickup order on your account.");
          continue;
        }
        if (matchedOrders.length > 1 && !requestedOrderMatch) {
          await db.from("whatsapp_conversation_messages").insert({
            phone:from,direction:"outbound",
            body:"ORDER_ACTION_PENDING:"+JSON.stringify({customer_id:activeSession.customer_id,mode:wantsReschedule?"reschedule":"status",orders:matchedOrders.map((o:any)=>({id:o.id,order_no:o.order_no,scheduled_for:o.scheduled_for,status:o.status}))}),
            delivery_status:"internal"
          });
          await sendFixedReply("You have more than one active pickup order. Which order do you mean?\n"+matchedOrders.map((o:any,i:number)=>`${i+1}. Order #${o.order_no} — ${o.scheduled_for ? new Date(o.scheduled_for).toLocaleString("en-NG",{timeZone:"Africa/Lagos"}) : "Pickup time pending"}`).join("\n")+"\nReply with the number beside the order.");
          continue;
        }
        const selectedOrder = matchedOrders[0] as any;
        if (wantsStatus) {
          let agentName = "";
          if (selectedOrder.pickup_agent_id) {
            const {data:agent} = await db.from("profiles").select("full_name").eq("id",selectedOrder.pickup_agent_id).maybeSingle();
            if (agent?.full_name) agentName = " Agent: "+agent.full_name+".";
          }
          await sendFixedReply(`Order #${selectedOrder.order_no} status: ${String(selectedOrder.status).replaceAll("_"," ")}. Pickup: ${selectedOrder.scheduled_for ? new Date(selectedOrder.scheduled_for).toLocaleString("en-NG",{timeZone:"Africa/Lagos",weekday:"long",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}) : "not scheduled"}.${agentName}`);
          continue;
        }
        if (selectedOrder.source !== "online" || !["awaiting_fare_payment","awaiting_dispatch"].includes(String(selectedOrder.status))) {
          await sendFixedReply(`Order #${selectedOrder.order_no} cannot currently be rescheduled through self-service because it is ${String(selectedOrder.status).replaceAll("_"," ")}. Please contact our team; no change was made.`);
          continue;
        }
        const dates = await getDates(activeSession.customer_id);
        if (!dates.length) { await sendFixedReply("There are no available pickup dates. Your existing order has not been changed."); continue; }
        await db.from("whatsapp_conversation_messages").insert({
          phone:from,direction:"outbound",
          body:"ORDER_RESCHEDULE_DATES:"+JSON.stringify({customer_id:activeSession.customer_id,order_id:selectedOrder.id,order_no:selectedOrder.order_no,dates}),
          delivery_status:"internal"
        });
        await sendFixedReply(`Choose a new pickup date for Order #${selectedOrder.order_no}:\n`+dates.map((x:any,i:number)=>`${i+1}. ${x.label}`).join("\n"));
        continue;
      }

      // Explicit customer request to restart must clear the active pickup wizard before pending numeric prompts can consume the message.
      const restartFlow = /\b(start (?:from )?(?:the )?beginning|start over|start again|restart(?: the)? (?:pickup|booking|process|flow)?|reset (?:the )?(?:pickup|booking|flow|conversation)|i made a mistake|begin again)\b/i.test(body.trim());
      if(restartFlow){
        await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"PICKUP_RESTART_PENDING:"+JSON.stringify({created_at:new Date().toISOString()}),delivery_status:"internal"});
        for(const prefix of ["PICKUP_SLOT_PENDING:","PICKUP_DATE_PENDING:","LOCATION_PENDING:"]){
          await db.from("whatsapp_conversation_messages").insert({
            phone:from,direction:"outbound",
            body:prefix+JSON.stringify({customer_id:(await getVerifiedSession())?.customer_id ?? null,completed:true,reset_at:new Date().toISOString()}),
            delivery_status:"internal"
          });
        }
        await sendFixedReply("No problem — we can start the pickup request again. Your previous messages are not a problem.\n\nHow to share your location on WhatsApp:\n\n1. Android: tap the paperclip 📎 beside the message box.\n2. iPhone: tap the + beside the message box.\n3. Choose Location.\n4. Tap Send your current location.\n\nChoose Send your current location, not Share live location. LaundryPoint only needs a one-time pin, not live tracking. If the pin is not exactly where you are, move the map to the correct spot and send that pin.\n\nThen send your house number, street and a nearby landmark when asked. This restarts the request flow; it does not cancel any order that was already created.");
        continue;
      }
      if (activeSession?.customer_id) {
        const pendingRescheduleSlot = await getPending("ORDER_RESCHEDULE_SLOT_PENDING:");
        if (pendingRescheduleSlot && pendingRescheduleSlot.customer_id === activeSession.customer_id && !pendingRescheduleSlot.completed) {
          const n = body.trim().match(/^\d{1,2}$/);
          const slot = n ? pendingRescheduleSlot.slots?.[Number(n[0]) - 1] : null;
          if (!slot) {
            if (n) { await sendFixedReply("That number does not match the times listed. Your existing order has not been changed; choose a listed time."); continue; }
            await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"ORDER_RESCHEDULE_SLOT_PENDING:"+JSON.stringify({...pendingRescheduleSlot,completed:true}),delivery_status:"internal"});
          } else {
            const freshSlots = await getSlots(String(activeSession.customer_id), String(pendingRescheduleSlot.date));
            if (!freshSlots.some((x:any)=>String(x.start)===String(slot.start))) { await sendFixedReply("That time is no longer available. Your existing order has not been changed; choose another date."); continue; }
            const { data: updatedOrder, error: updateError } = await db.from("orders").update({scheduled_for:slot.start,updated_at:new Date().toISOString()}).eq("id",pendingRescheduleSlot.order_id).eq("customer_id",activeSession.customer_id).eq("source","online").in("status",["awaiting_fare_payment","awaiting_dispatch"]).select("order_no,scheduled_for").maybeSingle();
            if (updateError || !updatedOrder) { console.error("whatsapp_reschedule_update_failed",{code:updateError?.code}); await sendFixedReply("I couldn't safely update your existing order. No new order was created and no pickup time was changed. Please contact our team."); continue; }
            await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"ORDER_RESCHEDULE_SLOT_PENDING:"+JSON.stringify({...pendingRescheduleSlot,completed:true}),delivery_status:"internal"});
            await sendFixedReply(`Updated existing Order #${updatedOrder.order_no}. New pickup: ${new Date(updatedOrder.scheduled_for).toLocaleString("en-NG",{timeZone:"Africa/Lagos",weekday:"long",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})}. No new order was created.`);
            continue;
          }
        }
        const pendingRescheduleDate = await getPending("ORDER_RESCHEDULE_DATES:");
        if (pendingRescheduleDate && pendingRescheduleDate.customer_id === activeSession.customer_id && !pendingRescheduleDate.completed) {
          const n = body.trim().match(/^\d{1,2}$/);
          const date = n ? pendingRescheduleDate.dates?.[Number(n[0]) - 1] : null;
          if (!date) {
            if (n) { await sendFixedReply("That number does not match the dates listed for your existing order. Please choose one of those dates."); continue; }
            await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"ORDER_RESCHEDULE_DATES:"+JSON.stringify({...pendingRescheduleDate,completed:true}),delivery_status:"internal"});
          } else {
            const slots = await getSlots(String(activeSession.customer_id), String(date.date));
            if (!slots.length) { await sendFixedReply("There are no available pickup times on that date. Your existing order has not been changed; choose another date."); continue; }
            await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"ORDER_RESCHEDULE_SLOT_PENDING:"+JSON.stringify({...pendingRescheduleDate,date:date.date,date_label:date.label,slots}),delivery_status:"internal"});
            await sendFixedReply(`Available times for existing Order #${pendingRescheduleDate.order_no} on ${date.label}:\n`+slots.map((x:any,i:number)=>`${i+1}. ${x.label}`).join("\n")+ "\n\nChoose a time. This will update the existing order.");
            continue;
          }
        }
        const pendingOrderAction = await getPending("ORDER_ACTION_PENDING:");
        if (pendingOrderAction && pendingOrderAction.customer_id === activeSession.customer_id) {
          const n = body.trim().match(/^\d{1,2}$/);
          const order = n ? pendingOrderAction.orders?.[Number(n[0]) - 1] : null;
          if (!order) {
            if (n) { await sendFixedReply("That number does not match the listed orders. Please choose a number from that list."); continue; }
            await db.from("whatsapp_conversation_messages").insert({ phone: from, direction: "outbound", body: "ORDER_ACTION_PENDING:" + JSON.stringify({...pendingOrderAction, completed:true}), delivery_status:"internal" });
          } else {
            await db.from("whatsapp_conversation_messages").insert({ phone: from, direction: "outbound", body: "ORDER_ACTION_PENDING:" + JSON.stringify({...pendingOrderAction, completed:true}), delivery_status:"internal" });
            if (pendingOrderAction.mode === "status") {
              const { data: currentOrder, error: currentOrderError } = await db.from("orders").select("order_no,status,scheduled_for,pickup_agent_id").eq("id", order.id).eq("customer_id", activeSession.customer_id).maybeSingle();
              if (currentOrderError || !currentOrder) { await sendFixedReply("I couldn't retrieve that order. No changes were made."); continue; }
              await sendFixedReply(`Order #${currentOrder.order_no} status: ${String(currentOrder.status).replaceAll("_"," ")}. Pickup: ${currentOrder.scheduled_for ? new Date(currentOrder.scheduled_for).toLocaleString("en-NG",{timeZone:"Africa/Lagos",weekday:"long",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}) : "not scheduled"}.`);
              continue;
            }
            const { data: currentOrder, error: currentOrderError } = await db.from("orders").select("id,order_no,source,status").eq("id", order.id).eq("customer_id", activeSession.customer_id).maybeSingle();
            if (currentOrderError || !currentOrder) { await sendFixedReply("I couldn't retrieve that order. No changes were made."); continue; }
            if (currentOrder.source !== "online" || !["awaiting_fare_payment","awaiting_dispatch"].includes(String(currentOrder.status))) {
              await sendFixedReply(`Order #${currentOrder.order_no} cannot currently be rescheduled through self-service because it is ${String(currentOrder.status).replaceAll("_"," ")}. No changes were made.`);
              continue;
            }
            const dates = await getDates(activeSession.customer_id);
            if (!dates.length) { await sendFixedReply("There are no available pickup dates. Your existing order has not been changed."); continue; }
            await db.from("whatsapp_conversation_messages").insert({ phone:from,direction:"outbound",body:"ORDER_RESCHEDULE_DATES:"+JSON.stringify({customer_id:activeSession.customer_id,order_id:currentOrder.id,order_no:currentOrder.order_no,dates}),delivery_status:"internal" });
            await sendFixedReply(`Choose a new pickup date for existing Order #${currentOrder.order_no}:\n`+dates.map((x:any,i:number)=>`${i+1}. ${x.label}`).join("\n")+ "\n\nThis will change the existing order; it will not create a new order.");
            continue;
          }
        }
      }
      if(activeSession?.customer_id){
        const pendingSlot = await getPending("PICKUP_SLOT_PENDING:");
        if(pendingSlot && pendingSlot.customer_id===activeSession.customer_id && !pendingSlot.completed){
          const m=body.trim().match(/^\s*(\d{1,2})(?:\s*[:.)-]|\s*$)/);
          const selected=m ? pendingSlot.slots[Number(m[1])-1] : null;
          if(!selected){
            if(m){await sendFixedReply("That number does not match an available pickup time. Please choose one of the listed numbers.");continue;}
            await db.from("whatsapp_conversation_messages").insert({
              phone:from,direction:"outbound",
              body:"PICKUP_SLOT_PENDING:"+JSON.stringify({...pendingSlot,completed:true,closed_reason:"customer_sent_new_message",closed_at:new Date().toISOString()}),
              delivery_status:"internal"
            });
          } else {
          const current=await getSlots(String(activeSession.customer_id),String(pendingSlot.date));
          if(!current.some((x:any)=>String(x.start)===String(selected.start))){await sendFixedReply("That time option is no longer valid. Please choose another date.");continue;}
          const {data:booking,error:bookingError}=await db.rpc("whatsapp_create_pickup_for_customer",{_customer:activeSession.customer_id,_lat:pendingSlot.lat,_lng:pendingSlot.lng,_address:pendingSlot.address,_notes:"WhatsApp pickup request",_slot:selected.start,_force_one_time:pendingSlot.mode === "one_time"});
          if(bookingError){await sendFixedReply(/slot_unavailable|slot_invalid/i.test(String(bookingError.message))?"That time has just become unavailable. Please choose another time.":"I could not complete the booking. No payment has been collected. Our team will assist.");continue;}
          await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"PICKUP_SLOT_PENDING:"+JSON.stringify({customer_id:activeSession.customer_id,completed:true}),delivery_status:"internal"});
          const ref=String((booking as any)?.order_no ?? (booking as any)?.order_id ?? "created");
          if((booking as any)?.source==="subscription"){
            await sendFixedReply("Your subscription pickup has been booked successfully. Order reference: "+ref+".\nPickup date: "+pendingSlot.date+"\nTime: "+selected.label+".");
          } else {
            const exhausted=(booking as any)?.source==="one_time_allowance_exhausted";
            const provider = await getWhatsAppPaymentProvider(db);
            if (!provider) {
              await sendFixedReply((exhausted?"You have used the two pickup requests included in your current subscription period. This request is a one-time pickup. ":"You do not have an active subscription, so this request is a one-time pickup. ")+"Order reference: "+ref+".\nPickup date: "+pendingSlot.date+"\nTime: "+selected.label+".\nOnline checkout is unavailable. Our team will follow up; please do not pay an agent in cash.");
              continue;
            }
            const {data:intent,error:intentError}=await db.rpc("whatsapp_create_payment_intent_for_customer",{_customer:activeSession.customer_id,_order:(booking as any)?.order_id,_purpose:"pickup_fare",_provider:provider});
            if(intentError||!intent?.reference||!intent?.amount_kobo||!intent?.email){
              console.error("whatsapp_payment_intent_failed",{order:ref,error:intentError?.message});
              await sendFixedReply("Your one-time pickup request "+ref+" was created, but secure checkout could not be initialized. Our team will assist. No payment has been collected.");
              continue;
            }
            const callback="https://laundrypoint.app/orders/"+String((booking as any)?.order_id)+"?returning=1";
            let checkoutUrl="";
            try {
              checkoutUrl = await createWhatsAppCheckout(provider, intent, {
                callbackUrl: callback,
                metadata: { order_id: (booking as any)?.order_id, purpose: "pickup_fare", source: "whatsapp" },
                description: "One-time pickup and delivery fare for order #" + ref,
              });
            } catch(error) { console.error("whatsapp_pickup_checkout_error", String(error).slice(0,300)); }
            if(!checkoutUrl){
              await sendFixedReply("Your one-time pickup request "+ref+" was created, but the secure checkout link could not be generated. Our team will assist. No payment has been confirmed.");
              continue;
            }
            const amountNaira=(Number(intent.amount_kobo)/100).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});
            const providerName = provider === "flutterwave" ? "Flutterwave" : "Paystack";
            await sendFixedReply((exhausted?"You have used the two pickup requests included in your current subscription period, so this is now a one-time pickup. ":"You do not have an active subscription, so this is a one-time pickup. ")+"\nOrder reference: "+ref+"\nPickup date: "+pendingSlot.date+"\nTime: "+selected.label+"\nAmount due: ₦"+amountNaira+"\nPayment for: one-time pickup and delivery fare.\nPayment method: "+providerName+".\nPay securely here: "+checkoutUrl+"\nAfter payment, wait for LaundryPoint to confirm payment and assign your pickup agent.");
          }
          continue;
        }
          }
        const pendingDate=await getPending("PICKUP_DATE_PENDING:");
        if(pendingDate && pendingDate.customer_id===activeSession.customer_id && !pendingDate.completed){
          const m=body.trim().match(/^\s*(\d{1,2})(?:\s*[:.)-]|\s*$)/);
          const selectedDate=m ? pendingDate.dates[Number(m[1])-1] : null;
          if(!selectedDate){
            if(m){
              await sendFixedReply("That number does not match an available pickup date. Please choose one of the listed numbers, or ask your question in a full sentence.");
              continue;
            }
            // A non-numeric message is a new question/request, not a date selection.
            // Close the stale wizard state and let order-status/date-change requests reach normal handling.
            await db.from("whatsapp_conversation_messages").insert({
              phone:from,direction:"outbound",
              body:"PICKUP_DATE_PENDING:"+JSON.stringify({...pendingDate,completed:true,closed_reason:"customer_sent_new_message",closed_at:new Date().toISOString()}),
              delivery_status:"internal"
            });
          } else {
            const slots=await getSlots(String(activeSession.customer_id),String(selectedDate.date));
            if(!slots.length){await sendFixedReply("That date no longer has available pickup times. Please choose another date.");continue;}
            await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"PICKUP_SLOT_PENDING:"+JSON.stringify({customer_id:activeSession.customer_id,lat:pendingDate.lat,lng:pendingDate.lng,address:pendingDate.address,date:selectedDate.date,slots,mode:pendingDate.mode || "auto"}),delivery_status:"internal"});
            await sendFixedReply("Available pickup times for "+selectedDate.label+":\n"+slots.map((x:any,i)=>`${i+1}. ${x.label}`).join("\n")+"\n\nReply with the number of your preferred time.");
            continue;
          }
        }
        const pendingLocation=await getPending("LOCATION_PENDING:");
        const isEmailMessage = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(body);
        const isGeneralOrOrderMessage = /\b(hi|hello|hey|status|track|tracking|order|explain|what is|how does|help|change|reschedule|postpone|move|update)\b/i.test(body);
        if(pendingLocation && pendingLocation.customer_id===activeSession.customer_id && !pendingLocation.completed && body.trim().length>=5 && !isEmailMessage && !isGeneralOrOrderMessage){
          await startDateSelection(String(activeSession.customer_id),Number(pendingLocation.lat),Number(pendingLocation.lng),body.trim(),pendingLocation.mode === "one_time" ? "one_time" : "auto");
          continue;
        }
      }
      const withinCustomerCareWindow = Number.isFinite(receivedAt.getTime()) &&
        Date.now() - receivedAt.getTime() <= 24 * 60 * 60 * 1000 &&
        Date.now() >= receivedAt.getTime();

      // Deterministic email-verification flow: never let the language model decide whether
      // an account exists, send a code, or validate a code.
      const emailMatch = body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      // Only interpret a six-character message as an OTP when a verification challenge
      // actually exists for this phone. Never turn ordinary words such as "Pick up"
      // into codes by stripping their spaces.
      const compactCode = body.trim().toUpperCase();
      const looksLikeVerificationCode = /^[A-Z0-9]{6}$/.test(compactCode);

      if (!openAiKey || !waToken || !phoneNumberId || !withinCustomerCareWindow) {
        // Continue below to the existing operational safety gate.
      }

      const privateAccountIntent = /\b(my account|my subscription|my plan|my order|my payment|my invoice|my address|my pickup|my delivery|track (?:my )?order|order status|subscription status|plan status|payment status|invoice status)\b/i.test(body);
      const { data: sessionState, error: sessionStateError } = await db
        .from("whatsapp_account_verifications")
        .select("email, verified_until, last_activity_at, expiry_notice_sent_at, code_hash")
        .eq("phone", normalizedPhone)
        .maybeSingle();
      if (sessionStateError) throw new Error("verification_status_check_failed");
      const hasVerificationChallenge = Boolean(sessionState?.code_hash);
      const sessionNow = Date.now();
      const sessionUntil = sessionState?.verified_until ? new Date(sessionState.verified_until).getTime() : 0;
      const sessionIsValid = Number.isFinite(sessionUntil) && sessionUntil > sessionNow;
      if (sessionIsValid) {
        // Sliding two-hour idle session: any message during a valid session extends it.
        const refreshedUntil = new Date(sessionNow + 2 * 60 * 60 * 1000).toISOString();
        const { error: refreshError } = await db.from("whatsapp_account_verifications")
          .update({ verified_until: refreshedUntil, last_activity_at: new Date(sessionNow).toISOString(), expiry_notice_sent_at: null, updated_at: new Date(sessionNow).toISOString() })
          .eq("phone", normalizedPhone);
        if (refreshError) throw new Error("verification_session_refresh_failed");
      }
      const pickupIntent = /\b(?:(?:i\s+(?:want|would like|need)\s+to)\s+)?(?:book|create|request(?:\s+for)?|schedule|arrange|reschedule|cancel|change)\s+(?:(?:a|my|the)\s+)?(?:pickup|pick\s*up|collection|delivery)\b|\b(?:pick up|collect|deliver)\s+(?:my|the|an?)\s+(?:order|clothes|laundry)\b|\bI need (?:a )?(?:pickup|collection|delivery)\b/i.test(body);
      if (sessionState?.email && !sessionIsValid && (privateAccountIntent || pickupIntent) && !emailMatch && !looksLikeVerificationCode) {
        await sendFixedReply("Your verified session has ended after 2 hours without activity. When you want to access personal account details or arrange a pickup, please send the email address linked to your LaundryPoint account so we can verify you again.");
        continue;
      }
      if (pickupIntent && !emailMatch && !looksLikeVerificationCode) {
        const { data: verificationState, error: verificationStateError } = await db
          .from("whatsapp_account_verifications")
          .select("verified_until")
          .eq("phone", normalizedPhone)
          .gt("verified_until", new Date().toISOString())
          .maybeSingle();
        if (verificationStateError) throw new Error("verification_status_check_failed");
        if (!verificationState?.verified_until) {
          await sendFixedReply("To request a pickup, please send the email address linked to your LaundryPoint account. I'll check whether the account exists before sending a verification code.");
          continue;
        }
      }

      if (emailMatch) {
        // Preserve the customer's original account request while email verification is in progress.
        const { data: recentInbound, error: recentInboundError } = await db.from("whatsapp_conversation_messages")
          .select("body").eq("conversation_id", conversationId).eq("direction", "inbound")
          .order("created_at", { ascending: false }).limit(12);
        if (recentInboundError) throw new Error("verification_resume_context_lookup_failed");
        const originalIntent = (recentInbound ?? []).map((row: any) => String(row.body ?? "").trim())
          .find((text: string) => text && !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i.test(text) &&
            !/^[A-Z0-9]{6}$/.test(text.toUpperCase()) &&
            !/^(hi|hello|hey|good morning|good afternoon|good evening)[!.,\\s]*$/i.test(text) &&
            /\\b(subscription|my plan|my account|my order|my payment|my invoice|my address|my pickup|my delivery|track|status|book|pickup|pick up|collection|delivery)\\b/i.test(text));
        if (originalIntent) {
          const { error: resumeSaveError } = await db.from("whatsapp_conversation_messages").insert({
            phone: from, direction: "outbound",
            body: "WHATSAPP_VERIFICATION_RESUME:" + JSON.stringify({ intent: originalIntent, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
            delivery_status: "internal"
          });
          if (resumeSaveError) throw new Error("verification_resume_context_save_failed");
        }
        const email = emailMatch[0].toLowerCase();
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const random = crypto.getRandomValues(new Uint8Array(6));
        const codeBytes = Array.from(random, b => alphabet[b % alphabet.length]).join("");
        const codeHashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedPhone + ":" + codeBytes));
        const codeHash = Array.from(new Uint8Array(codeHashBuffer), b => b.toString(16).padStart(2, "0")).join("");
        const { data: startResult, error: startError } = await db.rpc("whatsapp_start_account_verification", {
          _phone: normalizedPhone, _email: email, _code_hash: codeHash, _code: codeBytes,
        });
        if (startError) throw new Error("verification_start_failed");
        const state = (startResult as any)?.status;
        if (state === "not_found") {
          await sendFixedReply("I couldn't find a LaundryPoint account for that email. Please create your account here: https://laundrypoint.app/signup\n\nOnce registered, come back here and I'll help you arrange your pickup.");
          continue;
        }
        if (state === "rate_limited") {
          await sendFixedReply("A verification code was recently sent. Please check your email inbox, or try again in a minute.");
          continue;
        }
        if (state !== "queued") throw new Error("verification_not_queued");
        await sendFixedReply("I've sent a 6-character verification code to your registered email. Please enter it here to verify your account and continue with your pickup request.");
        continue;
      }

      if (looksLikeVerificationCode && hasVerificationChallenge) {
        const codeHashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedPhone + ":" + compactCode));
        const codeHash = Array.from(new Uint8Array(codeHashBuffer), b => b.toString(16).padStart(2, "0")).join("");
        const { data: checkResult, error: checkError } = await db.rpc("whatsapp_check_account_verification", {
          _phone: normalizedPhone, _code_hash: codeHash,
        });
        if (checkError) throw new Error("verification_check_failed");
        const state = (checkResult as any)?.status;
        if (state === "verified") {
          activeSession = await getVerifiedSession();
          // Resume the exact private request that triggered verification instead of ending the conversation.
          const { data: resumeRows, error: resumeReadError } = await db.from("whatsapp_conversation_messages")
            .select("body").eq("conversation_id", conversationId).eq("direction", "outbound")
            .eq("delivery_status", "internal").like("body", "WHATSAPP_VERIFICATION_RESUME:%")
            .order("created_at", { ascending: false }).limit(1);
          if (resumeReadError) throw new Error("verification_resume_context_read_failed");
          let resumePayload: any = null;
          try { resumePayload = resumeRows?.[0]?.body ? JSON.parse(String(resumeRows[0].body).slice("WHATSAPP_VERIFICATION_RESUME:".length)) : null; } catch { resumePayload = null; }
          const resumeValid = resumePayload?.intent && resumePayload?.expires_at && new Date(resumePayload.expires_at).getTime() > Date.now();
          if (resumeValid) {
            body = String(resumePayload.intent);
            resumeVerificationIntent = true;
            const { error: resumeCloseError } = await db.from("whatsapp_conversation_messages").insert({
              phone: from, direction: "outbound",
              body: "WHATSAPP_VERIFICATION_RESUME:" + JSON.stringify({ ...resumePayload, completed: true, completed_at: new Date().toISOString() }),
              delivery_status: "internal"
            });
            if (resumeCloseError) throw new Error("verification_resume_context_close_failed");
          }
          const { data: consentState, error: consentReadError } = await db
            .from("whatsapp_account_verifications")
            .select("customer_id")
            .eq("phone", normalizedPhone)
            .maybeSingle();
          if (consentReadError || !consentState?.customer_id) throw new Error("verified_customer_lookup_failed");
          const { error: activityError } = await db.from("whatsapp_account_verifications")
            .update({ last_activity_at: new Date().toISOString(), expiry_notice_sent_at: null })
            .eq("phone", normalizedPhone)
            .eq("customer_id", consentState.customer_id);
          if (activityError) throw new Error("consent_state_prepare_failed");

          // Ask for transactional WhatsApp consent only until the customer opts in.
          const { data: consentProfile, error: consentProfileError } = await db.from("profiles")
            .select("id, whatsapp_opt_in, whatsapp_opt_out_at")
            .eq("id", consentState.customer_id)
            .eq("status", "active")
            .maybeSingle();
          if (consentProfileError || !consentProfile) throw new Error("consent_profile_lookup_failed");

          // Resume a pickup request immediately after successful OTP verification.
          // Do not make the customer repeat the request or stop at a generic consent notice.
          const resumedPickupIntent = /\b(?:(?:i\s+(?:want|would like|need)\s+to)\s+)?(?:book|create|request(?:\s+for)?|schedule|arrange)\s+(?:(?:a|my|the)\s+)?(?:pickup|pick\s*up|collection)\b|\bI need (?:a )?(?:pickup|collection)\b/i.test(body);
          if (resumeVerificationIntent && resumedPickupIntent && activeSession?.customer_id) {
            await db.from("whatsapp_conversation_messages").insert({
              phone: from, direction: "outbound",
              body: "PICKUP_REQUEST_PENDING:" + JSON.stringify({ customer_id: activeSession.customer_id, created_at: new Date().toISOString() }),
              delivery_status: "internal"
            });
            await sendFixedReply("Thanks — your account is verified. Let's arrange your pickup. Please share your current location pin here so I can check service coverage.\n\nHow to share it on WhatsApp:\n1. Android: tap the paperclip 📎 beside the message box.\n2. iPhone: tap the + beside the message box.\n3. Choose Location, then tap Send your current location.\n\nPlease choose Send your current location, not Share live location. We only need a one-time pin.");
            continue;
          }

          if (!resumeVerificationIntent) {
            if (consentProfile.whatsapp_opt_in === true) {
              await sendFixedReply("Your account is verified. WhatsApp account, payment and pickup updates are already enabled for this number.");
            } else if (consentProfile.whatsapp_opt_out_at) {
              await sendFixedReply("Your account is verified. WhatsApp updates remain disabled because you previously opted out. You can still use this chat for account assistance.");
            } else {
              const pendingBody = "WHATSAPP_CONSENT_PENDING:" + JSON.stringify({ customer_id: consentState.customer_id, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
              const { error: pendingMessageError } = await db.from("whatsapp_conversation_messages").insert({
                phone: from, direction: "outbound", body: pendingBody, delivery_status: "internal"
              });
              if (pendingMessageError) throw new Error("consent_prompt_state_save_failed");
              await sendFixedReply("Your account is verified. Would you like LaundryPoint to send account, payment and pickup updates to this WhatsApp number? Reply YES to agree or NO to decline. You can reply STOP at any time to opt out.");
            }
          }
        } else if (state === "locked") {
          await sendFixedReply("Too many incorrect attempts. Please request a new verification code.");
        } else {
          await sendFixedReply("That code is incorrect or has expired. Please check your email and try again, or request a new code.");
        }
        if (!resumeVerificationIntent) continue;
      }

      // Handle the explicit WhatsApp transactional-message consent prompt.
      const { data: pendingConsent, error: pendingConsentReadError } = await db
        .from("whatsapp_conversation_messages")
        .select("body")
        .eq("conversation_id", conversationId)
        .eq("direction", "outbound")
        .eq("delivery_status", "internal")
        .like("body", "WHATSAPP_CONSENT_PENDING:%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingConsentReadError) throw new Error("consent_state_lookup_failed");
      if (pendingConsent?.body) {
        let consentPayload: any = null;
        try { consentPayload = JSON.parse(String(pendingConsent.body).slice("WHATSAPP_CONSENT_PENDING:".length)); } catch { consentPayload = null; }
        const consentPending = consentPayload?.expires_at && new Date(consentPayload.expires_at).getTime() > Date.now();
        if (consentPending && /^(yes|y|agree|i agree|yes please)$/i.test(body.trim())) {
          const { data: identity, error: identityError } = await db.from("whatsapp_account_verifications")
            .select("customer_id, verified_until")
            .eq("phone", normalizedPhone)
            .eq("customer_id", consentPayload.customer_id)
            .gt("verified_until", new Date().toISOString())
            .maybeSingle();
          if (identityError || !identity?.customer_id) throw new Error("consent_identity_check_failed");
          const { data: profile, error: profileError } = await db.from("profiles")
            .select("id, whatsapp_opt_out_at")
            .eq("id", identity.customer_id)
            .eq("status", "active")
            .maybeSingle();
          if (profileError || !profile) throw new Error("consent_profile_check_failed");
          if (profile.whatsapp_opt_out_at) {
            await sendFixedReply("Your previous WhatsApp opt-out is still active. To protect your preference, we have not re-enabled messages. Please contact our team if you want to change it.");
          } else {
            const { error: consentUpdateError } = await db.from("profiles")
              .update({ whatsapp_opt_in: true, whatsapp_opt_in_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq("id", identity.customer_id)
              .is("whatsapp_opt_out_at", null);
            if (consentUpdateError) throw new Error("whatsapp_consent_save_failed");
            await db.from("whatsapp_conversation_messages").insert({ phone: from, direction: "outbound", body: "WHATSAPP_CONSENT_COMPLETED:" + String(identity.customer_id), delivery_status: "internal" });
            await sendFixedReply("Thank you. WhatsApp updates are now enabled for your LaundryPoint account. You can reply STOP at any time to opt out.");
          }
          continue;
        }
        if (consentPending && /^(no|n|no thanks|decline)$/i.test(body.trim())) {
          await db.from("whatsapp_conversation_messages").insert({ phone: from, direction: "outbound", body: "WHATSAPP_CONSENT_DECLINED:" + String(consentPayload.customer_id), delivery_status: "internal" });
          await sendFixedReply("No problem. WhatsApp updates will remain disabled. You can still use this chat for requests when your account is verified.");
          continue;
        }
      }


      // Deterministic account subscription management. All private data/actions are
      // backed by verified-customer RPCs; the language model never changes subscription state.
      if (activeSession?.customer_id) {
        const lowerAccountBody=body.trim().toLowerCase();
        const cancelPending=await getPending("WHATSAPP_SUBSCRIPTION_CANCEL_CONFIRM_PENDING:");
        const cancelState=cancelPending?.customer_id===activeSession.customer_id && cancelPending.completed!==true ? cancelPending : null;
        if (cancelState && /^(yes|yes cancel|confirm|confirm cancellation|proceed)$/i.test(body.trim())) {
          const {data:cancelResult,error:cancelError}=await db.rpc("whatsapp_cancel_subscription_at_period_end",{_customer:activeSession.customer_id});
          if(cancelError||!cancelResult?.ok){
            await sendFixedReply("I couldn't schedule the cancellation just now. Your subscription has not been changed. Please try again or ask our team for help.");
          } else {
            await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"WHATSAPP_SUBSCRIPTION_CANCEL_CONFIRM_PENDING:"+JSON.stringify({...cancelState,completed:true,completed_at:new Date().toISOString()}),delivery_status:"internal"});
            const endLabel=new Intl.DateTimeFormat("en-NG",{timeZone:"Africa/Lagos",dateStyle:"long"}).format(new Date(cancelResult.current_period_end));
            await sendFixedReply("Your cancellation is scheduled successfully. Your "+String(cancelState.plan_name||"subscription")+" remains active until "+endLabel+". It will not renew after that date. You can continue using your remaining allowance until then.");
          }
          continue;
        }
        if (cancelState && /^(no|no cancel|keep it|don't cancel|do not cancel)$/i.test(body.trim())) {
          await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"WHATSAPP_SUBSCRIPTION_CANCEL_CONFIRM_PENDING:"+JSON.stringify({...cancelState,completed:true,closed_reason:"customer_declined"}),delivery_status:"internal"});
          await sendFixedReply("No problem. Your subscription has not been changed and will continue as normal.");
          continue;
        }
        const wantsCancel=/\b(cancel|stop)\b.*\b(subscription|plan|renewal)\b|\b(cancel|stop)\s+my\s+(subscription|plan)\b/i.test(body);
        const wantsRenew=/\b(renew|pay)\b.*\b(subscription|plan|renewal)\b|\b(subscription|plan)\s+renewal\b/i.test(body);
        const wantsChange=/\b(upgrade|downgrade|change|switch)\b.*\b(subscription|plan)\b|\b(change|switch)\s+my\s+plan\b/i.test(body);
        const wantsHistory=/\b(subscription|plan)\b.*\b(payment history|invoices|receipts|payments)\b|\b(payment history|invoices|receipts)\b/i.test(body);
        const wantsStatus=/\b(my subscription|my active subscription|check my subscription|check my active subscription|active subscription|my plan|my current plan|subscription status|plan status|subscription details|remaining allowance|allowance remaining|my allowance|my usage|how many garments|how many pickups|pickup allowance|included pickups|manage my subscription|manage subscription)\b/i.test(body);
        if(wantsCancel||wantsRenew||wantsChange||wantsHistory||wantsStatus){
          const {data:snapshot,error:snapshotError}=await db.rpc("whatsapp_subscription_snapshot",{_customer:activeSession.customer_id});
          if(snapshotError){
            console.error("whatsapp_subscription_snapshot_failed",{code:snapshotError.code});
            await sendFixedReply("I couldn't retrieve your subscription details securely just now. Please try again shortly.");
            continue;
          }
          if(!snapshot?.has_subscription){
            await sendFixedReply("I couldn't find an active subscription on your LaundryPoint account. If you'd like to subscribe, say “I want to subscribe” and I'll guide you through the available plans.");
            continue;
          }
          const sub=snapshot.subscription,plan=snapshot.plan,usage=snapshot.usage||{},cycle=snapshot.cycle||{};
          const dateLabel=(v:any)=>v?new Intl.DateTimeFormat("en-NG",{timeZone:"Africa/Lagos",dateStyle:"medium"}).format(new Date(v)):"not available";
          if(wantsCancel){
            if(sub.status!=="active"&&sub.status!=="trialing"){
              await sendFixedReply("This subscription is not currently active, so I can't schedule a cancellation. I can show you its latest status or connect you with our team.");
            } else if(sub.cancel_at_period_end){
              await sendFixedReply("Your subscription is already scheduled not to renew after "+dateLabel(sub.current_period_end)+". You can keep using it until then.");
            } else {
              await db.from("whatsapp_conversation_messages").insert({phone:from,direction:"outbound",body:"WHATSAPP_SUBSCRIPTION_CANCEL_CONFIRM_PENDING:"+JSON.stringify({customer_id:activeSession.customer_id,plan_name:plan?.name,created_at:new Date().toISOString()}),delivery_status:"internal"});
              await sendFixedReply("I can schedule your "+String(plan?.name||"")+" subscription to end on "+dateLabel(sub.current_period_end)+". You'll keep access until then, but it won't renew. No refund is created by this action. Do you want me to schedule the cancellation? Reply YES to confirm or NO to keep your subscription.");
            }
            continue;
          }
          if(wantsChange){
            await db.from("whatsapp_handoffs").upsert({inbound_message_id:item.id,from_phone:from,reason:"customer_requested_subscription_plan_change",message_text:body.slice(0,2000),status:"open"},{onConflict:"inbound_message_id",ignoreDuplicates:true});
            await sendFixedReply("I can help with a plan change. To avoid charging you incorrectly or changing your allowance mid-cycle, I've sent this request to our subscription team. Your current plan remains unchanged until they confirm the options with you.");
            continue;
          }
          if(wantsRenew){
            const dueInvoice=(snapshot.invoices||[]).find((inv:any)=>inv.status==="due");
            if(!dueInvoice){
              await sendFixedReply("I can't see a payable renewal invoice yet. Your current "+String(plan?.name||"")+" subscription ends on "+dateLabel(sub.current_period_end)+". LaundryPoint will make the renewal invoice available when it enters the renewal window. No payment has been requested.");
              continue;
            }
            const provider = await getWhatsAppPaymentProvider(db);
            if(!provider){await sendFixedReply("Online subscription renewal payments are currently unavailable. No payment has been collected. Please try again later.");continue;}
            const {data:intent,error:intentError}=await db.rpc("whatsapp_create_subscription_renewal_payment_intent",{_customer:activeSession.customer_id,_invoice_id:dueInvoice.id,_provider:provider});
            if(intentError||!intent?.reference||!intent?.amount_kobo||!intent?.email){
              console.error("whatsapp_subscription_renewal_intent_failed",{code:intentError?.code});
              await sendFixedReply("I couldn't prepare your renewal checkout. No payment has been collected and your current subscription has not been changed. Please contact our team if this continues.");
              continue;
            }
            let checkoutUrl="";
            try{
              checkoutUrl = await createWhatsAppCheckout(provider, intent, {
                callbackUrl: "https://laundrypoint.app",
                metadata: { purpose: "subscription", subscription_id: intent.subscription_id, invoice_id: intent.invoice_id, source: "whatsapp_renewal" },
                description: "LaundryPoint subscription renewal",
              });
            }catch(e){console.error("whatsapp_subscription_renewal_checkout_error",String(e).slice(0,200));}
            if(!checkoutUrl){
              await db.from("payments").update({status:"failed",note:provider + " checkout initialization failed"}).eq("reference",intent.reference).eq("status","pending");
              await sendFixedReply("I couldn't generate the renewal payment link. No payment has been collected. Please reply RENEW to try again later.");
              continue;
            }
            await sendFixedReply("Your "+String(plan?.name||"")+" subscription renewal is ready. Amount due: "+moneyNaira(Number(intent.amount_kobo))+". This payment covers "+dateLabel(dueInvoice.period_start)+" to "+dateLabel(dueInvoice.period_end)+". Pay securely with "+(provider === "flutterwave" ? "Flutterwave" : "Paystack")+" here: "+checkoutUrl+". Your renewal will be applied only after the payment provider confirms payment.");
            continue;
          }
          if(wantsHistory){
            const invoices=snapshot.invoices||[];
            if(!invoices.length){await sendFixedReply("There are no subscription invoices recorded for this plan yet.");continue;}
            const lines=invoices.map((inv:any)=>"- "+dateLabel(inv.period_start)+" to "+dateLabel(inv.period_end)+": "+moneyNaira(Number(inv.amount_kobo))+" — "+String(inv.status==="paid"?"Paid":inv.status==="due"?"Due":inv.status));
            await sendFixedReply("Here is your recent subscription billing history:\n"+lines.join("\n"));
            continue;
          }
          const billingName=String(sub.billing_period||"monthly").replace(/_/g," ");
          const remainingGarments=Math.max(0,Number(plan?.pieces_per_month||0)-Number(usage.garments_used||0));
          const remainingPickups=Math.max(0,Number(usage.pickups_included||2)-Number(usage.pickups_used||0));
          const cancelLine=sub.cancel_at_period_end?"Cancellation is scheduled; access remains until "+dateLabel(sub.current_period_end)+".":"Renewal/end date: "+dateLabel(sub.current_period_end)+".";
          const nextPickupDate=usage.last_pickup_at?dateLabel(new Date(new Date(usage.last_pickup_at).getTime()+14*86400000).toISOString()):"available now, subject to scheduling";
          await sendFixedReply("Here's your LaundryPoint subscription:\n\nPlan: "+String(plan?.name||"")+
            "\nStatus: "+String(sub.status)+
            "\nBilling: "+billingName+
            "\nCurrent monthly cycle: "+dateLabel(cycle.start)+" to "+dateLabel(cycle.end)+
            "\nGarments used: "+String(usage.garments_used||0)+" of "+String(plan?.pieces_per_month||0)+
            "\nGarments remaining: "+String(remainingGarments)+
            "\nPickups used: "+String(usage.pickups_used||0)+" of "+String(usage.pickups_included||2)+
            "\nIncluded pickups remaining: "+String(remainingPickups)+
            "\nNext included pickup date: "+(remainingPickups>0?nextPickupDate:"No included pickups remain this cycle")+
            "\nPer-pickup garment cap: "+String(plan?.per_pickup_cap??"not configured")+
            "\nExtra garments: billed at the standard individual item price"+
            "\n"+cancelLine+
            "\n\nYou can ask me to show payment history, renew your subscription, or request a plan change or cancellation.");
          continue;
        }
      }

      // Keep a plain greeting light and welcoming. A greeting is public conversation,
      // not a private account action, so never ask for an email just because someone says hi.
      if (/^(?:hi|hello|hey|good morning|good afternoon|good evening|hiya)[!.,\s]*$/i.test(body.trim())) {
        const hour = Number(new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
        const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        await sendFixedReply(timeGreeting + "! 👋 Welcome to LaundryPoint. I can help with laundry services and prices, monthly plans, our hubs and service areas, or arranging a pickup. What would you like to explore?");
        continue;
      }

      // Deterministic subscription checkout. This runs only after the verified-session
      // and consent handlers; the AI is never allowed to create subscriptions or request
      // an email when a verified customer is already authenticated.
      const getLatestSubscriptionPending = async () => {
        const {data,error}=await db.from("whatsapp_conversation_messages").select("body")
          .eq("conversation_id",conversationId).eq("direction","outbound").eq("delivery_status","internal")
          .like("body","WHATSAPP_SUBSCRIPTION_PENDING:%").order("created_at",{ascending:false}).limit(1);
        if(error) throw new Error("subscription_state_lookup_failed");
        if(!data?.length) return null;
        try {
          const state=JSON.parse(String(data[0].body).slice("WHATSAPP_SUBSCRIPTION_PENDING:".length));
          return state;
        } catch { return null; }
      };
      const latestSubscriptionState = await getLatestSubscriptionPending();
      const subscriptionPending = latestSubscriptionState?.completed===true ? null : latestSubscriptionState;
      const normalizePlanText = (value:string) => " "+value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim()+" ";
      const lowerBody=body.toLowerCase();
      const normalizedBody = normalizePlanText(body);
      const planMention = (activePlans ?? []).find((plan:any) =>
        normalizedBody.includes(normalizePlanText(String(plan.name))) ||
        normalizedBody.includes(normalizePlanText(String(plan.slug).replace(/_/g," ")))
      );
      const subscribeIntent = ["i want to subscribe","want to subscribe","subscribe me","sign me up","sign up for the plan","start my subscription","i want a subscription"]
        .some((phrase)=>lowerBody.includes(phrase));
      const recentTurnsForSubscription = await db.from("whatsapp_conversation_messages")
        .select("direction,body").eq("conversation_id",conversationId).order("created_at",{ascending:false}).limit(12);
      const recentSubscribeContext = latestSubscriptionState?.completed!==true && (recentTurnsForSubscription.data ?? []).some((turn:any) => {
        const text=String(turn.body??"").toLowerCase();
        return text.includes("i want to subscribe") || text.includes("want to subscribe") ||
          text.includes("subscribe me") || text.includes("sign me up") || text.includes("sign up for the plan");
      });
      const subscriptionConversation = Boolean(subscriptionPending || subscribeIntent || (planMention && recentSubscribeContext));
      const nl=String.fromCharCode(10);
      // Stop duplicate subscription attempts early. A verified customer with an active plan
      // should be told about that plan before any plan selection or checkout is offered.
      if (subscriptionConversation && activeSession?.customer_id) {
        const {data: currentSubscription,error: currentSubscriptionError}=await db.from("subscriptions")
          .select("status,billing_period,current_period_end,cancel_at_period_end,plans(name)")
          .eq("customer_id",activeSession.customer_id)
          .in("status",["active","trialing"])
          .order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(currentSubscriptionError) throw new Error("current_subscription_lookup_failed");
        if(currentSubscription) {
          if(subscriptionPending && subscriptionPending.customer_id===activeSession.customer_id && subscriptionPending.completed!==true) {
            const {error:closePendingError}=await db.from("whatsapp_conversation_messages").insert({
              phone:from,direction:"outbound",
              body:"WHATSAPP_SUBSCRIPTION_PENDING:"+JSON.stringify({...subscriptionPending,completed:true,completed_at:new Date().toISOString(),closed_reason:"active_subscription_exists"}),
              delivery_status:"internal"
            });
            if(closePendingError) throw new Error("subscription_state_close_failed");
          }
          const planName=String((currentSubscription as any).plans?.name||"your current plan");
          const periodEnd=currentSubscription.current_period_end
            ? new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Lagos",day:"numeric",month:"long",year:"numeric"}).format(new Date(currentSubscription.current_period_end))
            : "the end of your current billing period";
          const endingNote=currentSubscription.cancel_at_period_end
            ? " Your subscription is set to end on "+periodEnd+"."
            : " Your current billing period ends on "+periodEnd+".";
          await sendFixedReply("Your LaundryPoint account already has an active "+planName+" subscription ("+String(currentSubscription.billing_period||"monthly")+" billing)."+endingNote+" I have not created another subscription or requested another payment. If you want to change your plan, please contact our support team so they can assist without creating a duplicate subscription.");
          continue;
        }
      }
      const saveSubscriptionState = async (state:any) => {
        const {error}=await db.from("whatsapp_conversation_messages").insert({
          phone:from,direction:"outbound",body:"WHATSAPP_SUBSCRIPTION_PENDING:"+JSON.stringify(state),delivery_status:"internal"
        });
        if(error) throw new Error("subscription_conversation_state_save_failed");
      };
      const closeSubscriptionState = async (state:any) => saveSubscriptionState({...state,completed:true,completed_at:new Date().toISOString()});
      const formatPlan = (plan:any) => "Plan: "+plan.name+nl+"Monthly price: "+moneyNaira(Number(plan.monthly_price_kobo))+
        nl+"Monthly garment allowance: "+String(plan.pieces_per_month ?? "not configured")+
        nl+"Per-pickup garment cap: "+String(plan.weekly_allowance ?? "not configured")+
        nl+"Extra garments: billed at standard individual item prices"+
        nl+"3-month discount: "+String(plan.three_month_discount_pct ?? 0)+"%"+
        nl+"6-month discount: "+String(plan.six_month_discount_pct ?? 0)+"%"+
        nl+"Yearly discount: "+String(plan.yearly_discount_pct ?? 0)+"%";
      const askPlanChoice = async () => {
        const choices=(activePlans??[]).map((plan:any)=>"- "+plan.name+": "+moneyNaira(Number(plan.monthly_price_kobo))+"/month").join(nl);
        await saveSubscriptionState({customer_id:activeSession?.customer_id??null,stage:"choose_plan"});
        await sendFixedReply("I can help you subscribe. Choose a plan:"+nl+choices+nl+nl+"Reply with the plan name you want. You can then choose monthly, 3-month, 6-month or yearly billing.");
      };
      if (subscriptionConversation && !activeSession?.customer_id) {
        await sendFixedReply("To set up a subscription, please send the email address registered to your LaundryPoint account. I'll verify your account first. You won't need to enter it again while your verification session is active.");
        continue;
      }
      if (subscriptionPending && subscriptionPending.customer_id===activeSession?.customer_id && subscriptionPending.completed!==true) {
        if (subscriptionPending.stage==="choose_plan") {
          if (!planMention) {
            await sendFixedReply("Please reply with one of the available plan names: "+(activePlans??[]).map((p:any)=>p.name).join(", ")+".");
            continue;
          }
          const next={customer_id:activeSession.customer_id,stage:"choose_billing_period",plan_slug:planMention.slug,plan_name:planMention.name};
          await saveSubscriptionState(next);
          await sendFixedReply(formatPlan(planMention)+nl+nl+"Which billing term would you prefer? Reply MONTHLY, 3 MONTHS, 6 MONTHS or YEARLY.");
          continue;
        }
        if (subscriptionPending.stage==="choose_billing_period") {
          const periodText=body.trim().toLowerCase().replace(/[-_]/g," ");
          const billingPeriod=/^(monthly|month|1 month)$/i.test(periodText)?"monthly":
            /^(3 months|three months|three month|quarterly|3)$/i.test(periodText)?"three_month":
            /^(6 months|six months|six month|half yearly|half year|6)$/i.test(periodText)?"six_month":
            /^(yearly|annual|annually|12 months|12)$/i.test(periodText)?"yearly":null;
          if(!billingPeriod){
            await sendFixedReply("Please choose one billing term: MONTHLY, 3 MONTHS, 6 MONTHS or YEARLY.");
            continue;
          }
          const chosenPlan=(activePlans??[]).find((p:any)=>p.slug===subscriptionPending.plan_slug);
          if(!chosenPlan){await closeSubscriptionState(subscriptionPending);await sendFixedReply("I can't load that plan right now. Please start again and choose from the current plans.");continue;}
          const months=billingPeriod==="three_month"?3:billingPeriod==="six_month"?6:billingPeriod==="yearly"?12:1;
          const discount=Number(billingPeriod==="three_month"?chosenPlan.three_month_discount_pct:billingPeriod==="six_month"?chosenPlan.six_month_discount_pct:billingPeriod==="yearly"?chosenPlan.yearly_discount_pct:chosenPlan.monthly_discount_pct)||0;
          const total=Math.round(Number(chosenPlan.monthly_price_kobo)*months*(1-discount/100));
          const next={...subscriptionPending,stage:"confirm",billing_period:billingPeriod,months,discount_pct:discount,amount_kobo:total};
          await saveSubscriptionState(next);
          await sendFixedReply("Your selection:\nPlan: "+chosenPlan.name+"\nBilling term: "+billingPeriod.replace(/_/g," ")+"\nTerm price: "+moneyNaira(total)+"\nDiscount: "+discount+"%\n\nReply PAY to generate your secure Paystack checkout link, or CANCEL to stop.");
          continue;
        }
        if (subscriptionPending.stage==="confirm") {
          if (/^(cancel|stop|no|no thanks)$/i.test(body.trim())) {
            await closeSubscriptionState(subscriptionPending);
            await sendFixedReply("No problem. I haven't created a subscription or collected any payment. You can return here whenever you're ready.");
            continue;
          }
          if (planMention && planMention.slug!==subscriptionPending.plan_slug) {
            const next={...subscriptionPending,stage:"choose_billing_period",plan_slug:planMention.slug,plan_name:planMention.name};
            await saveSubscriptionState(next);
            await sendFixedReply(formatPlan(planMention)+nl+nl+"Choose MONTHLY, 3 MONTHS, 6 MONTHS or YEARLY.");
            continue;
          }
          if (/^(pay|yes|y|confirm|proceed|continue)$/i.test(body.trim())) {
            const provider = await getWhatsAppPaymentProvider(db);
            if(!provider){await sendFixedReply("Online subscription payments are currently unavailable. No payment has been collected. Please try again later.");continue;}
            const {data:intent,error:intentError}=await db.rpc("whatsapp_create_subscription_payment_intent_for_customer",{
              _customer:activeSession.customer_id,_plan_slug:subscriptionPending.plan_slug,_provider:provider,_billing_period:subscriptionPending.billing_period||"monthly"
            });
            if(intentError||!intent?.reference||!intent?.amount_kobo||!intent?.email){
              const reason=String(intentError?.message??"");
              if(/subscription_already_active/i.test(reason)){
                await closeSubscriptionState(subscriptionPending);
                await sendFixedReply("Your LaundryPoint account already has an active subscription. I haven't created another subscription or collected another payment.");
              } else {
                console.error("whatsapp_subscription_intent_failed",{plan:subscriptionPending.plan_slug,error:reason});
                await sendFixedReply("I couldn't prepare secure subscription checkout. No payment has been collected. Please try again or contact our team.");
              }
              continue;
            }
            let checkoutUrl="";
            try {
              checkoutUrl = await createWhatsAppCheckout(provider, intent, {
                callbackUrl: "https://laundrypoint.app",
                metadata: { purpose: "subscription", subscription_id: intent.subscription_id, plan_name: intent.plan_name, billing_period: subscriptionPending.billing_period||"monthly", source: "whatsapp" },
                description: "LaundryPoint " + String(intent.plan_name) + " subscription",
              });
            } catch(error) { console.error("whatsapp_subscription_checkout_error",String(error).slice(0,250)); }
            if(!checkoutUrl){
              await sendFixedReply("I couldn't generate the payment link. No payment has been collected. Please reply PAY to retry or contact our team.");
              continue;
            }
            await closeSubscriptionState(subscriptionPending);
            await sendFixedReply("Your "+String(intent.plan_name)+" "+String(subscriptionPending.billing_period||"monthly").replace(/_/g," ")+" subscription checkout is ready. Total: "+moneyNaira(Number(intent.amount_kobo))+"."+nl+"Pay securely with "+(provider === "flutterwave" ? "Flutterwave" : "Paystack")+" here: "+checkoutUrl+nl+nl+"Your subscription will become active only after the payment provider confirms payment. Please do not pay cash to an agent.");
            continue;
          }
          await sendFixedReply("Your selected plan is "+String(subscriptionPending.plan_name)+". Reply PAY to create the secure monthly payment link, or CANCEL to stop.");
          continue;
        }
      }
      if (!subscriptionPending && activeSession?.customer_id && subscribeIntent) {
        if (planMention) {
          await saveSubscriptionState({customer_id:activeSession.customer_id,stage:"choose_billing_period",plan_slug:planMention.slug,plan_name:planMention.name});
          await sendFixedReply(formatPlan(planMention)+nl+nl+"Choose MONTHLY, 3 MONTHS, 6 MONTHS or YEARLY.");
        } else {
          await askPlanChoice();
        }
        continue;
      }
      if (!subscriptionPending && activeSession?.customer_id && planMention && recentSubscribeContext) {
        await saveSubscriptionState({customer_id:activeSession.customer_id,stage:"choose_billing_period",plan_slug:planMention.slug,plan_name:planMention.name});
        await sendFixedReply(formatPlan(planMention)+nl+nl+"Choose MONTHLY, 3 MONTHS, 6 MONTHS or YEARLY.");
        continue;
      }

      if (needsHuman(body)) {
        const { error: handoffError } = await db.from("whatsapp_handoffs").upsert({
          inbound_message_id: item.id,
          from_phone: from,
          reason: "customer_requested_human_or_support_issue",
          message_text: body.slice(0, 2000),
          status: "open",
        }, { onConflict: "inbound_message_id", ignoreDuplicates: true });
        if (handoffError) throw new Error("handoff_create_failed");
        const handoffAt = new Date().toISOString();
        const { error: supportHandoffError } = await db.from("whatsapp_support_conversations").update({
          mode: "human", assigned_to: null, handoff_started_at: handoffAt,
          response_due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          unread_at: receivedAt.toISOString(), last_staff_reply_at: null, updated_at: handoffAt,
        }).eq("id", conversationId);
        if (supportHandoffError) throw new Error("support_handoff_state_write_failed");
        handedOff++;
        if (withinCustomerCareWindow && waToken && phoneNumberId) {
          const handoffReply = "Thanks for letting us know. I've flagged this for our team to review. A staff member will follow up as soon as possible.";
          const providerMessageId = await sendWhatsApp(from, handoffReply, waToken, phoneNumberId);
          await recordConversationMessage(db, { phone: from, direction: "outbound", body: handoffReply, providerMessageId, deliveryStatus: "sent" });
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

      // Supply recent persisted turns so short replies (e.g. "Yes") resolve against the actual question.
      const { data: recentConversation, error: historyError } = await db
        .from("whatsapp_conversation_messages")
        .select("direction,body,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(16);
      if (historyError) console.error("whatsapp_history_read_failed", { code: historyError.code });
      const conversationInput = [
        ...(recentConversation ?? []).reverse().map((turn: any) => ({
          role: turn.direction === "inbound" ? "user" : "assistant",
          content: String(turn.body ?? "").slice(0, 3500),
        })),
      ];
      // The current inbound message has already been persisted above; include it once in chronological order.
      const currentTurnAlreadyPresent = (recentConversation ?? []).some((turn: any) =>
        turn.direction === "inbound" && String(turn.body ?? "") === body
      );
      if (!currentTurnAlreadyPresent) conversationInput.push({
        role: "user", content: body,
      });

      const aiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-6-luna",
          instructions: [
            "You are LaundryPoint's WhatsApp customer-service assistant.",
            "Answer in WhatsApp-friendly plain text. Use short headings and bullets when listing multiple plans.",
            "Maintain a natural, helpful sales-and-support conversation. Always interpret the latest message in the context of the recent conversation history supplied as input.",
            "Resolve short replies such as Yes, No, Okay, Tell me more, What about that, and Which one? against the immediately preceding assistant question or offer. Never reset to a generic greeting when the customer is continuing an active topic. If the latest message clearly starts a new task, prioritize that task over older conversation context.",
            "When you offer to explain subscription allowance rules, annual discounts, plan comparisons, or another specific detail and the customer replies Yes, provide the offered detail directly. Do not ask what they need again.",
            "For an opening question about services, explain the actual service categories supported by the live items list. Give a concise overview, then ask what garment or service the customer wants. Do not respond with a vague 'tell me what you need' if the database contains useful item information.",
            "For a simple greeting, reply naturally and warmly in one short message, welcome the customer, and offer a few useful things you can help with. Do not use a rigid FAQ script, do not launch into delivery disclaimers, and never request an email unless the customer asks for a private account action or pickup booking that requires verification. A greeting must not trigger or repeat an old verification prompt just because a code challenge exists; greet the customer and let them choose what they want to do next.",
            "Never interpret ordinary words or phrases such as 'pick up', 'pickup', 'hello', 'thanks', or 'orders' as verification codes. Only validate a six-character code when the backend confirms that a code challenge is pending for this WhatsApp number. If a message is ambiguous, ask one short clarifying question instead of requesting verification.",
             "When the customer asks for all plans and every detail, give a complete, readable plan-by-plan comparison. Include each plan description, monthly cost, monthly garment allowance, per-pickup garment cap, and annual discount. Explain that garments above the allowance are billed at the standard individual item price; never show an extra-garment fee or a flat plan overage price. Also explain configured category limits only when meaningful. Never stop halfway through the last plan.",
            "For plan recommendations, use the plan descriptions from the live database as the plan's intended audience. If the customer has not explained household size or expected garment volume, provide a clearly labelled general starting suggestion with its reason, then ask one focused question to tailor it. Do not present the suggestion as a guaranteed best fit.",
            "When explaining annual discounts, state the configured percentage and clarify that it is an annual-billing discount only. Do not calculate or claim a specific annual total unless the required billing rule and calculation are explicitly available in the supplied data.",
            "The database field named weekly_allowance is operationally enforced as the maximum eligible garments on a single pickup, not as a separate weekly pool. Call it the per-pickup garment cap. The monthly garment allowance is the separate monthly pool shared across the customer's included pickups.",
            "Keep replies warm and conversational, normally 2-6 short sentences. Use bullets for plan lists. Avoid repetitive greetings, generic closing lines, and asking the customer to repeat information already in the conversation.",
            "General questions about LaundryPoint public subscription plans are not account-specific. Answer them directly from the live Plans table without asking for identity verification. Require verification only for a customer’s own subscription, billing, usage, orders, payment details, address, or account status.",
            "For general service FAQs and plan information, answer directly from the supplied live data. Do not unnecessarily escalate routine questions to staff. Escalate only when the requested fact is absent, account-specific, operational, or requires a human.",
             "When asked to list all subscription plans, include every active plan with its monthly price, monthly garment allowance, per-pickup garment cap and annual discount. State that garments above the allowance are billed at standard item prices; never include an extra-garment price or fee. Finish the entire list.",
            "When asked which plan to choose, recommend conditionally based on the customer's stated household or garment volume. If their needs are not known, explain who each plan is designed for and ask roughly how many garments they expect per month; do not make an unsupported personal recommendation.",
            "State both the monthly garment limit and per-pickup garment cap exactly as configured in the live Plans table.",
            "Never hardcode plan prices, garment allowances, caps, or discounts. Always use the values loaded from the live Plans table.",
            "Be concise, polite, and clear. Do not claim to be a human.",
            "Never invent prices, coverage areas, pickup times, order status, payment status, or policy.",
            "Do not create orders, payments, payment links, subscriptions, or change account data.",
            "Pickup and delivery requests are account-specific actions. Never create, schedule, cancel, or modify a pickup or delivery from an AI-generated answer alone. Use only an approved authenticated backend workflow that confirms the action succeeded; if no such workflow is available, explain the next step without claiming the request was placed.",
            "Before discussing or revealing private customer details, subscriptions attached to a person, addresses, orders, pickup schedules, payment details, or account status, require identity verification through the approved email verification flow. A WhatsApp phone number alone is not sufficient proof of identity.",
            "If a customer asks to request a pickup, check an order, change an address, or access account-specific information and they are not verified, ask for the email address associated with their LaundryPoint account. Do not ask them to send passwords, payment card details, or identity document numbers in WhatsApp.",
            "The verification flow must be implemented by secure backend code, not by the language model: check whether the email belongs to an existing account; for existing accounts generate a cryptographically secure, random six-character alphanumeric one-time code, store only a hash, expire it quickly, rate-limit sends and attempts, and send it to the registered email using the configured transactional email provider. Never invent or disclose a verification code in chat.",
            "If the supplied email does not match an existing customer account, direct the customer to create an account at https://laundrypoint.app/signup. Do not reveal whether another person's email or phone number is registered; use a privacy-preserving response where needed.",
            "After a customer submits a code, only backend verification may mark the WhatsApp session verified. Do not trust a customer's claim that they verified, and do not treat the AI's conversation history as proof of identity. Verification must be bound to both the WhatsApp phone and the email, expire, have a limited attempt count, and be invalidated after use or expiry.",
            "Once verified, use only approved backend functions to retrieve that customer's minimum necessary account data and to submit pickup requests. Never expose another customer's data. Before finalizing a pickup, collect/confirm the pickup address or location, requested date/time preference, and any required service details; confirm coverage and scheduling through live system data. Clearly state when a request is pending confirmation versus successfully booked.",
            "For pickup and delivery FAQs, explain the process conversationally: verify the account first for personal requests, confirm collection location and preferred time, check service coverage, submit through the approved workflow, then share only confirmed status updates. Never invent pickup availability, driver assignment, fees, or delivery times.",
            "For public subscription plans, garment prices, allowances, coverage areas, and general service FAQs, answer directly from the live database context. For account-specific order or payment status, pickup-slot availability, refunds, complaints, and actions requiring backend authorization, never guess: use the approved backend workflow when available or escalate to the team.",
            "For a human request, complaint, refund, damaged/missing clothing, or payment dispute, escalate instead of answering.",
            "If unsure, say a team member needs to confirm.",
            "LaundryPoint rule: every active coverage area in Admin > Coverage zones is also a LaundryPoint hub/drop-off service point. Do not tell customers that a separate physical station directory is missing.",
            "When asked to list hubs, drop-off hubs, stations, branches, or coverage areas, use the complete supplied list of active coverage areas. Include every active area, including standalone areas without a parent LGA. Do not invent street addresses or claim an exact staffed location unless the database explicitly provides it.",
             "Whenever you ask a customer to share, resend, or change a WhatsApp location pin, ALWAYS explain exactly how: Android: tap the paperclip beside the message box; iPhone: tap the + button; choose Location; then tap Send your current location. Explicitly tell them to choose Send your current location, NOT Share live location, because LaundryPoint only needs a one-time pin and does not need live tracking. If the pin is misplaced, they can move the map to the correct spot and send that pin. Ask them to send it in this chat. Do not merely say 'send your location pin'. Keep the instructions clear, numbered and friendly.",
            "If a customer asks whether their neighbourhood is covered but the area name is not an exact active coverage-area name, ask them to share a WhatsApp location pin and include the full Android/iPhone instructions above. The location pin will be checked against live geofence coverage; do not make the customer rely on a neighbourhood-name match.",
            "For a question about one location, match it case-insensitively against the complete active area list. A standalone active area is active; do not infer that it is not covered because it has no parent.",
            "If a coverage area is active, confirm LaundryPoint hub/drop-off coverage there. Do not promise a pickup time or appointment; say the team must confirm scheduling if asked.",
            "The active coverage areas below are fetched live from Admin > Coverage zones on each processor run. Use this database list as the single source of truth; newly activated areas should appear automatically and inactive areas must not be listed.",
            "For washing, laundry, dry cleaning, subscription plans, garment limits, pricing, annual billing, and extra garments, use only the live database context supplied below. Do not rely on memory or invent missing details.",
            "Live active subscription plans (prices are Nigerian naira, already formatted from the database):\\n" + plansContext,
            "Live active pay-per-item garment/service prices (Nigerian naira):\\n" + itemPricesContext,
             "Live instant-service pricing and availability settings (Nigerian naira):\\n" + instantPricingContext,
             "Use the live instant-service settings above for instant fees. The instant fee is separate from the normal garment-service price and depends on whether the customer selects dry clean or iron only.",
             "The live item/service prices above come from item_service_prices() and include the database-calculated iron-only eligibility and price. Never calculate iron-only prices yourself.",
             "Iron-only price calculations and eligibility come from the live database settings and item_service_prices() result. The displayed item prices are authoritative; never calculate or invent a different price.",
             "When comparing or listing plans, include every active plan and accurately state its monthly price, monthly garment allowance, per-pickup garment cap and annual discount exactly as supplied. Never include an extra-garment fee or amount. If the list is too long, split it across concise messages rather than truncate or omit a plan.",
            "When explaining allowance, distinguish the monthly garment allowance from the per-pickup garment cap; they are separate limits and are not added together. Do not invent rollover rules or other subscription terms.",
             "When a customer exceeds the allowance, explain that each additional garment is billed at its normal individual item price for the selected service. There is no flat subscription overage rate. Use the live item/service price list, not a legacy plan overage field. Do not calculate an account-specific bill unless the garment count and service are clear.",
             "If a customer asks about a garment individual price, use the live database service-price list. State dry-clean and iron-only prices separately. If iron-only is unavailable for that item, say so. Respect descriptions for sets, pairs, and multi-piece items. If no exact match exists, ask a clarifying question or offer staff follow-up.",
            "Do not claim dry cleaning is included in a subscription unless the live plan data or an explicit policy confirms it. If the database does not distinguish washing from dry cleaning or does not state what is included, say the team must confirm before quoting.",
            "If live plans or item prices failed to load, do not quote remembered prices or allowances. Explain that you cannot verify the current details and offer staff follow-up.",
            "Currently active service areas:\\n" + compactCoverageContext,
          ].join(" "),
          input: conversationInput,
          max_output_tokens: 1600,
        }),
      });
      const ai = await aiResponse.json().catch(() => ({}));
      if (!aiResponse.ok) {
        const detail = JSON.stringify(ai).slice(0, 1200);
        console.error("whatsapp_openai_request_failed", { status: aiResponse.status, detail });
        throw new Error(`openai_failed_${aiResponse.status}: ${detail}`);
      }
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
        const handoffAt = new Date().toISOString();
        const { error: supportHandoffError } = await db.from("whatsapp_support_conversations").update({
          mode: "human", assigned_to: null, handoff_started_at: handoffAt,
          response_due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          unread_at: receivedAt.toISOString(), last_staff_reply_at: null, updated_at: handoffAt,
        }).eq("id", conversationId);
        if (supportHandoffError) throw new Error("support_handoff_state_write_failed");
      }
      const providerMessageId = await sendWhatsApp(from, answer, waToken, phoneNumberId);
      await recordConversationMessage(db, { phone: from, direction: "outbound", body: answer, providerMessageId, deliveryStatus: "sent" });
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








