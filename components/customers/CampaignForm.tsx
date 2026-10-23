"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { audienceAction, saveCampaignAction, sendCampaignAction } from "@/app/admin/customers/actions";
import { inputCls, labelCls } from "@/components/admin/ui";
import { SEGMENTS } from "@/lib/customers";

export type PromoOpt = { id: string; code: string; percent: number; expires_at: string | null };
type Init = { id: string | null; name: string; subject: string; heading: string; body: string; ctaLabel: string; ctaUrl: string; segment: string; promo: string | null; sent: boolean; recipients: number };

const SITE = "https://laundrypoint.app";
export const TEMPLATES: { key: string; label: string; segment: string; subject: string; heading: string; body: string; cta: string }[] = [
  { key: "welcome", label: "Welcome nudge (never ordered)", segment: "never_ordered", subject: "Your first pickup is waiting, {name}", heading: "Ready for fresh, folded clothes?", cta: "Book my first pickup",
    body: "Hi {name},\n\nThanks for joining LaundryPoint. We collect your laundry from your door, wash and fold it, and bring it back clean.\n\nYour first pickup takes less than a minute to book, and you pay on your phone. Nobody ever needs cash." },
  { key: "winback", label: "Win-back (stopped after one order)", segment: "one_and_done", subject: "We saved you a discount, {name}", heading: "We miss you at LaundryPoint", cta: "Book a pickup",
    body: "Hi {name},\n\nIt has been a little while since your last order. Here is a discount on your next clothes bill, just to say thank you for trying us.\n\nBook a pickup, and when your bill appears on your phone, enter the code below." },
  { key: "lapsed", label: "Come back (lapsed regulars)", segment: "lapsed", subject: "It has been a while, {name}", heading: "Your laundry day is calling", cta: "Book a pickup",
    body: "Hi {name},\n\nYou used to trust us with your laundry and we would love to look after it again.\n\nHere is a thank-you discount for our returning customers." },
  { key: "loyal", label: "Thank you (loyal customers)", segment: "loyal", subject: "Thank you for being one of our best customers", heading: "You are one of our regulars", cta: "Book a pickup",
    body: "Hi {name},\n\nYou use LaundryPoint more than almost anyone, and it means a great deal to us. Here is a small gift for your next order." },
];

export function EmailPreview({ heading, body, ctaLabel, code, percent }: { heading: string; body: string; ctaLabel: string; code?: string; percent?: number }) {
  const fill = (s: string) => s.replace(/\{name\}/gi, "Ada");
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-slate-100 p-3 sm:p-5" aria-label="Email preview">
      <div className="mx-auto max-w-[560px] overflow-hidden rounded-2xl bg-white shadow">
        <div className="flex items-center gap-3 px-6 py-5 text-white" style={{ background: "linear-gradient(135deg,#ea580c,#f97316)" }}><span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-lg font-extrabold text-orange-600">L</span><span className="text-xl font-extrabold">LaundryPoint</span></div>
        <div className="px-6 pb-3 pt-8">
          <h3 className="text-2xl font-bold leading-8 text-slate-900">{fill(heading) || "Your heading"}</h3>
          <div className="mt-5 space-y-4 text-base leading-7 text-slate-700">{(fill(body) || "Your message").split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>
          {code && (
            <div className="my-6 rounded-xl border-2 border-dashed border-orange-500 bg-orange-50 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-800">Your discount</p>
              <p className="my-1 text-4xl font-extrabold text-orange-700">{percent}% off</p>
              <p className="inline-block rounded-lg border border-orange-300 bg-white px-4 py-2 font-mono text-xl font-bold tracking-widest text-slate-900">{code}</p>
              <p className="mt-2 text-xs text-orange-900">Take it off your clothes bill. One use per customer.</p>
            </div>
          )}
          {ctaLabel && <p className="my-4"><span className="inline-block rounded-lg bg-orange-600 px-7 py-3 font-bold text-white">{ctaLabel}</span></p>}
        </div>
        <p className="border-t border-slate-200 px-6 py-4 text-xs leading-5 text-slate-500">You are receiving this because you agreed to hear from LaundryPoint.<br /><u>Unsubscribe</u></p>
      </div>
    </div>
  );
}

export function CampaignForm({ init, promos }: { init: Init; promos: PromoOpt[] }) {
  const router = useRouter();
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [aud, setAud] = useState<{ total: number; eligible: number } | null>(null);
  const set = <K extends keyof Init>(k: K, val: Init[K]) => setV((p) => ({ ...p, [k]: val }));
  const promo = promos.find((p) => p.id === v.promo);
  const locked = v.sent;

  useEffect(() => { let on = true; setAud(null); audienceAction(v.segment).then((r) => { if (on) setAud(r); }); return () => { on = false; }; }, [v.segment]);

  const payload = () => ({ id: v.id, name: v.name, subject: v.subject, heading: v.heading, body: v.body, ctaLabel: v.ctaLabel, ctaUrl: v.ctaUrl, segment: v.segment, promo: v.promo });
  async function save(): Promise<string | null> {
    const r = await saveCampaignAction(payload());
    if (!r.ok) { setMsg({ ok: false, text: r.message }); return null; }
    set("id", r.id ?? null);
    return r.id ?? null;
  }
  async function run(kind: "save" | "test" | "send") {
    if (kind === "send" && !window.confirm(`Send this email to ${aud?.eligible ?? 0} customer${aud?.eligible === 1 ? "" : "s"} now? This cannot be undone.`)) return;
    setBusy(kind); setMsg(null);
    const id = await save();
    if (!id) return setBusy(null);
    if (kind === "save") { setMsg({ ok: true, text: "Draft saved." }); setBusy(null); if (!init.id) router.replace(`/admin/customers/campaigns/${id}`); return; }
    const r = await sendCampaignAction(id, kind === "test");
    setBusy(null); setMsg({ ok: r.ok, text: r.message });
    if (r.ok && kind === "send") router.replace("/admin/customers/campaigns");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        {locked && <p role="status" className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">This campaign was sent to {v.recipients} customer{v.recipients === 1 ? "" : "s"}. It can no longer be edited.</p>}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
        {!locked && !init.id && (
          <div><label htmlFor="tpl" className={labelCls}>Start from a template</label>
            <select id="tpl" className={inputCls} defaultValue="" onChange={(e) => { const t = TEMPLATES.find((x) => x.key === e.target.value); if (t) setV((p) => ({ ...p, name: p.name || t.label, subject: t.subject, heading: t.heading, body: t.body, ctaLabel: t.cta, ctaUrl: `${SITE}/request`, segment: t.segment })); }}>
              <option value="">Write my own</option>{TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
        )}
        <fieldset disabled={locked || !!busy} className="space-y-4">
          <div><label htmlFor="name" className={labelCls}>Campaign name (only you see this)</label><input id="name" className={inputCls} value={v.name} maxLength={80} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label htmlFor="segment" className={labelCls}>Who gets it</label>
            <select id="segment" className={inputCls} value={v.segment} onChange={(e) => set("segment", e.target.value)}>{SEGMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
            <p className="mt-1 text-xs text-ink-mute">{aud ? <>{aud.total} in this group · <strong>{aud.eligible}</strong> can be emailed (they agreed to offers and have an email). Everyone else is skipped.</> : "Counting"}</p></div>
          <div><label htmlFor="subject" className={labelCls}>Subject line</label><input id="subject" className={inputCls} value={v.subject} maxLength={120} onChange={(e) => set("subject", e.target.value)} /></div>
          <div><label htmlFor="heading" className={labelCls}>Big heading inside the email</label><input id="heading" className={inputCls} value={v.heading} maxLength={120} onChange={(e) => set("heading", e.target.value)} /></div>
          <div><label htmlFor="body" className={labelCls}>Message</label><textarea id="body" rows={8} className={inputCls} value={v.body} maxLength={4000} onChange={(e) => set("body", e.target.value)} /><p className="mt-1 text-xs text-ink-mute">Type {"{name}"} to use the customer&apos;s first name. A blank line starts a new paragraph.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="cta" className={labelCls}>Button text (optional)</label><input id="cta" className={inputCls} value={v.ctaLabel} maxLength={40} onChange={(e) => set("ctaLabel", e.target.value)} /></div>
            <div><label htmlFor="url" className={labelCls}>Button link (https://)</label><input id="url" className={inputCls} value={v.ctaUrl} onChange={(e) => set("ctaUrl", e.target.value)} placeholder={`${SITE}/request`} /></div>
          </div>
          <div><label htmlFor="promo" className={labelCls}>Discount code to include (optional)</label>
            <select id="promo" className={inputCls} value={v.promo ?? ""} onChange={(e) => set("promo", e.target.value || null)}><option value="">No discount</option>{promos.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.percent}% off</option>)}</select>
            <p className="mt-1 text-xs text-ink-mute">Only live codes are listed. Create one under Discount codes.</p></div>
        </fieldset>
        {!locked && (
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => run("save")}>{busy === "save" ? "Saving" : "Save draft"}</button>
            <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => run("test")}>{busy === "test" ? "Sending" : "Send a test to me"}</button>
            <button type="button" className="btn-primary" disabled={!!busy || !aud?.eligible} onClick={() => run("send")}>{busy === "send" ? "Sending" : `Send to ${aud?.eligible ?? 0} customers`}</button>
          </div>
        )}
      </form>
      <div className="space-y-2"><h2 className="text-lg font-semibold">Preview</h2><EmailPreview heading={v.heading} body={v.body} ctaLabel={v.ctaLabel} code={promo?.code} percent={promo?.percent} /><p className="text-xs text-ink-mute">This is how it looks on a phone. Always send yourself a test first.</p></div>
    </div>
  );
}
