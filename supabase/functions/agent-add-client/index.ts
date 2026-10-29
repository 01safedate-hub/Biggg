// Lets a delivery or commission agent, admin or super admin add a client they brought in. The client gets an invitation email to choose a
// password, and the client is recorded as belonging to the person who added them. The caller is checked in the database as
// themselves (agent_gate). An existing person is never taken over: if the email or phone is already registered, nothing changes.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const clean = (v: unknown) => String(v ?? "").trim();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "not_signed_in" });
  const caller = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const gate = await caller.rpc("agent_gate");
  if (gate.error || gate.data !== true) return json(403, { error: "not_allowed" });
  const me = await caller.auth.getUser();
  const callerId = me.data.user?.id;
  if (!callerId) return json(401, { error: "not_signed_in" });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const name = clean(b.full_name).replace(/\s+/g, " ");
  const email = clean(b.email).toLowerCase();
  const digits = clean(b.phone).replace(/\D/g, "");
  if (name.length < 2 || name.length > 80) return json(400, { error: "invalid_name" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return json(400, { error: "invalid_email" });
  if (digits.length < 10 || digits.length > 15) return json(400, { error: "invalid_phone" });
  const tail = digits.slice(-10);
  const phone = digits.startsWith("234") ? `+${digits}` : digits.length === 10 ? `0${digits}` : digits;

  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: dup } = await admin.from("profiles").select("id").or(`email.ilike.${email},phone.like.%${tail}`).limit(1);
  if (dup && dup.length) return json(409, { error: "client_exists" });

  const inv = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: name, phone }, redirectTo: `${SITE}/auth/confirm` });
  if (inv.error || !inv.data.user) return json(400, { error: inv.error?.message ?? "create_failed" });
  const id = inv.data.user.id;
  const up = await admin.from("profiles").update({ onboarded_by: callerId, onboarded_at: new Date().toISOString(), full_name: name }).eq("id", id);
  if (up.error) return json(500, { error: "profile_failed" });
  await admin.from("audit_log").insert({ actor_id: callerId, action: "add_client", table_name: "profiles", row_id: id, old_data: null, new_data: { onboarded_by: callerId } });
  return json(200, { ok: true, id });
});
