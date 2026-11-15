// Registers a walk-in or quick-order customer. Callers (checked in the database as the caller):
//   * the front desk (desk_gate: active secretary, admin or super admin), and
//   * field agents allowed to take quick orders (quick_order_gate: delivery agents, verified commission agents).
// With an email, the customer gets a real account and an invitation to choose a password, so they can track their orders.
// Without one, a placeholder account is made that cannot receive email. A placeholder can be upgraded later with
// { upgrade_id, email }; agents may only upgrade customers on their own quick orders.
// Commission-only agents may not create customers here: their quick orders are for clients they already signed up.
// Nothing here sets onboarded_by, so no commission is credited through this path.
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
  const isDesk = !gate.error && gate.data === true;
  let isAgent = false;
  if (!isDesk) {
    const qg = await caller.rpc("quick_order_gate");
    isAgent = !qg.error && qg.data === true;
  }
  if (!isDesk && !isAgent) return json(403, { error: "not_allowed" });
  const me = isAgent ? (await caller.auth.getUser(auth.replace(/^Bearer\s+/i, ""))).data.user?.id ?? null : null;
  if (isAgent && !me) return json(401, { error: "not_signed_in" });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const mail = clean(b.email).toLowerCase();
  if (b.upgrade_id) {
    const uid = clean(b.upgrade_id);
    if (!EMAIL_RE.test(mail) || mail.length > 120) return json(400, { error: "invalid_email" });
    if (isAgent) {
      const { data: mine } = await admin.from("orders").select("id").eq("customer_id", uid).eq("pickup_agent_id", me).eq("quick_order", true).limit(1);
      if (!mine || !mine.length) return json(403, { error: "not_allowed" });
    }
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
  // Only an explicit true from the staff form records WhatsApp consent. Missing/false stays opted out.
  const whatsappOptIn = b.whatsapp_opt_in === true;
  if (name.length < 2 || name.length > 80) return json(400, { error: "invalid_name" });
  if (digits.length < 10 || digits.length > 15) return json(400, { error: "invalid_phone" });
  const tail = digits.slice(-10);

  let commissionOnly = false;
  if (isAgent) {
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", me);
    const rs = (roles ?? []).map((r: { role: string }) => r.role);
    commissionOnly = rs.includes("commission_agent") && !rs.includes("delivery_agent");
  }
  const { data: found } = await admin.from("profiles").select("id,full_name,phone,onboarded_by").like("phone", `%${tail}`).limit(1);
  if (found && found.length) {
    const f = found[0];
    if (isAgent) {
      // Agents see only the first name, and a staff account is never offered as a customer.
      const { data: staffRole } = await admin.from("user_roles").select("role").eq("user_id", f.id).limit(1);
      if (staffRole && staffRole.length) return json(400, { error: "client_exists" });
      if (commissionOnly && f.onboarded_by !== me) return json(403, { error: "not_own_client" });
      return json(200, { ok: true, existing: true, id: f.id, name: String(f.full_name ?? "").split(" ")[0], phone: f.phone });
    }
    return json(200, { ok: true, existing: true, id: f.id, name: f.full_name, phone: f.phone });
  }
  if (commissionOnly) return json(403, { error: "not_own_client" });

  if (mail) {
    if (!EMAIL_RE.test(mail) || mail.length > 120) return json(400, { error: "invalid_email" });
    const { data: taken } = await admin.from("profiles").select("id").ilike("email", mail).limit(1);
    if (taken && taken.length) return json(409, { error: "client_exists" });
    const phoneFull = digits.startsWith("234") ? `+${digits}` : digits.length === 10 ? `0${digits}` : digits;
    const inv = await admin.auth.admin.inviteUserByEmail(mail, { data: { full_name: name, phone: phoneFull, whatsapp_opt_in: whatsappOptIn }, redirectTo: `${SITE}/auth/callback?next=/account` });
    if (inv.error || !inv.data.user) return json(400, { error: inv.error?.message ?? "create_failed" });
    await admin.from("profiles").update({ full_name: name, whatsapp_opt_in: whatsappOptIn, whatsapp_opt_in_at: whatsappOptIn ? new Date().toISOString() : null }).eq("id", inv.data.user.id);
    return json(200, { ok: true, existing: false, id: inv.data.user.id, name, phone: digits });
  }
  const email = `walkin-${tail}@walkin.laundrypoint.invalid`;
  const pw = crypto.randomUUID() + crypto.randomUUID();
  const created = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name, phone: digits.startsWith("234") ? `+${digits}` : digits.length === 10 ? `0${digits}` : digits, whatsapp_opt_in: whatsappOptIn } });
  if (created.error || !created.data.user) return json(400, { error: created.error?.message ?? "create_failed" });
  const id = created.data.user.id;
  const up = await admin.from("profiles").update({ is_walk_in: true, full_name: name, whatsapp_opt_in: whatsappOptIn, whatsapp_opt_in_at: whatsappOptIn ? new Date().toISOString() : null }).eq("id", id);
  if (up.error) return json(500, { error: "profile_failed" });
  return json(200, { ok: true, existing: false, id, name, phone: digits });
});
