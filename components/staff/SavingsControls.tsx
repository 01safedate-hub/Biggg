"use client";

import { useState } from "react";
import { giveNotice, raiseSavingsRate } from "@/app/staff/(app)/savings/actions";
import { naira } from "@/lib/format";

type R = { ok: boolean; message: string };
const Msg = ({ m }: { m: R | null }) => m ? <p role={m.ok ? "status" : "alert"} className={`rounded-md border p-2 text-sm ${m.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{m.message}</p> : null;

/** 10% / 15% / 20%. Rates below the current one are shown but locked: the rate can only go up. */
export function SavingsRate({ pct, salaryKobo }: { pct: number; salaryKobo: number | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  const choose = async (next: number) => {
    const monthly = salaryKobo ? ` That is about ${naira(Math.round((salaryKobo * next) / 100))} a month from a ${naira(salaryKobo)} salary.` : "";
    if (!window.confirm(`Save ${next}% of your salary every month?${monthly}\n\nYou can never lower it again after this.`)) return;
    setBusy(true); setMsg(null); setMsg(await raiseSavingsRate(next)); setBusy(false);
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Savings rate">
        {[10, 15, 20].map((r) => {
          const current = r === pct, below = r < pct;
          return (
            <button key={r} type="button" disabled={busy || current || below} onClick={() => choose(r)} aria-pressed={current}
              className={`min-w-0 rounded-xl border p-2 text-center transition sm:p-3 ${current ? "border-brand bg-brand-tint ring-2 ring-brand" : below ? "border-line bg-canvas text-ink-mute" : "border-line bg-white hover:border-brand"}`}>
              <span className="block text-2xl font-bold">{r}%</span>
              <span className="block text-xs">{current ? "Your rate" : below ? "Locked" : "Raise to this"}</span>
              {salaryKobo ? <span className="mt-1 block text-[11px] leading-tight text-ink-mute">{naira(Math.round((salaryKobo * r) / 100))}<span className="block">a month</span></span> : null}
            </button>
          );
        })}
      </div>
      <Msg m={msg} />
    </div>
  );
}

export function NoticeForm({ earliest }: { earliest: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  const [open, setOpen] = useState(false);
  if (msg?.ok) return <Msg m={msg} />;
  if (!open) return <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Give notice</button>;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const day = String(f.get("last_day") ?? "");
      if (!window.confirm(`Give notice with your last day on ${day}? The super admin will be told straight away.`)) return;
      setBusy(true); setMsg(await giveNotice(day, String(f.get("reason") ?? ""))); setBusy(false);
    }}>
      <div>
        <label htmlFor="nt-day" className="block text-sm font-medium">Your last day</label>
        <input id="nt-day" name="last_day" type="date" min={earliest} defaultValue={earliest} required className="mt-1 w-full rounded-md border border-line px-3 py-2" />
        <p className="mt-1 text-xs text-ink-mute">At least two months from today. Earliest: {earliest}.</p>
      </div>
      <div>
        <label htmlFor="nt-reason" className="block text-sm font-medium">Reason (optional)</label>
        <textarea id="nt-reason" name="reason" maxLength={500} rows={2} className="mt-1 w-full rounded-md border border-line px-3 py-2" />
      </div>
      <Msg m={msg} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Confirm notice"}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
