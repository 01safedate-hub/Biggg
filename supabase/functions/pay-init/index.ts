// Starts an online payment. The amount comes from the database (create_payment_intent), never from the phone.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.com";

// Keep payment returns on the deployment where checkout started (especially Netlify PR previews).
// Only accept our production domain or Netlify deploy-preview domains from the browser Origin;
// never use an arbitrary Origin as a redirect target.
function callbackSite(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const u = new URL(origin);
      const host = u.hostname.toLowerCase();
      if (u.protocol === "https:" && (host === "laundrypoint.com" || host === "www.laundrypoint.com" || host.endsWith(".netlify.app"))) {
        return u.origin;
      }
    } catch { /* fall back to configured site */ }
  }
  return SITE.replace(/\\/$/, "");
}
const PAYSTACK = Deno.env.get("PAYSTACK_SECRET_KEY");
const FLW = Deno.env.get("FLUTTERWAVE_SECRET_KEY");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "not_signed_in" });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const order = String(b.order_id ?? ""), purpose = String(b.purpose ?? ""), provider = String(b.provider ?? "");
  if (provider === "paystack" && !PAYSTACK) return json(503, { error: "provider_not_configured" });
  if (provider === "flutterwave" && !FLW) return json(503, { error: "provider_not_configured" });

  const db = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await db.rpc("create_payment_intent", { _order: order, _purpose: purpose, _provider: provider });
  if (error) return json(400, { error: error.message });
  const i = data as { reference: string; amount_kobo: number; email: string; name: string; phone: string | null; order_no: number };
  const back = `${callbackSite(req)}/orders/${order}?returning=1`;

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
      customizations: { title: "LaundryPoint", description: `Order #${i.order_no}` }, meta: { order_id: order, purpose },
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.status !== "success") return json(502, { error: "provider_failed" });
  return json(200, { url: j.data.link, reference: i.reference });
});
