// Lets the front desk register a walk-in customer. The caller must be an active secretary, admin or super admin (checked in
// the database as the caller). With an email, the customer gets a real account and an invitation to choose a password, so they
// can track their orders. Without one, a placeholder account is made that cannot receive email. An existing placeholder can be
// upgraded later with { upgrade_id, email }.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const clean = (v: unknown) => String(v ?? "").trim();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "not_signed_in" });
  const caller = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const gate = await caller.rpc("desk_gate");
  if (gate.error || gate.data !== true) return json(403, { error: "not_allowed" });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const mail = clean(b.email).toLowerCase();
  if (b.upgrade_id) {
    const uid = clean(b.upgrade_id);
    if (!EMAIL_RE.test(mail) || mail.length > 120) return json(400, { error: "invalid_email" });
    const { data: prof } = await admin.from("profiles").select("id,is_walk_in").eq("id", uid).maybeSingle();
    if (!prof || !prof.is_walk_in) return json(400, { error: "not_found" });
    const { data: taken } = await admin.from("profiles").select("id").ilike("email", mail).limit(1);
    if (taken && taken.length) return json(409, { error: "client_exists" });
    const upd = await admin.auth.admin.updateUserById(uid, { email: mail, email_confirm: true });
    if (upd.error) return json(400, { error: upd.error.message });
    await admin.from("profiles").update({ email: mail, is_walk_in: false }).eq("id", uid);
    await createClient(URL_, ANON, { auth: { persistSession: false } }).auth.resetPasswordForEmail(mail);
    return json(200, { ok: true, id: uid });
  }
  const name = clean(b.full_name).replace(/\s+/g, " ");
  const digits = clean(b.phone).replace(/\D/g, "");
  if (name.length < 2 || name.length > 80) return json(400, { error: "invalid_name" });
  if (digits.length < 10 || digits.length > 15) return json(400, { error: "invalid_phone" });
  const tail = digits.slice(-10);

  const { data: found } = await admin.from("profiles").select("id,full_name,phone").like("phone", `%${tail}`).limit(1);
  if (found && found.length) return json(200, { ok: true, existing: true, id: found[0].id, name: found[0].full_name, phone: found[0].phone });

  if (mail) {
    if (!EMAIL_RE.test(mail) || mail.length > 120) return json(400, { error: "invalid_email" });
    const { data: taken } = await admin.from("profiles").select("id").ilike("email", mail).limit(1);
    if (taken && taken.length) return json(409, { error: "client_exists" });
    const phoneFull = digits.startsWith("234") ? `+${digits}` : digits.length === 10 ? `0${digits}` : digits;
    const inv = await admin.auth.admin.inviteUserByEmail(mail, { data: { full_name: name, phone: phoneFull }, redirectTo: `${SITE}/auth/confirm` });
    if (inv.error || !inv.data.user) return json(400, { error: inv.error?.message ?? "create_failed" });
    await admin.from("profiles").update({ full_name: name }).eq("id", inv.data.user.id);
    return json(200, { ok: true, existing: false, id: inv.data.user.id, name, phone: digits });
  }
  const email = `walkin-${tail}@walkin.laundrypoint.invalid`;
  const pw = crypto.randomUUID() + crypto.randomUUID();
  const created = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name, phone: digits.startsWith("234") ? `+${digits}` : digits.length === 10 ? `0${digits}` : digits } });
  if (created.error || !created.data.user) return json(400, { error: created.error?.message ?? "create_failed" });
  const id = created.data.user.id;
  const up = await admin.from("profiles").update({ is_walk_in: true, full_name: name }).eq("id", id);
  if (up.error) return json(500, { error: "profile_failed" });
  return json(200, { ok: true, existing: false, id, name, phone: digits });
});
