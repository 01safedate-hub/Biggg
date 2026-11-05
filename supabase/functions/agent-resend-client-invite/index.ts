import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { error: "not_signed_in" });

  const caller = createClient(URL_, ANON, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const gate = await caller.rpc("agent_gate");
  if (gate.error || gate.data !== true) return json(403, { error: "not_allowed" });
  const { data: authData } = await caller.auth.getUser();
  const agentId = authData.user?.id;
  if (!agentId) return json(401, { error: "not_signed_in" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const inviteId = String(body.invite_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(inviteId)) return json(400, { error: "invalid_invite" });

  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: invite, error: inviteError } = await admin.from("client_invites")
    .select("id,agent_id,name,email,phone,status,expires_at,resend_count")
    .eq("id", inviteId).eq("agent_id", agentId).maybeSingle();
  if (inviteError) return json(500, { error: "invite_lookup_failed" });
  if (!invite) return json(404, { error: "invite_not_found" });
  if (invite.status !== "invited" || new Date(invite.expires_at).getTime() <= Date.now()) {
    return json(409, { error: "invite_expired" });
  }
  if (invite.resend_count >= 2) return json(409, { error: "resend_limit_reached" });

  const generated = await admin.auth.admin.generateLink({
    type: "invite",
    email: invite.email,
    options: {
      redirectTo: `${SITE}/auth/callback?next=/account`,
      data: { full_name: invite.name, phone: invite.phone },
    },
  });
  const actionLink = generated.data?.properties?.action_link;
  if (generated.error || !actionLink) {
    console.error("client_invite_link_failed", generated.error?.message ?? "missing_action_link");
    return json(400, { error: "invite_link_generation_failed" });
  }

  // This RPC locks the row, verifies ownership/expiry and consumes one of the two resends.
  const { data: resend, error: resendError } = await caller.rpc("resend_client_invite", { _invite: inviteId });
  if (resendError || !resend?.ok) return json(409, { error: resendError?.message ?? "resend_not_allowed" });

  const { data: agent } = await admin.from("profiles").select("full_name").eq("id", agentId).maybeSingle();
  const count = Number(resend.resend_count ?? invite.resend_count + 1);
  const queued = await admin.from("email_outbox").insert({
    user_id: null,
    to_email: invite.email,
    template: "client_invite",
    payload: {
      name: invite.name,
      agent_name: agent?.full_name ?? "Your LaundryPoint agent",
      action_link: actionLink,
      expires_at: invite.expires_at,
    },
    idempotency_key: `client-invite-resend-${inviteId}-${count}`,
  });
  if (queued.error) {
    await admin.from("client_invites").update({ resend_count: invite.resend_count })
      .eq("id", inviteId).eq("resend_count", count);
    console.error("client_invite_email_queue_failed", queued.error.message);
    return json(500, { error: "invite_email_queue_failed" });
  }

  return json(200, { ok: true, resend_count: count, expires_at: invite.expires_at });
});
