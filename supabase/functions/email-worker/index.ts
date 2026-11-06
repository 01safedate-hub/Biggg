// Sends queued emails through Resend. Called every 5 minutes by pg_cron.
// verify_jwt is off; callers prove themselves with the x-worker-secret header, which is
// checked against a vault secret through the service-role-only RPC verify_worker_secret.
import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH = 80;
const FROM = Deno.env.get("EMAIL_FROM") ?? "LaundryPoint <noreply@laundrypoint.app>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? undefined;
const SITE = Deno.env.get("SITE_URL") ?? "https://laundrypoint.app";
const LOGO = `${SITE}/brand/icon/192.png`;

type Row = { id: string; to_email: string; template: string; payload: Record<string, unknown> | null; idempotency_key: string | null };

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Kobo to a naira string such as N1,250. */
const money = (kobo: unknown) => `₦${(Number(kobo ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const lagosDate = (iso: unknown) => {
  const d = new Date(String(iso ?? ""));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
};
const TD = "padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:15px;color:#334155";
const TH = "font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;padding-bottom:4px";
const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;padding:12px 20px;background:#ea580c;border-radius:8px;color:#ffffff;font-weight:700;text-decoration:none">${esc(label)}</a>`;

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

type CountItem = { name?: unknown; qty?: unknown; instant?: unknown; stain?: unknown; unit_kobo?: unknown; line_kobo?: unknown };

function countSummary(p: Record<string, unknown>) {
  const first = String(p.name ?? "").trim().split(/\s+/)[0] || "there";
  const items = (Array.isArray(p.items) ? p.items : []) as CountItem[];
  const stains = (Array.isArray(p.stains) ? p.stains : []).map((x) => String(x));
  // Older queued emails and subscription pickups have no prices; they keep the plain item and quantity table.
  const prices = p.show_prices === true && items.every((i) => i.line_kobo != null);
  const fee = Number(p.instant_fee_kobo ?? 0);
  const flags = (i: CountItem) => `${i.instant ? ' <span style="color:#c2410c;font-size:12px">(instant)</span>' : ""}${i.stain ? ' <span style="background:#fef3c7;color:#92400e;font-size:12px;padding:1px 6px;border-radius:4px">hard stain</span>' : ""}`;
  const rows = items.map((i) => `<tr><td style="${TD}">${esc(i.name)}${flags(i)}</td><td align="right" style="${TD}">${esc(i.qty)}</td>${prices ? `<td align="right" style="${TD}">${money(i.line_kobo)}</td>` : ""}</tr>`).join("");
  const head = `<tr><td style="${TH}">Item</td><td align="right" style="${TH}">Qty</td>${prices ? `<td align="right" style="${TH}">Amount</td>` : ""}</tr>`;
  const foot: string[] = [];
  if (prices && fee > 0) foot.push(`<tr><td colspan="2" style="${TD}">Instant delivery</td><td align="right" style="${TD}">${money(fee)}</td></tr>`);
  foot.push(`<tr><td style="padding-top:10px;font-size:15px;font-weight:700;color:#0f172a">${prices ? "Total" : "Total items"}</td><td align="right" style="padding-top:10px;font-size:15px;font-weight:700;color:#0f172a">${esc(p.total)}</td>${prices ? `<td align="right" style="padding-top:10px;font-size:15px;font-weight:700;color:#0f172a">${money(p.bill_kobo)}</td>` : ""}</tr>`);
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${head}${rows}${foot.join("")}</table>`;
  const lines = [`Hello ${esc(first)}, we have counted your clothes for order #${esc(p.order_no)}. Here is what we recorded.`, table];
  if (stains.length) lines.push(`<strong>Hard stains noticed (${stains.length}):</strong><br>${stains.map((x) => `&bull; ${esc(x)}`).join("<br>")}<br>We will do our best to remove them, but some stains cannot come out fully.`);
  lines.push(`If anything here looks wrong, tell us as soon as you can. You can see your order${stains.length ? " and the photos of the stains" : ""} at <a href="${esc(SITE)}/orders/${esc(p.order_id)}" style="color:#c2410c">${esc(SITE.replace(/^https?:\/\//, ""))}</a>.`);
  const text = `Hello ${first}, we counted your clothes for order #${p.order_no}.\n` +
    items.map((i) => `${i.qty} x ${i.name}${prices ? ` - ${money(i.line_kobo)}` : ""}${i.stain ? " (hard stain)" : ""}`).join("\n") +
    (prices && fee > 0 ? `\nInstant delivery: ${money(fee)}` : "") +
    `\nTotal items: ${p.total}` + (prices ? `\nBill: ${money(p.bill_kobo)}` : "") + (stains.length ? `\nHard stains: ${stains.join("; ")}` : "");
  return { subject: `Your clothes were counted: ${p.total} items, order #${p.order_no}`, html: layout("Your clothes were counted", lines), text };
}

function paymentReceipt(p: Record<string, unknown>) {
  const first = String(p.name ?? "").trim().split(/\s+/)[0] || "there";
  const items = (Array.isArray(p.lines) ? p.lines : []) as CountItem[];
  const discount = Number(p.discount_kobo ?? 0);
  const fee = Number(p.instant_fee_kobo ?? 0);
  const rows = items.map((i) => `<tr><td style="${TD}">${esc(i.name)}</td><td align="right" style="${TD}">${esc(i.qty)}</td><td align="right" style="${TD}">${money(i.unit_kobo)}</td><td align="right" style="${TD}">${money(i.line_kobo)}</td></tr>`).join("");
  const extra: string[] = [];
  if (discount > 0) extra.push(`<tr><td colspan="3" style="${TD};color:#047857">Discount</td><td align="right" style="${TD};color:#047857">-${money(discount)}</td></tr>`);
  if (fee > 0) extra.push(`<tr><td colspan="3" style="${TD}">Instant delivery</td><td align="right" style="${TD}">${money(fee)}</td></tr>`);
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="${TH}">Item</td><td align="right" style="${TH}">Qty</td><td align="right" style="${TH}">Each</td><td align="right" style="${TH}">Amount</td></tr>${rows}${extra.join("")}<tr><td colspan="3" style="padding-top:10px;font-size:15px;font-weight:700;color:#0f172a">Total paid</td><td align="right" style="padding-top:10px;font-size:15px;font-weight:700;color:#0f172a">${money(p.total_kobo)}</td></tr></table>`;
  const when = lagosDate(p.paid_at);
  const meta = [p.reference ? `Reference: ${esc(p.reference)}` : "", p.mode ? `Paid by: ${esc(p.mode)}` : "", when ? `Date: ${esc(when)}` : ""].filter(Boolean).join("<br>");
  const lines = [`Hello ${esc(first)}, thank you. We have received your payment for order #${esc(p.order_no)}.`, table];
  if (meta) lines.push(meta);
  lines.push(`You can follow your order and see this receipt at <a href="${esc(SITE)}/orders/${esc(p.order_id)}/receipt" style="color:#c2410c">${esc(SITE.replace(/^https?:\/\//, ""))}</a>.`);
  const text = `Hello ${first}, we received your payment for order #${p.order_no}.\n` +
    items.map((i) => `${i.qty} x ${i.name} - ${money(i.line_kobo)}`).join("\n") +
    (discount > 0 ? `\nDiscount: -${money(discount)}` : "") + (fee > 0 ? `\nInstant delivery: ${money(fee)}` : "") +
    `\nTotal paid: ${money(p.total_kobo)}` + (p.reference ? `\nReference: ${p.reference}` : "") + (when ? `\nDate: ${when}` : "");
  return { subject: `Payment received: ${money(p.total_kobo)} for order #${p.order_no}`, html: layout("Payment received", lines), text };
}

function readyCollect(p: Record<string, unknown>) {
  const first = String(p.name ?? "").trim().split(/\s+/)[0] || "there";
  const address = String(p.address ?? "").trim();
  const maps = /^https:\/\//.test(String(p.maps_url ?? "")) ? String(p.maps_url) : "";
  const hours = p.opening_time && p.closing_time ? `${p.opening_time} to ${p.closing_time}` : "";
  const lines = [
    `Hello ${esc(first)}, your clothes for order #${esc(p.order_no)} are clean and ready for you to collect.`,
    address ? `<strong>Where:</strong> ${esc(address)}` : "Please come to the LaundryPoint hub to collect them.",
    hours ? `<strong>Opening hours:</strong> ${esc(hours)}` : "",
    "Please give your order number at the desk. Collect them soon: a storage fee can apply after the free holding period.",
  ].filter(Boolean);
  if (maps) lines.push(button(maps, "Open the map"));
  const text = [`Hello ${first}, your clothes for order #${p.order_no} are ready for collection.`, address ? `Where: ${address}` : "", hours ? `Opening hours: ${hours}` : "", "Give your order number at the desk. A storage fee can apply after the free holding period.", maps ? `Map: ${maps}` : ""].filter(Boolean).join("\n");
  return { subject: `Your clothes are ready for collection - order #${p.order_no}`, html: layout("Ready for collection", lines), text };
}

function agentJob(p: Record<string, unknown>) {
  const first = String(p.name ?? "").trim().split(/\s+/)[0] || "there";
  const title = String(p.title ?? "New job assigned to you");
  const link = `${SITE}/staff/jobs/${encodeURIComponent(String(p.order_id ?? ""))}`;
  const lines = [
    `Hello ${esc(first)}, ${esc(title.toLowerCase())}.`,
    `<strong>Order:</strong> #${esc(p.order_no)}<br><strong>${p.delivery ? "Deliver to" : "Pickup address"}:</strong> ${esc(p.address || "See the job page")}`,
    button(link, "Open the job"),
    "Customer phone numbers and details are only shown inside the app. Never collect cash from the customer.",
  ];
  return { subject: `${title} - order #${p.order_no}`, html: layout(esc(title), lines), text: `Hello ${first}, ${title.toLowerCase()}.\nOrder #${p.order_no}\n${p.delivery ? "Deliver to" : "Pickup address"}: ${p.address ?? "See the job page"}\nOpen the job: ${link}\nNever collect cash from the customer.` };
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
    case "client_invite": {
      const first = String(p.name ?? "").trim().split(/\s+/)[0] || "there";
      const agent = String(p.agent_name ?? "Your LaundryPoint agent");
      const action = String(p.action_link ?? "");
      const exp = p.expires_at ? new Date(String(p.expires_at)).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos",
      }) : "the invitation expiry date";
      if (!/^https:\/\//.test(action)) {
        return { subject: "Finish setting up your LaundryPoint account", html: layout("Your customer invitation", ["Please open LaundryPoint to finish setting up your account."]), text: "Please open LaundryPoint to finish setting up your account." };
      }
      const lines = [
        `Hello ${esc(first)}, ${esc(agent)} invited you to join LaundryPoint as a customer.`,
        `Use the secure link below to finish setting up your account and choose your password. This invitation expires on ${esc(exp)}.`,
        `<a href="${esc(action)}" style="display:inline-block;padding:12px 20px;background:#ea580c;border-radius:8px;color:#ffffff;font-weight:700;text-decoration:none">Finish setting up your account</a>`,
        "If you were not expecting this invitation, you can ignore this email.",
      ];
      return { subject: "Finish setting up your LaundryPoint account", html: layout("You have been invited to LaundryPoint", lines), text: `Hello ${first}, ${agent} invited you to LaundryPoint. Finish setting up your account here: ${action}. This invitation expires on ${exp}.` };
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
    case "count_summary":
      return countSummary(p);
    case "payment_receipt":
      return paymentReceipt(p);
    case "ready_collect":
      return readyCollect(p);
    case "agent_job":
      return agentJob(p);
    case "whatsapp_verification": {
      const code = String(p.code ?? "").trim();
      const minutes = Math.max(1, Number(p.expires_minutes ?? 10) || 10);
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        throw new Error("whatsapp_verification_code_missing_or_invalid");
      }
      const heading = "Verify your WhatsApp account";
      const lines = [
        "Use this one-time code to verify your LaundryPoint account for WhatsApp assistance.",
        `<div style="margin:24px 0;padding:20px 16px;text-align:center;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;font-family:Consolas,Menlo,monospace;font-size:30px;font-weight:800;letter-spacing:7px;color:#c2410c">${esc(code)}</div>`,
        `This code expires in ${minutes} minutes. Enter it in your LaundryPoint WhatsApp chat to continue.`,
        "If you did not request this code, you can safely ignore this email. LaundryPoint staff will never ask you to share it with them.",
      ];
      const text = `Your LaundryPoint WhatsApp verification code is: ${code}\n\nIt expires in ${minutes} minutes. Enter it in your WhatsApp chat to continue.\n\nIf you did not request this code, ignore this email. Never share this code with anyone.`;
      return { subject: "Your LaundryPoint WhatsApp verification code", html: layout(heading, lines), text };
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

  const key = Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("RESEND_API");
  if (!key) return Response.json({ error: "Set RESEND_API (or RESEND_API_KEY) in Supabase Edge Function secrets" }, { status: 500 });

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
