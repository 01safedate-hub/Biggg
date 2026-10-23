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
  let ev: { event?: string; data?: { tx_ref?: string } };
  try { ev = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const ref = ev.data?.tx_ref;
  if (ev.event !== "charge.completed" || !ref) return new Response("ignored", { status: 200 });

  const v = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${SECRET}` } });
  const j = await v.json().catch(() => null);
  if (!v.ok || j?.data?.status !== "successful" || j.data.currency !== "NGN" || j.data.tx_ref !== ref) return new Response("not successful", { status: 200 });

  const { error } = await db.rpc("settle_online_payment", { _reference: ref, _provider: "flutterwave", _amount_kobo: Math.round(Number(j.data.amount) * 100) });
  if (error) return new Response(error.message, { status: 400 });
  return new Response("ok", { status: 200 });
});
