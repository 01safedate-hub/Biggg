// Sends queued emails through Resend. Called every 5 minutes by pg_cron.
// verify_jwt is off; callers prove themselves with the x-worker-secret header, which is
// checked against a vault secret through the service-role-only RPC verify_worker_secret.
import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH = 80;
const FROM = Deno.env.get("EMAIL_FROM") ?? "LaundryPoint <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? undefined;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";
const LOGO = `${SITE}/brand/icon/192.png`;

type Row = { id: string; to_email: string; template: string; payload: Record<string, unknown> | null; idempotency_key: string | null };

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function layout(heading: string, body: string[]) {
  const paras = body.map((p) => (p.startsWith("<table") ? p : `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155">${p}</p>`)).join("");
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:8px" cellpadding="0" cellspacing="0">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;font-size:18px;font-weight:700;color:#0f172a"><span style="color:#ea580c">&#9632;</span> LaundryPoint</td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${heading}</h1>${paras}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">LaundryPoint &middot; <a href="${esc(SITE)}" style="color:#64748b">${esc(SITE.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
}

function campaign(p: Record<string, unknown>) {
  const first = String(p.name ?? "").trim().split(/\s+/)[0] || "there";
  const fill = (s: string) => s.replace(/\{name\}/gi, first);
  const heading = esc(fill(String(p.heading ?? "")));
  const paras = fill(String(p.body ?? "")).split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)
    .map((x) => `<p style="margin:0 0 18px;font-size:16px;line-height:26px;color:#334155">${esc(x).replace(/\n/g, "<br>")}</p>`).join("");
  const unsub = `${SITE}/unsubscribe?t=${encodeURIComponent(String(p.unsub_token ?? ""))}`;
  const cta = p.cta_url && p.cta_label && /^https:\/\//.test(String(p.cta_url))
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px"><tr><td style="background:#ea580c;border-radius:8px"><a href="${esc(p.cta_url)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none">${esc(p.cta_label)}</a></td></tr></table>` : "";
  let ticket = "";
  if (p.code) {
    const exp = p.expires_at ? new Date(String(p.expires_at)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" }) : "";
    ticket = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td align="center" style="border:2px dashed #ea580c;border-radius:12px;background:#fff7ed;padding:22px 16px">
<div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#9a3412;font-weight:700">Your discount</div>
<div style="margin:6px 0;font-size:34px;font-weight:800;color:#c2410c">${esc(p.percent)}% off</div>
<div style="display:inline-block;margin:4px 0;padding:8px 18px;background:#ffffff;border:1px solid #fdba74;border-radius:8px;font-family:Consolas,Menlo,monospace;font-size:22px;font-weight:700;letter-spacing:3px;color:#0f172a">${esc(p.code)}</div>
<div style="margin-top:10px;font-size:13px;color:#7c2d12">Take it off your clothes bill. Enter the code on your phone when your bill appears. One use per customer${exp ? `. Valid until ${esc(exp)}` : ""}.</div>
</td></tr></table>`;
  }
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.12)" cellpadding="0" cellspacing="0">
<tr><td style="background:linear-gradient(135deg,#ea580c,#f97316);padding:26px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px"><img src="${esc(LOGO)}" width="40" height="40" alt="" style="display:block;border-radius:8px;background:#fff"></td><td style="font-size:20px;font-weight:800;color:#ffffff">LaundryPoint</td></tr></table></td></tr>
<tr><td style="padding:36px 32px 12px"><h1 style="margin:0 0 20px;font-size:26px;line-height:32px;color:#0f172a">${heading}</h1>${paras}${ticket}${cta}</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;font-size:12px;line-height:18px;color:#64748b">You are receiving this because you agreed to hear from LaundryPoint.<br>Pickup and delivery &middot; <a href="${esc(SITE)}" style="color:#64748b">${esc(SITE.replace(/^https?:\/\//, ""))}</a><br><a href="${esc(unsub)}" style="color:#64748b;text-decoration:underline">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [fill(String(p.heading ?? "")), "", fill(String(p.body ?? "")), p.code ? `\nDiscount code: ${p.code} (${p.percent}% off your clothes bill)` : "", p.cta_url ? `\n${p.cta_label ?? "Open"}: ${p.cta_url}` : "", `\nUnsubscribe: ${unsub}`].join("\n");
  return { subject: fill(String(p.subject ?? "A message from LaundryPoint")), html, text, unsub };
}

function render(r: Row): { subject: string; html: string; text: string; unsub?: string } {
  const p = r.payload ?? {};
  const order = p.order_no ? `#${esc(p.order_no)}` : "your order";
  switch (r.template) {
    case "campaign":
      return campaign(p);
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
    case "staff_review": {
      const first = String(p.name ?? "").trim().split(/\s+/)[0] || "there";
      if (p.approved) {
        const lines = [`Hello ${esc(first)}, your details have been checked and approved. Your account is fully set up.`, `You can sign in any time at <a href="${esc(SITE)}/staff" style="color:#c2410c">${esc(SITE.replace(/^https?:\/\//, ""))}/staff</a>.`];
        return { subject: "Your LaundryPoint details are approved", html: layout("You are approved", lines), text: `Hello ${first}, your details have been approved. Sign in at ${SITE}/staff` };
      }
      const lines = [`Hello ${esc(first)}, we looked at your details and need you to change something before we can approve them.`, `<strong>What to fix:</strong> ${esc(p.note)}`, `Sign in, correct your details, and submit them again.`];
      return { subject: "Please update your LaundryPoint details", html: layout("A change is needed", lines), text: `Hello ${first}, we need a change before approving your details: ${p.note}. Sign in, update and submit again.` };
    }
    case "count_summary": {
      const first = String(p.name ?? "").trim().split(/\s+/)[0] || "there";
      const items = (Array.isArray(p.items) ? p.items : []) as { name?: unknown; qty?: unknown; instant?: unknown; stain?: unknown }[];
      const stains = (Array.isArray(p.stains) ? p.stains : []).map((x) => String(x));
      const td = "padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:15px;color:#334155";
      const rows = items.map((i) => `<tr><td style="${td}">${esc(i.name)}${i.instant ? ' <span style="color:#c2410c;font-size:12px">(instant)</span>' : ""}${i.stain ? ' <span style="background:#fef3c7;color:#92400e;font-size:12px;padding:1px 6px;border-radius:4px">hard stain</span>' : ""}</td><td align="right" style="${td}">${esc(i.qty)}</td></tr>`).join("");
      const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;padding-bottom:4px">Item</td><td align="right" style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;padding-bottom:4px">Qty</td></tr>${rows}<tr><td style="padding-top:10px;font-size:15px;font-weight:700;color:#0f172a">Total items</td><td align="right" style="padding-top:10px;font-size:15px;font-weight:700;color:#0f172a">${esc(p.total)}</td></tr></table>`;
      const lines = [`Hello ${esc(first)}, we have counted your clothes for order #${esc(p.order_no)}. Here is what we recorded.`, table];
      if (stains.length) lines.push(`<strong>Hard stains noticed (${stains.length}):</strong><br>${stains.map((x) => `&bull; ${esc(x)}`).join("<br>")}<br>We will do our best to remove them, but some stains cannot come out fully.`);
      lines.push(`If anything here looks wrong, tell us as soon as you can. You can see your order${stains.length ? " and the photos of the stains" : ""} at <a href="${esc(SITE)}/orders/${esc(p.order_id)}" style="color:#c2410c">${esc(SITE.replace(/^https?:\/\//, ""))}</a>.`);
      const text = `Hello ${first}, we counted your clothes for order #${p.order_no}.\n` + items.map((i) => `${i.qty} x ${i.name}${i.stain ? " (hard stain)" : ""}`).join("\n") + `\nTotal items: ${p.total}` + (stains.length ? `\nHard stains: ${stains.join("; ")}` : "");
      return { subject: `Your clothes were counted: ${p.total} items, order #${p.order_no}`, html: layout("Your clothes were counted", lines), text };
    }
    case "test": {
      const lines = ["This is a test message from your LaundryPoint admin screen.", "If you can read this, email delivery through Resend is working."];
      return { subject: "LaundryPoint test email", html: layout("Email is working", lines), text: lines.join("\n\n") };
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
        body: JSON.stringify({
          from: FROM, to: [r.to_email], subject: m.subject, html: m.html, text: m.text, reply_to: REPLY_TO,
          ...(m.unsub ? { headers: { "List-Unsubscribe": `<${m.unsub}>` } } : {}),
        }),
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
