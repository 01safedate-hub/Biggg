// Sends queued emails through Resend. Called every 5 minutes by pg_cron.
// verify_jwt is off; callers prove themselves with the x-worker-secret header, which is
// checked against a vault secret through the service-role-only RPC verify_worker_secret.
import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH = 20;
const FROM = Deno.env.get("EMAIL_FROM") ?? "LaundryPoint <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? undefined;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";

type Row = { id: string; to_email: string; template: string; payload: Record<string, unknown> | null; idempotency_key: string | null };

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function layout(heading: string, body: string[]) {
  const paras = body.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155">${p}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:8px" cellpadding="0" cellspacing="0">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;font-size:18px;font-weight:700;color:#0f172a"><span style="color:#ea580c">&#9632;</span> LaundryPoint</td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${heading}</h1>${paras}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">LaundryPoint &middot; <a href="${esc(SITE)}" style="color:#64748b">${esc(SITE.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
}

function render(r: Row): { subject: string; html: string; text: string } {
  const p = r.payload ?? {};
  const order = p.order_no ? `#${esc(p.order_no)}` : "your order";
  switch (r.template) {
    case "waitlist_confirmation": {
      const subject = "You are on the LaundryPoint waitlist";
      const lines = [
        "Thank you for your interest. We have added your email to our waitlist.",
        "We will email you as soon as laundry pickup and delivery reaches your area. You do not need to do anything else.",
      ];
      return { subject, html: layout("You are on the waitlist", lines), text: lines.join("\n\n") };
    }
    case "order_status": {
      const title = String(p.title ?? "Your order has been updated");
      const lines = [`${esc(title)}.`, `Order reference: ${order}.`, `You can follow your order at <a href="${esc(SITE)}" style="color:#c2410c">${esc(SITE.replace(/^https?:\/\//, ""))}</a>.`];
      return { subject: p.order_no ? `${title} - order #${p.order_no}` : title, html: layout(esc(title), lines), text: `${title}.\nOrder reference: ${order}.` };
    }
    case "demurrage_warning": {
      const lines = [
        `Delivery of ${order} has not been completed and the order is being held for you.`,
        "The free holding period is about to end. After it ends, a storage fee applies. Please contact us to arrange collection or delivery.",
      ];
      return { subject: "Action needed: your laundry is waiting", html: layout("Your laundry is waiting for you", lines), text: lines.join("\n\n") };
    }
    case "demurrage_started": {
      const lines = [
        `The free holding period for ${order} has ended, so a storage fee now applies.`,
        "Please contact us to arrange collection or delivery. If you believe this is a mistake, reply to this email.",
      ];
      return { subject: "A storage fee now applies to your order", html: layout("Storage fee applied", lines), text: lines.join("\n\n") };
    }
    default: {
      const lines = ["You have a new notification from LaundryPoint."];
      return { subject: "A message from LaundryPoint", html: layout("Notification", lines), text: lines[0] };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const secret = req.headers.get("x-worker-secret") ?? "";
  const { data: ok } = await db.rpc("verify_worker_secret", { _s: secret });
  if (ok !== true) return new Response("unauthorized", { status: 401 });

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return Response.json({ error: "RESEND_API_KEY is not set" }, { status: 500 });

  const { data: rows, error } = await db.rpc("claim_email_batch", { _n: BATCH });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const r of (rows ?? []) as Row[]) {
    try {
      const m = render(r);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...(r.idempotency_key ? { "Idempotency-Key": r.idempotency_key.slice(0, 256) } : {}),
        },
        body: JSON.stringify({ from: FROM, to: [r.to_email], subject: m.subject, html: m.html, text: m.text, reply_to: REPLY_TO }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        await db.rpc("finish_email", { _id: r.id, _ok: true, _provider_id: body.id ?? null });
        sent++;
      } else {
        await db.rpc("finish_email", { _id: r.id, _ok: false, _err: `${res.status} ${body.message ?? body.name ?? "send failed"}`.slice(0, 500) });
        failed++;
      }
    } catch (e) {
      await db.rpc("finish_email", { _id: r.id, _ok: false, _err: String(e).slice(0, 500) });
      failed++;
    }
    await sleep(600); // stay under Resend's default 2 requests per second
  }
  return Response.json({ claimed: (rows ?? []).length, sent, failed });
});
