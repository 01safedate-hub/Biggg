// Fallback for a late or missed webhook. When the customer returns from the payment page, the app asks us
// to check any pending payment on that order directly with the provider. We only credit what the provider
// confirms, for the exact amount, through the same settle_online_payment the webhooks use.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYSTACK = Deno.env.get("PAYSTACK_SECRET_KEY");
const FLW = Deno.env.get("FLUTTERWAVE_SECRET_KEY");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "not_signed_in" });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const order = String(b.order_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(order)) return json(400, { error: "bad_request" });

  // Row-level security limits this to the signed-in customer's own payments.
  const user = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: pending, error } = await user.from("payments").select("reference,mode,amount_kobo").eq("order_id", order).eq("kind", "payment").eq("status", "pending");
  if (error) return json(400, { error: error.message });

  const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  let settled = 0;
  for (const p of pending ?? []) {
    try {
      if (p.mode === "paystack" && PAYSTACK) {
        const v = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(p.reference)}`, { headers: { Authorization: `Bearer ${PAYSTACK}` } });
        const j = await v.json().catch(() => null);
        if (v.ok && j?.data?.status === "success" && j.data.currency === "NGN") {
          const { error: e } = await db.rpc("settle_online_payment", { _reference: p.reference, _provider: "paystack", _amount_kobo: j.data.amount });
          if (!e) settled++;
        }
      } else if (p.mode === "flutterwave" && FLW) {
        const v = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(p.reference)}`, { headers: { Authorization: `Bearer ${FLW}` } });
        const j = await v.json().catch(() => null);
        if (v.ok && j?.data?.status === "successful" && j.data.currency === "NGN" && j.data.tx_ref === p.reference) {
          const { error: e } = await db.rpc("settle_online_payment", { _reference: p.reference, _provider: "flutterwave", _amount_kobo: Math.round(Number(j.data.amount) * 100) });
          if (!e) settled++;
        }
      }
    } catch { /* leave it pending; the webhook or the next check will settle it */ }
  }
  return json(200, { checked: (pending ?? []).length, settled });
});
