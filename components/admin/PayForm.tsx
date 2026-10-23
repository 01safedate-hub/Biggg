"use client";

import { useState } from "react";
import { savePay } from "@/app/admin/staff/[id]/actions";
import { toKobo } from "@/lib/money";
import { inputCls, labelCls } from "./ui";

const toNaira = (k: number | null | undefined) => (k == null ? "" : String(k / 100));

export function PayForm({ userId, pay }: { userId: string; pay: { job_title: string | null; base_salary_kobo: number; boosted_salary_kobo: number; monthly_target_kobo: number | null; earns_weekly_bonus: boolean; active: boolean } | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const base = String(f.get("base") ?? "").trim() === "0" ? 0 : toKobo(String(f.get("base") ?? ""));
    const boosted = toKobo(String(f.get("boosted") ?? ""));
    const tRaw = String(f.get("target") ?? "").trim();
    const target = tRaw ? toKobo(tRaw) : null;
    if (base == null || boosted == null) return setMsg({ ok: false, text: "Enter both salaries in naira." });
    if (tRaw && target == null) return setMsg({ ok: false, text: "The monthly profit target is not a valid amount." });
    setBusy(true); setMsg(null);
    const r = await savePay(userId, { job_title: String(f.get("job_title") ?? ""), base, boosted, target, weekly: f.get("weekly") === "on", active: f.get("active") === "on" });
    setBusy(false); setMsg({ ok: r.ok, text: r.message });
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">Pay terms</h2>
      <p className="text-sm text-ink-soft">Two salaries. The target-met salary replaces the basic salary in a month the profit target is reached, and only after the start-up costs are recovered. Staff see percentages for progress, never the target amounts.</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="job_title" className={labelCls}>Job title</label><input id="job_title" name="job_title" defaultValue={pay?.job_title ?? ""} className={inputCls} /></div>
        <div><label htmlFor="target" className={labelCls}>Monthly profit target (₦)</label><input id="target" name="target" inputMode="decimal" defaultValue={toNaira(pay?.monthly_target_kobo)} placeholder="Blank = business target" className={inputCls} /></div>
        <div><label htmlFor="base" className={labelCls}>Basic salary (₦ / month)</label><input id="base" name="base" inputMode="decimal" required defaultValue={toNaira(pay?.base_salary_kobo)} className={inputCls} /></div>
        <div><label htmlFor="boosted" className={labelCls}>Target-met salary (₦ / month)</label><input id="boosted" name="boosted" inputMode="decimal" required defaultValue={toNaira(pay?.boosted_salary_kobo)} className={inputCls} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="weekly" defaultChecked={pay?.earns_weekly_bonus ?? false} /> On the weekly units plan (weekly payout when the units target is met)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={pay?.active ?? true} /> On payroll</label>
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save pay terms"}</button>
    </form>
  );
}
