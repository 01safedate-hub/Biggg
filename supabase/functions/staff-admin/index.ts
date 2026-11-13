// Super-admin-only staff actions that need the service key: invite by email, resend an invite, and suspend/reinstate sign-in.
// verify_jwt is on, and every action is re-checked in the database as the caller (find_user_by_email / set_staff_* all
// require an active super admin), so the service key is only used after the database has said yes.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";
const ROLES = ["delivery_agent", "commission_agent", "cashier", "secretary", "washer", "inspector", "cleaning_lead", "cleaner", "scheduler", "admin", "super_admin"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const clean = (v: unknown) => String(v ?? "").trim();

function cleanPhone(v: string) {
  const t = v.replace(/[\s()-]/g, "");
  const d = t.replace(/\D/g, "");
  if (d.length < 10 || d.length > 15) return null;
  return t.startsWith("+") ? `+${d}` : d;
}


// Anyone who works from a hub (desk staff, washers, delivery agents) needs a station: walk-in orders, hub drop-offs,
// the wash queue and check-in all use it. Super admins, admins and commission-only agents may have one but do not need it.
// Cleaning staff work at customers' homes, so a hub station is optional for them too.
const STATION_OPTIONAL = new Set(["super_admin", "admin", "commission_agent", "inspector", "cleaning_lead", "cleaner", "scheduler"]);
const stationNeeded = (roles: string[]) => roles.some((r) => !STATION_OPTIONAL.has(r));

// Validate first, save later: nothing (roles, invitation email, account) is created until the station is known to be valid.
async function checkStation(admin: ReturnType<typeof createClient>, value: unknown, roles: string[]): Promise<{ error: string | null; id: string | null }> {
  const stationId = clean(value);
  if (!stationId) return { error: stationNeeded(roles) ? "station_required" : null, id: null };
  if (!/^[0-9a-f-]{36}$/i.test(stationId)) return { error: "invalid_station", id: null };
  const { data: zone, error: zoneError } = await admin.from("zones").select("id").eq("id", stationId).eq("kind", "area").eq("is_live", true).not("centre_lat", "is", null).not("centre_lng", "is", null).maybeSingle();
  if (zoneError || !zone) return { error: "invalid_station", id: null };
  return { error: null, id: stationId };
}

async function saveStation(admin: ReturnType<typeof createClient>, userId: string, stationId: string | null) {
  // No station: clear an existing one, but do not create an empty staff profile for someone who never had one.
  const { error } = stationId
    ? await admin.from("staff_profiles").upsert({ user_id: userId, station_zone_id: stationId }, { onConflict: "user_id" })
    : await admin.from("staff_profiles").update({ station_zone_id: null }).eq("user_id", userId);
  return error ? "station_save_failed" : null;
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
      const allRoles = Array.from(new Set([...existing.roles, ...roles]));
      const station = await checkStation(admin, b.station_zone_id, allRoles);
      if (station.error) return json(400, { error: station.error });
      const r = await asCaller.rpc("set_staff_roles", { _user: existing.id, _roles: allRoles });
      if (r.error) return json(400, { error: r.error.message });
      if (station.id) {
        const saveError = await saveStation(admin, existing.id, station.id);
        if (saveError) return json(400, { error: saveError });
      }
      return json(200, { ok: true, mode: "existing_account", name: existing.full_name });
    }

    const station = await checkStation(admin, b.station_zone_id, roles);
    if (station.error) return json(400, { error: station.error });
    const inv = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, phone }, redirectTo: `${SITE}/auth/callback?next=/welcome` });
    if (inv.error || !inv.data.user) return json(400, { error: inv.error?.message ?? "invite_failed" });
    const role = await asCaller.rpc("set_staff_roles", { _user: inv.data.user.id, _roles: roles });
    if (role.error) {
      await admin.auth.admin.deleteUser(inv.data.user.id); // do not leave an account with no role behind
      return json(400, { error: role.error.message });
    }
    if (station.id) {
      const saveError = await saveStation(admin, inv.data.user.id, station.id);
      if (saveError) return json(200, { ok: true, mode: "invited", warning: "station_not_saved" }); // invite already sent; set the station on the Staff page
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
    const station = await checkStation(admin, b.station_zone_id, roles);
    if (station.error) return json(400, { error: station.error });

    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, phone } });
    if (made.error || !made.data.user) return json(400, { error: made.error?.message ?? "create_failed" });
    const uid = made.data.user.id;
    const role = await asCaller.rpc("set_staff_roles", { _user: uid, _roles: roles });
    if (role.error) {
      await admin.auth.admin.deleteUser(uid);
      return json(400, { error: role.error.message });
    }
    if (station.id) {
      const saveError = await saveStation(admin, uid, station.id);
      if (saveError) { await admin.auth.admin.deleteUser(uid); return json(400, { error: saveError }); }
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
    const inv = await admin.auth.admin.inviteUserByEmail(row.email, { redirectTo: `${SITE}/auth/callback?next=/welcome` });
    if (inv.error) return json(400, { error: inv.error.message });
    return json(200, { ok: true });
  }

  if (action === "set_station") {
    const id = clean(b.user_id);
    const stationId = clean(b.station_zone_id);
    const list = await asCaller.rpc("staff_list");
    if (list.error) return json(400, { error: list.error.message });
    const target = ((list.data ?? []) as { id: string; roles: string[] }[]).find((s) => s.id === id);
    if (!target) return json(404, { error: "user_not_found" });
    const station = await checkStation(admin, stationId, target.roles);
    if (station.error) return json(400, { error: station.error });
    const saveError = await saveStation(admin, id, station.id);
    if (saveError) return json(400, { error: saveError });
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
