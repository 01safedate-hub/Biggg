// Lets the front desk make a payment link for a delivery fee, to read out or send to the customer. The amount comes from the
// database (desk_delivery_intent, checked as the caller), never from the phone. Payment is confirmed by the provider's webhook.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";
const PAYSTACK = Deno.env.get("PAYSTACK_SECRET_KEY");
const FLW = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
const FALLBACK_EMAIL = Deno.env.get("PAY_FALLBACK_EMAIL") ?? "payments@laundrypoint.app";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "not_signed_in" });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const order = String(b.order_id ?? ""), provider = String(b.provider ?? "paystack");
  if (provider === "paystack" && !PAYSTACK) return json(503, { error: "provider_not_configured" });
  if (provider === "flutterwave" && !FLW) return json(503, { error: "provider_not_configured" });

  const db = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await db.rpc("desk_delivery_intent", { _order: order, _provider: provider });
  if (error) return json(400, { error: error.message });
  const i = data as { reference: string; amount_kobo: number; email: string | null; name: string; phone: string | null; order_no: number };
  const email = i.email && !i.email.endsWith(".invalid") ? i.email : FALLBACK_EMAIL;
  const back = `${SITE}/paid`;

  if (provider === "paystack") {
    const r = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST", headers: { Authorization: `Bearer ${PAYSTACK}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, amount: i.amount_kobo, currency: "NGN", reference: i.reference, callback_url: back, metadata: { order_id: order, purpose: "delivery_fare", made_at_desk: true } }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.status) return json(502, { error: "provider_failed" });
    return json(200, { url: j.data.authorization_url, reference: i.reference, amount_kobo: i.amount_kobo });
  }

  const r = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST", headers: { Authorization: `Bearer ${FLW}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: i.reference, amount: i.amount_kobo / 100, currency: "NGN", redirect_url: back,
      customer: { email, name: i.name, phonenumber: i.phone ?? undefined },
      customizations: { title: "LaundryPoint", description: `Delivery for order #${i.order_no}` }, meta: { order_id: order, purpose: "delivery_fare" },
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.status !== "success") return json(502, { error: "provider_failed" });
  return json(200, { url: j.data.link, reference: i.reference, amount_kobo: i.amount_kobo });
});
