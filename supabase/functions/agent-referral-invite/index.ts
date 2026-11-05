import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
const clean = (v: unknown) => String(v ?? "").trim();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { error: "not_signed_in" });

  const caller = createClient(URL_, ANON, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json(401, { error: "not_signed_in" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "bad_request" }); }
  const applicationId = clean(body.application_id);
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return json(400, { error: "invalid_application" });

  const [{ data: profile }, { data: roles }, { data: application, error: appError }] = await Promise.all([
    admin.from("profiles").select("status").eq("id", user.id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", user.id),
    admin.from("agent_applications").select("id,referred_by,full_name,email,phone,status,applicant_user_id").eq("id", applicationId).maybeSingle(),
  ]);
  if (profile?.status !== "active" || !(roles ?? []).some((r) => ["delivery_agent", "commission_agent"].includes(r.role))) {
    return json(403, { error: "not_authorized" });
  }
  if (appError || !application || application.referred_by !== user.id) return json(404, { error: "referral_not_found" });
  if (application.status !== "referred" || application.applicant_user_id) return json(409, { error: "referral_already_processed" });

  const invite = await admin.auth.admin.inviteUserByEmail(application.email, {
    data: { full_name: application.full_name, phone: application.phone },
    redirectTo: `${SITE}/auth/callback?next=/welcome`,
  });
  if (invite.error || !invite.data.user) {
    await admin.from("agent_applications").update({ invitation_error: invite.error?.message ?? "invite_failed" }).eq("id", applicationId);
    return json(400, { error: "invitation_failed" });
  }

  const applicantId = invite.data.user.id;
  const role = await admin.from("user_roles").upsert(
    { user_id: applicantId, role: "commission_agent", granted_by: user.id },
    { onConflict: "user_id,role", ignoreDuplicates: true },
  );
  if (role.error) {
    await admin.auth.admin.deleteUser(applicantId);
    return json(500, { error: "role_setup_failed" });
  }

  const staffProfile = await admin.from("staff_profiles").upsert({ user_id: applicantId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (staffProfile.error) {
    await admin.auth.admin.deleteUser(applicantId);
    return json(500, { error: "profile_setup_failed" });
  }

  await admin.from("profiles").update({ full_name: application.full_name, phone: application.phone }).eq("id", applicantId);
  const linked = await admin.from("agent_applications")
    .update({ applicant_user_id: applicantId, invited_at: new Date().toISOString(), invitation_error: null })
    .eq("id", applicationId).eq("status", "referred").is("applicant_user_id", null).select("id").maybeSingle();
  if (linked.error || !linked.data) {
    await admin.auth.admin.deleteUser(applicantId);
    return json(500, { error: "referral_link_failed" });
  }

  return json(200, { ok: true, message: "Application invitation sent. The applicant must complete their details, attend hub verification with their NIN, and receive final super-admin approval before staff access is enabled." });
});
