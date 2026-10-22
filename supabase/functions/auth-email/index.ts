// Supabase "Send Email" auth hook. Supabase calls this instead of its own mailer, and we send through Resend.
// verify_jwt is off: the call is authenticated with a signed webhook (Standard Webhooks) using SEND_EMAIL_HOOK_SECRET.
// Auth emails are sent immediately (not through the 5-minute outbox) because people are waiting on them.
import { Webhook } from "npm:standardwebhooks@1.0.0";

const FROM = Deno.env.get("EMAIL_FROM") ?? "LaundryPoint <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? undefined;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";
const HOOK_SECRET = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");

type Payload = {
  user: { email: string; new_email?: string };
  email_data: {
    token: string; token_hash: string; token_new?: string; token_hash_new?: string; old_email?: string;
    redirect_to: string; email_action_type: string; site_url: string;
  };
};
type Mail = { to: string; subject: string; html: string; text: string };

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

// Links go to our own confirm page (never straight to the Supabase verify URL). That page needs a click before it uses
// the one-time token, so mail scanners that open links in advance cannot burn the token.
function build(p: Payload): Mail[] | null {
  const { user, email_data: d } = p;
  const link = (hash: string, type: string) => `${SITE}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=${encodeURIComponent(type)}`;
  const one = (to: string, subject: string, html: string, text: string): Mail[] => [{ to, subject, html, text }];
  switch (d.email_action_type) {
    case "signup": {
      const l = link(d.token_hash, "signup");
      return one(user.email, "Confirm your LaundryPoint account",
        layout("Confirm your email", "Thank you for creating a LaundryPoint account. Please confirm your email address to activate it.", { label: "Confirm email", href: l }),
        `Confirm your LaundryPoint account: ${l}`);
    }
    case "recovery": {
      const l = link(d.token_hash, "recovery");
      return one(user.email, "Reset your LaundryPoint password",
        layout("Reset your password", "We received a request to reset your password. This link works once and expires soon.", { label: "Choose a new password", href: l }),
        `Reset your LaundryPoint password: ${l}`);
    }
    case "magiclink": {
      const l = link(d.token_hash, "magiclink");
      return one(user.email, "Your LaundryPoint sign-in link",
        layout("Sign in", "Use the button below to sign in. This link works once.", { label: "Sign in", href: l }),
        `Sign in to LaundryPoint: ${l}`);
    }
    case "invite": {
      const l = link(d.token_hash, "invite");
      return one(user.email, "You have been invited to LaundryPoint",
        layout("You are invited", "You have been invited to join the LaundryPoint team. Accept the invitation to choose your password and set up your account.", { label: "Accept invitation", href: l }),
        `Accept your LaundryPoint invitation: ${l}`);
    }
    case "reauthentication":
      return one(user.email, "Your LaundryPoint confirmation code",
        layout("Confirm it is you", "Enter this code to continue. It expires shortly.", undefined, d.token),
        `Your LaundryPoint confirmation code: ${d.token}`);
    case "email_change": {
      // Token fields are reversed by Supabase for backward compatibility:
      // token_hash_new goes to the CURRENT address, token_hash goes to the NEW address.
      const target = user.new_email;
      if (!target) return null;
      const out: Mail[] = [];
      const lNew = link(d.token_hash, "email_change");
      out.push({ to: target, subject: "Confirm your new LaundryPoint email",
        html: layout("Confirm your new email", `Please confirm that ${target} should be your new LaundryPoint sign-in email.`, { label: "Confirm new email", href: lNew }),
        text: `Confirm your new LaundryPoint email: ${lNew}` });
      if (d.token_hash_new) {
        const lCur = link(d.token_hash_new, "email_change");
        out.push({ to: user.email, subject: "Approve the change of your LaundryPoint email",
          html: layout("Approve the email change", `A request was made to change your sign-in email to ${target}. If this was you, approve it below. If not, do not click, and change your password.`, { label: "Approve change", href: lCur }),
          text: `Approve the change of your LaundryPoint email to ${target}: ${lCur}` });
      }
      return out;
    }
    case "password_changed_notification":
      return one(user.email, "Your LaundryPoint password was changed",
        layout("Your password was changed", "The password for your LaundryPoint account was just changed. If this was not you, reset your password straight away and contact us."),
        "Your LaundryPoint password was changed. If this was not you, reset your password straight away.");
    case "email_changed_notification": {
      const to = d.old_email || user.email;
      return one(to, "Your LaundryPoint email was changed",
        layout("Your email was changed", `The sign-in email for your LaundryPoint account was changed to ${user.email}. If this was not you, contact us immediately.`),
        `The sign-in email for your LaundryPoint account was changed to ${user.email}. If this was not you, contact us immediately.`);
    }
    default:
      // Other optional security notices (identity, MFA, phone) are not used here. Accept them quietly so they never block a sign-in or change.
      return d.email_action_type.endsWith("_notification") ? [] : null;
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

  const mails = build(payload);
  if (!mails) return fail(400, `unsupported_email_type:${payload.email_data.email_action_type}`);

  for (const mail of mails) {
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
  }
  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
});
