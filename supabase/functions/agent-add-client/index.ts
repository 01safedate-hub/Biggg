// Onboard a new customer for the verified agent who personally introduced them.
// The client_invites row must exist before Auth creates the invited user: the
// private.accept_client_invite() auth trigger consumes that row and assigns ownership.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const clean = (v: unknown) => String(v ?? "").trim();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { error: "not_signed_in" });

  const caller = createClient(URL_, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const gate = await caller.rpc("agent_gate");
  if (gate.error || gate.data !== true) return json(403, { error: "not_allowed" });
  const me = await caller.auth.getUser();
  const callerId = me.data.user?.id;
  if (!callerId) return json(401, { error: "not_signed_in" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const name = clean(body.full_name).replace(/\s+/g, " ");
  const email = clean(body.email).toLowerCase();
  const digits = clean(body.phone).replace(/\D/g, "");
  if (name.length < 2 || name.length > 80) return json(400, { error: "invalid_name" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) {
    return json(400, { error: "invalid_email" });
  }
  if (digits.length < 10 || digits.length > 15) return json(400, { error: "invalid_phone" });

  const tail = digits.slice(-10);
  const phone = digits.startsWith("234") ? `+${digits}` : digits.length === 10 ? `0${digits}` : digits;
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  // Never claim an existing account, including one that has already ordered.
  // Check separately rather than interpolating user input into a PostgREST .or() filter.
  const [emailMatch, phoneMatch] = await Promise.all([
    admin.from("profiles").select("id").ilike("email", email).limit(1).maybeSingle(),
    admin.from("profiles").select("id").ilike("phone", `%${tail}`).limit(1).maybeSingle(),
  ]);
  if (emailMatch.error || phoneMatch.error) return json(500, { error: "client_check_failed" });
  if (emailMatch.data || phoneMatch.data) return json(409, { error: "client_exists" });

  // Expired invitations no longer reserve a prospective customer's details.
  const now = new Date().toISOString();
  const [expiredEmail, expiredPhone] = await Promise.all([
    admin.from("client_invites").update({ status: "expired" })
      .eq("status", "invited").lte("expires_at", now).ilike("email", email),
    admin.from("client_invites").update({ status: "expired" })
      .eq("status", "invited").lte("expires_at", now).ilike("phone", `%${tail}`),
  ]);
  if (expiredEmail.error || expiredPhone.error) return json(500, { error: "invite_check_failed" });

  const [pendingEmail, pendingPhone] = await Promise.all([
    admin.from("client_invites").select("id").eq("status", "invited")
      .gt("expires_at", now).ilike("email", email).limit(1).maybeSingle(),
    admin.from("client_invites").select("id").eq("status", "invited")
      .gt("expires_at", now).ilike("phone", `%${tail}`).limit(1).maybeSingle(),
  ]);
  if (pendingEmail.error || pendingPhone.error) return json(500, { error: "invite_check_failed" });
  if (pendingEmail.data || pendingPhone.data) return json(409, { error: "invite_pending" });

  // Critical ordering: the auth.users insert fires private.accept_client_invite().
  // Insert the invite first so that trigger can atomically link the new profile.
  const invite = await admin.from("client_invites").insert({
    agent_id: callerId,
    name,
    phone,
    email,
    status: "invited",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    resend_count: 0,
  }).select("id").single();
  if (invite.error || !invite.data) return json(500, { error: "invite_record_failed" });

  const sent = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name, phone },
    redirectTo: `${SITE}/auth/callback?next=/account`,
  });
  if (sent.error || !sent.data.user) {
    await admin.from("client_invites").update({ status: "cancelled" }).eq("id", invite.data.id);
    return json(400, { error: sent.error?.message ?? "create_failed" });
  }

  const clientId = sent.data.user.id;
  // The profile is created by the auth.users INSERT trigger. Ownership is
  // intentionally assigned later by private.accept_client_invite() when the
  // customer confirms their email, so onboarded_by must still be null here.
  const profile = await admin.from("profiles")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (profile.error || !profile.data) {
    await admin.from("client_invites").update({ status: "cancelled" }).eq("id", invite.data.id);
    await admin.auth.admin.deleteUser(clientId);
    return json(500, { error: "profile_creation_failed" });
  }

  const audit = await admin.from("audit_log").insert({
    actor_id: callerId,
    action: "add_client",
    table_name: "profiles",
    row_id: clientId,
    old_data: null,
    new_data: { invite_id: invite.data.id, agent_id: callerId, status: "invited" },
  });
  if (audit.error) {
    // The customer and invite are already valid. Do not roll back a delivered invite
    // because audit logging is temporarily unavailable.
    console.error("add_client_audit_failed", audit.error.message);
  }

  return json(200, { ok: true, id: clientId, invite_id: invite.data.id, expires_in_days: 7 });
});
