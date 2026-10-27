// Starts an online payment. Amounts and ownership are resolved by trusted database RPCs, never by the client.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.com";
const PAYSTACK = Deno.env.get("PAYSTACK_SECRET_KEY");
const FLW = Deno.env.get("FLUTTERWAVE_SECRET_KEY");

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (u.protocol === "https:" && (
      host === "laundrypoint.com" ||
      host === "www.laundrypoint.com" ||
      host.endsWith(".netlify.app")
    )) return u.origin;
  } catch { /* invalid origin is rejected */ }
  return null;
}

// Payments may return to the production site or the trusted Netlify preview that began checkout.
// Never reflect an arbitrary Origin into a provider callback URL.
function callbackSite(req: Request) {
  return allowedOrigin(req.headers.get("origin")) ?? SITE.replace(/\/$/, "");
}

const baseHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
};
const json = (status: number, body: unknown, origin: string | null) => {
  const headers = { ...baseHeaders, "Access-Control-Allow-Origin": allowedOrigin(origin) ?? "https://laundrypoint.com" };
  return new Response(JSON.stringify(body), { status, headers });
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: { ...baseHeaders, "Access-Control-Allow-Origin": allowedOrigin(origin) ?? "https://laundrypoint.com" },
    });
  }
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "not_signed_in" }, origin);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "bad_request" }, origin); }
  const order = String(b.order_id ?? "");
  const purpose = String(b.purpose ?? "");
  const provider = String(b.provider ?? "");
  const planSlug = String(b.plan_slug ?? "");
  const pickupId = String(b.pickup_id ?? "");

  if (provider !== "paystack" && provider !== "flutterwave") {
    return json(400, { error: "unsupported_provider" }, origin);
  }
  if (provider === "paystack" && !PAYSTACK) return json(503, { error: "provider_not_configured" }, origin);
  if (provider === "flutterwave" && !FLW) return json(503, { error: "provider_not_configured" }, origin);
  if (purpose === "subscription" && !/^[a-z0-9_]{2,40}$/.test(planSlug)) {
    return json(400, { error: "plan_not_found" }, origin);
  }
  if (purpose === "extra_clothes" && !/^[0-9a-f-]{36}$/i.test(pickupId)) {
    return json(400, { error: "bad_request" }, origin);
  }
  if (purpose !== "subscription" && purpose !== "extra_clothes" && !/^[0-9a-f-]{36}$/i.test(order)) {
    return json(400, { error: "bad_request" }, origin);
  }

  const db = createClient(URL_, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = purpose === "subscription"
    ? await db.rpc("create_subscription_payment_intent", { _plan_slug: planSlug, _provider: provider })
    : purpose === "extra_clothes"
      ? await db.rpc("create_extra_clothes_payment_intent", { _pickup: pickupId, _provider: provider })
      : await db.rpc("create_payment_intent", { _order: order, _purpose: purpose, _provider: provider });
  if (error) return json(400, { error: error.message }, origin);

  const i = data as {
    reference: string;
    amount_kobo: number;
    email: string;
    name: string;
    phone: string | null;
    order_no?: number;
    plan_name?: string;
  };
  const site = callbackSite(req);
  const back = purpose === "subscription"
    ? `${site}/subscriptions?returning=1`
    : purpose === "extra_clothes"
      ? `${site}/account/extra-clothes?returning=1`
      : `${site}/orders/${order}?returning=1`;
  const description = purpose === "subscription"
    ? `Monthly plan: ${i.plan_name ?? planSlug}`
    : purpose === "extra_clothes"
      ? "Extra-clothes bill"
      : `Order #${i.order_no ?? ""}`;
  const metadata = {
    order_id: order || null,
    purpose,
    plan_slug: purpose === "subscription" ? planSlug : null,
    pickup_id: purpose === "extra_clothes" ? pickupId : null,
  };

  if (provider === "paystack") {
    const r = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${PAYSTACK}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: i.email,
        amount: i.amount_kobo,
        currency: "NGN",
        reference: i.reference,
        callback_url: back,
        metadata,
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.status) return json(502, { error: "provider_failed" }, origin);
    return json(200, { url: j.data.authorization_url, reference: i.reference }, origin);
  }

  const r = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${FLW}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: i.reference,
      amount: i.amount_kobo / 100,
      currency: "NGN",
      redirect_url: back,
      customer: { email: i.email, name: i.name, phonenumber: i.phone ?? undefined },
      customizations: { title: "LaundryPoint", description },
      meta: metadata,
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.status !== "success") return json(502, { error: "provider_failed" }, origin);
  return json(200, { url: j.data.link, reference: i.reference }, origin);
});
