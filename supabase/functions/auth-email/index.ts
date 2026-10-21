// Supabase "Send Email" auth hook. Supabase calls this instead of its own mailer, and we send through Resend.
// verify_jwt is off: the call is authenticated with a signed webhook (Standard Webhooks) using SEND_EMAIL_HOOK_SECRET.
// Auth emails are sent immediately (not through the 5-minute outbox) because people are waiting on them.
import { Webhook } from "npm:standardwebhooks@1.0.0";

const FROM = Deno.env.get("EMAIL_FROM") ?? "LaundryPoint <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? undefined;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const HOOK_SECRET = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");

type Payload = {
  user: { email: string; new_email?: string };
  email_data: { token: string; token_hash: string; redirect_to: string; email_action_type: string; site_url: string };
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(heading: string, intro: string, button?: { label: string; href: string }, code?: string) {
  const btn = button
    ? `<p style="margin:24px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">${esc(button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#64748b">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${esc(button.href)}</span></p>`
    : "";
  const codeBlock = code ? `<p style="margin:24px 0;font-size:28px;letter-spacing:6px;font-weight:700;color:#0f172a">${esc(code)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:8px" cellpadding="0" cellspacing="0">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;font-size:18px;font-weight:700;color:#0f172a"><span style="color:#ea580c">&#9632;</span> LaundryPoint</td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${esc(heading)}</h1>
<p style="margin:0;font-size:15px;line-height:24px;color:#334155">${esc(intro)}</p>${btn}${codeBlock}
<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#64748b">If you did not request this, you can safely ignore this email.</p></td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">LaundryPoint &middot; ${esc(SITE.replace(/^https?:\/\//, ""))}</td></tr>
</table></td></tr></table></body></html>`;
}

function build(p: Payload): { to: string; subject: string; html: string; text: string } | null {
  const { user, email_data: d } = p;
  const link = `${SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(d.token_hash)}&type=${encodeURIComponent(d.email_action_type)}&redirect_to=${encodeURIComponent(d.redirect_to)}`;
  switch (d.email_action_type) {
    case "signup":
      return { to: user.email, subject: "Confirm your LaundryPoint account",
        html: layout("Confirm your email", "Thank you for creating a LaundryPoint account. Please confirm your email address to activate it.", { label: "Confirm email", href: link }),
        text: `Confirm your LaundryPoint account: ${link}` };
    case "recovery":
      return { to: user.email, subject: "Reset your LaundryPoint password",
        html: layout("Reset your password", "We received a request to reset your password. This link works once and expires soon.", { label: "Choose a new password", href: link }),
        text: `Reset your LaundryPoint password: ${link}` };
    case "magiclink":
      return { to: user.email, subject: "Your LaundryPoint sign-in link",
        html: layout("Sign in", "Use the button below to sign in. This link works once.", { label: "Sign in", href: link }),
        text: `Sign in to LaundryPoint: ${link}` };
    case "invite":
      return { to: user.email, subject: "You have been invited to LaundryPoint",
        html: layout("You are invited", "You have been invited to join LaundryPoint. Accept the invitation to set up your account.", { label: "Accept invitation", href: link }),
        text: `Accept your LaundryPoint invitation: ${link}` };
    case "reauthentication":
      return { to: user.email, subject: "Your LaundryPoint confirmation code",
        html: layout("Confirm it is you", "Enter this code to continue. It expires shortly.", undefined, d.token),
        text: `Your LaundryPoint confirmation code: ${d.token}` };
    default:
      return null; // email_change is not used yet
  }
}

const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail(405, "method_not_allowed");
  if (!HOOK_SECRET || !RESEND_KEY) return fail(500, "email_not_configured");

  const body = await req.text();
  let payload: Payload;
  try {
    payload = new Webhook(HOOK_SECRET).verify(body, Object.fromEntries(req.headers)) as Payload;
  } catch {
    return fail(401, "invalid_signature");
  }

  const mail = build(payload);
  if (!mail) return fail(400, `unsupported_email_type:${payload.email_data.email_action_type}`);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, reply_to: REPLY_TO }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    console.error("resend_failed", res.status, e?.message ?? e?.name);
    return fail(502, "email_send_failed");
  }
  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
});
