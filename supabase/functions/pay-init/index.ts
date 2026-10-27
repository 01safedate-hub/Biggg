// Starts an online payment. The amount comes from the database (create_payment_intent), never from the phone.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";
const PAYSTACK = Deno.env.get("PAYSTACK_SECRET_KEY");
const FLW = Deno.env.get("FLUTTERWAVE_SECRET_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req) => {
  // Browsers send a CORS preflight before authenticated JSON POST requests.
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "not_signed_in" });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const order = String(b.order_id ?? ""), purpose = String(b.purpose ?? ""), provider = String(b.provider ?? ""), planSlug = String(b.plan_slug ?? ""), pickupId = String(b.pickup_id ?? "");
  if (provider !== "paystack" && provider !== "flutterwave") return json(400, { error: "unsupported_provider" });
  if (provider === "paystack" && !PAYSTACK) return json(503, { error: "provider_not_configured" });
  if (provider === "flutterwave" && !FLW) return json(503, { error: "provider_not_configured" });

  const db = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  if (purpose === "subscription" && !/^[a-z0-9_]{2,40}$/.test(planSlug)) return json(400, { error: "plan_not_found" });
  if (purpose === "extra_clothes" && !/^[0-9a-f-]{36}$/i.test(pickupId)) return json(400, { error: "bad_request" });
  if (!["subscription", "extra_clothes"].includes(purpose) && !/^[0-9a-f-]{36}$/i.test(order)) return json(400, { error: "bad_request" });
  const { data, error } = purpose === "subscription"
    ? await db.rpc("create_subscription_payment_intent", { _plan_slug: planSlug, _provider: provider })
    : purpose === "extra_clothes"
      ? await db.rpc("create_extra_clothes_payment_intent", { _pickup: pickupId, _provider: provider })
      : await db.rpc("create_payment_intent", { _order: order, _purpose: purpose, _provider: provider });
  if (error) return json(400, { error: error.message });
  const i = data as { reference: string; amount_kobo: number; email: string; name: string; phone: string | null; order_no?: number; plan_name?: string };
  const back = purpose === "subscription" ? `${SITE}/subscriptions?returning=1` : purpose === "extra_clothes" ? `${SITE}/account/extra-clothes?returning=1` : `${SITE}/orders/${order}?returning=1`;

  if (provider === "paystack") {
    const r = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST", headers: { Authorization: `Bearer ${PAYSTACK}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: i.email, amount: i.amount_kobo, currency: "NGN", reference: i.reference, callback_url: back, metadata: { order_id: order, purpose } }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.status) return json(502, { error: "provider_failed" });
    return json(200, { url: j.data.authorization_url, reference: i.reference });
  }

  const r = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST", headers: { Authorization: `Bearer ${FLW}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: i.reference, amount: i.amount_kobo / 100, currency: "NGN", redirect_url: back,
      customer: { email: i.email, name: i.name, phonenumber: i.phone ?? undefined },
      customizations: { title: "LaundryPoint", description: purpose === "subscription" ? `Monthly plan: ${i.plan_name}` : `Order #${i.order_no}` }, meta: { order_id: order, purpose },
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.status !== "success") return json(502, { error: "provider_failed" });
  return json(200, { url: j.data.link, reference: i.reference });
});
