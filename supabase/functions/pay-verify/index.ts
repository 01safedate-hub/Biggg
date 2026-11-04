// Fallback for a late or missed webhook. Supports both ordinary orders and invoice-linked
// subscription payments. The caller must own the payment; provider verification is authoritative.
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
  const reference = String(b.reference ?? "");
  if (!reference && !/^[0-9a-f-]{36}$/i.test(order)) return json(400, { error: "bad_request" });
  if (reference && (reference.length > 128 || !/^[A-Za-z0-9_-]+$/.test(reference))) return json(400, { error: "bad_request" });

  // Resolve the authenticated customer first, then explicitly constrain the payment query to them.
  const user = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await user.auth.getUser();
  if (authError || !authData.user) return json(401, { error: "not_signed_in" });

  let query = user.from("payments").select("reference,mode,amount_kobo")
    .eq("customer_id", authData.user.id).eq("kind", "payment").eq("status", "pending");
  query = reference ? query.eq("reference", reference) : query.eq("order_id", order);
  const { data: pending, error } = await query;
  if (error) return json(400, { error: "payment_lookup_failed" });
  if (!pending?.length) return json(200, { checked: 0, settled: 0, message: "no_pending_payment" });

  const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  let settled = 0;
  for (const p of pending) {
    try {
      if (p.mode === "paystack" && PAYSTACK) {
        const v = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(p.reference)}`, { headers: { Authorization: `Bearer ${PAYSTACK}` } });
        const j = await v.json().catch(() => null);
        if (v.ok && j?.data?.status === "success" && j.data.currency === "NGN" && j.data.reference === p.reference) {
          const { error: settleError } = await db.rpc("settle_online_payment", {
            _reference: p.reference, _provider: "paystack", _amount_kobo: Number(j.data.amount),
          });
          if (!settleError) settled++;
        }
      } else if (p.mode === "flutterwave" && FLW) {
        const v = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(p.reference)}`, { headers: { Authorization: `Bearer ${FLW}` } });
        const j = await v.json().catch(() => null);
        if (v.ok && j?.data?.status === "successful" && j.data.currency === "NGN" && j.data.tx_ref === p.reference) {
          const amountKobo = Math.round(Number(j.data.amount) * 100);
          if (Number.isSafeInteger(amountKobo) && amountKobo > 0) {
            const { error: settleError } = await db.rpc("settle_online_payment", {
              _reference: p.reference, _provider: "flutterwave", _amount_kobo: amountKobo,
            });
            if (!settleError) settled++;
          }
        }
      }
    } catch {
      // Keep it pending; the provider webhook or a later customer retry can settle it.
    }
  }
  return json(200, { checked: pending.length, settled });
});
