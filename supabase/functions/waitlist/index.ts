// Public endpoint: join the waitlist for an area we do not serve yet.
// verify_jwt is off so visitors can call it. Writes use the service role (auto-provided).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const email = String(b.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "invalid_email" }, 400);
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && v >= lo && v <= hi ? v : null);
  const area = typeof b.area === "string" ? b.area.slice(0, 120) : null;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { error } = await db.from("waitlist").insert({
    email, detected_area: area, lat: num(b.lat, -90, 90), lng: num(b.lng, -180, 180),
  });
  // Already on the list counts as success, so we never reveal who has signed up.
  if (error && error.code !== "23505") return json({ error: "failed" }, 500);

  if (!error) {
    await db.from("email_outbox").insert({
      to_email: email, template: "waitlist_confirmation", payload: { area },
      idempotency_key: `waitlist:${email}`,
    });
  }
  return json({ ok: true });
});
