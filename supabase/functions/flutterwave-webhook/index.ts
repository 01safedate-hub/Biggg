// Flutterwave tells us a payment finished. Check the secret hash, then ask Flutterwave directly before crediting anything.
import { createClient } from "npm:@supabase/supabase-js@2";

const HASH = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH");
const SECRET = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || !HASH || !SECRET) return new Response("no", { status: 405 });
  if (!same(req.headers.get("verif-hash") ?? "", HASH)) return new Response("bad hash", { status: 401 });
  // deno-lint-ignore no-explicit-any
  let ev: { event?: string; data?: any };
  try { ev = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  // A customer queried the charge with their bank. The secret hash proves it came from Flutterwave; the clothes go on hold.
  if (/charge.?back|dispute/i.test(String(ev.event ?? ""))) {
    const dref = ev.data?.tx_ref ?? ev.data?.transaction?.tx_ref ?? ev.data?.flw_ref;
    if (!dref) return new Response("ignored", { status: 200 });
    const due = typeof ev.data?.due_date === "string" && !Number.isNaN(Date.parse(ev.data.due_date)) ? new Date(ev.data.due_date).toISOString() : null;
    const { error } = await db.rpc("record_dispute_from_provider", { _reference: String(dref), _provider: "flutterwave", _external: String(ev.data?.id ?? ""), _reason: String(ev.data?.reason ?? ev.data?.comment ?? ""), _due: due as string });
    return error ? new Response(error.message, { status: 400 }) : new Response("ok", { status: 200 });
  }
  const ref = ev.data?.tx_ref;
  if (ev.event !== "charge.completed" || !ref) return new Response("ignored", { status: 200 });

  const v = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${SECRET}` } });
  const j = await v.json().catch(() => null);
  if (!v.ok || j?.data?.status !== "successful" || j.data.currency !== "NGN" || j.data.tx_ref !== ref) return new Response("not successful", { status: 200 });

  const { error } = await db.rpc("settle_online_payment", { _reference: ref, _provider: "flutterwave", _amount_kobo: Math.round(Number(j.data.amount) * 100) });
  if (error) return new Response(error.message, { status: 400 });
  return new Response("ok", { status: 200 });
});
