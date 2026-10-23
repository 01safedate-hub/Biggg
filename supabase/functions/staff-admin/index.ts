// Super-admin-only staff actions that need the service key: invite by email, resend an invite, and suspend/reinstate sign-in.
// verify_jwt is on, and every action is re-checked in the database as the caller (find_user_by_email / set_staff_* all
// require an active super admin), so the service key is only used after the database has said yes.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";
const ROLES = ["delivery_agent", "cashier", "accountant", "admin", "super_admin"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const clean = (v: unknown) => String(v ?? "").trim();

function cleanPhone(v: string) {
  const t = v.replace(/[\s()-]/g, "");
  const d = t.replace(/\D/g, "");
  if (d.length < 10 || d.length > 15) return null;
  return t.startsWith("+") ? `+${d}` : d;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "not_signed_in" });

  const asCaller = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const action = clean(b.action);

  // Gate: the database confirms the caller is an active super admin (it raises not_super_admin otherwise).
  const gate = await asCaller.rpc("find_user_by_email", { _email: clean(b.email) || "nobody@invalid.local" });
  if (gate.error) return json(403, { error: gate.error.message.includes("not_super_admin") ? "not_super_admin" : "gate_failed" });

  if (action === "invite") {
    const email = clean(b.email).toLowerCase();
    const fullName = clean(b.full_name);
    const phone = cleanPhone(clean(b.phone));
    const roles = Array.isArray(b.roles) ? (b.roles as unknown[]).map(String) : [];
    if (!EMAIL.test(email)) return json(400, { error: "invalid_email" });
    if (fullName.length < 2 || fullName.length > 80) return json(400, { error: "invalid_name" });
    if (!phone) return json(400, { error: "invalid_phone" });
    if (roles.length === 0 || roles.some((r) => !ROLES.includes(r))) return json(400, { error: "invalid_role" });

    const existing = gate.data as { id: string; full_name: string; status: string; roles: string[] } | null;
    if (existing) {
      // The person already has an account (a customer, or earlier staff): grant the roles instead of inviting again.
      const r = await asCaller.rpc("set_staff_roles", { _user: existing.id, _roles: Array.from(new Set([...existing.roles, ...roles])) });
      if (r.error) return json(400, { error: r.error.message });
      return json(200, { ok: true, mode: "existing_account", name: existing.full_name });
    }

    const inv = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, phone }, redirectTo: `${SITE}/auth/confirm` });
    if (inv.error || !inv.data.user) return json(400, { error: inv.error?.message ?? "invite_failed" });
    const role = await asCaller.rpc("set_staff_roles", { _user: inv.data.user.id, _roles: roles });
    if (role.error) {
      await admin.auth.admin.deleteUser(inv.data.user.id); // do not leave an account with no role behind
      return json(400, { error: role.error.message });
    }
    return json(200, { ok: true, mode: "invited" });
  }

  if (action === "create") {
    // The super admin sets a first password. The person is forced to change it at first sign-in.
    const email = clean(b.email).toLowerCase();
    const fullName = clean(b.full_name);
    const phone = cleanPhone(clean(b.phone));
    const password = String(b.password ?? "");
    const roles = Array.isArray(b.roles) ? (b.roles as unknown[]).map(String) : [];
    if (!EMAIL.test(email)) return json(400, { error: "invalid_email" });
    if (fullName.length < 2 || fullName.length > 80) return json(400, { error: "invalid_name" });
    if (!phone) return json(400, { error: "invalid_phone" });
    if (roles.length === 0 || roles.some((r) => !ROLES.includes(r))) return json(400, { error: "invalid_role" });
    if (password.length < 10 || password.length > 72 || !/[a-zA-Z]/.test(password) || !/\d/.test(password) || password.toLowerCase().includes(email.split("@")[0])) {
      return json(400, { error: "weak_password" });
    }
    if (gate.data) return json(400, { error: "account_exists" });

    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, phone } });
    if (made.error || !made.data.user) return json(400, { error: made.error?.message ?? "create_failed" });
    const uid = made.data.user.id;
    const role = await asCaller.rpc("set_staff_roles", { _user: uid, _roles: roles });
    if (role.error) {
      await admin.auth.admin.deleteUser(uid);
      return json(400, { error: role.error.message });
    }
    const flag = await admin.rpc("flag_initial_password", { _user: uid });
    if (flag.error) {
      await admin.auth.admin.deleteUser(uid);
      return json(400, { error: "flag_failed" });
    }
    return json(200, { ok: true, mode: "created", user_id: uid });
  }

  if (action === "resend") {
    const id = clean(b.user_id);
    const list = await asCaller.rpc("staff_list");
    const row = ((list.data ?? []) as { id: string; email: string; accepted: boolean }[]).find((s) => s.id === id);
    if (!row) return json(404, { error: "user_not_found" });
    if (row.accepted) return json(400, { error: "already_accepted" });
    const inv = await admin.auth.admin.inviteUserByEmail(row.email, { redirectTo: `${SITE}/auth/confirm` });
    if (inv.error) return json(400, { error: inv.error.message });
    return json(200, { ok: true });
  }

  if (action === "set_status") {
    const id = clean(b.user_id);
    const status = clean(b.status);
    const r = await asCaller.rpc("set_staff_status", { _user: id, _status: status, _reason: clean(b.reason) || null });
    if (r.error) return json(400, { error: r.error.message });
    // Also stop new sign-ins. Existing access tokens are already useless because the database checks status on every request.
    const ban = await admin.auth.admin.updateUserById(id, { ban_duration: status === "active" ? "none" : "876000h" });
    return json(200, { ok: true, sign_in_blocked: !ban.error && status !== "active", warning: ban.error ? "status_saved_but_sign_in_block_failed" : undefined });
  }

  return json(400, { error: "unknown_action" });
});
