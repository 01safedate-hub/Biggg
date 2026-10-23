// Paystack tells us a payment finished. We trust nothing in the message: check the signature, then ask Paystack directly.
import { createClient } from "npm:@supabase/supabase-js@2";

const SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function hmacHex(key: string, body: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || !SECRET) return new Response("no", { status: 405 });
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") ?? "";
  if (!same(await hmacHex(SECRET, raw), sig)) return new Response("bad signature", { status: 401 });
  let ev: { event?: string; data?: { reference?: string } };
  try { ev = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  if (ev.event !== "charge.success" || !ev.data?.reference) return new Response("ignored", { status: 200 });

  const v = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ev.data.reference)}`, { headers: { Authorization: `Bearer ${SECRET}` } });
  const j = await v.json().catch(() => null);
  if (!v.ok || j?.data?.status !== "success" || j.data.currency !== "NGN") return new Response("not successful", { status: 200 });

  const { error } = await db.rpc("settle_online_payment", { _reference: ev.data.reference, _provider: "paystack", _amount_kobo: j.data.amount });
  if (error) return new Response(error.message, { status: 400 }); // Paystack will retry
  return new Response("ok", { status: 200 });
});
