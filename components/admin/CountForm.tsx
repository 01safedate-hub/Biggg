"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toKobo, lagosToday } from "@/lib/money";
import { friendlyError } from "@/lib/rpc-errors";
import { inputCls, labelCls } from "./ui";

export function CountForm({ points }: { points: { id: string; name: string }[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null); setDone(false);
    const f = new FormData(form);
    const raw = String(f.get("counted") ?? "").replace(/[,\s₦]/g, "");
    const kobo = raw === "0" ? 0 : toKobo(raw);
    if (kobo === null) return setError("Enter the amount you counted in naira, for example 125000.");
    setBusy(true);
    const { error: err } = await createClient().rpc("record_cash_count", {
      _day: String(f.get("day")), _money_point_id: String(f.get("point")), _counted_kobo: kobo, _basis: String(f.get("basis")), _note: String(f.get("note") ?? ""),
    });
    setBusy(false);
    if (err) return setError(friendlyError(err.message));
    setDone(true); form.reset();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5" noValidate>
      <h2 className="text-lg font-semibold">Record a count</h2>
      <p className="text-sm text-ink-soft">Count what is physically there, or what the POS or bank shows, and enter it. The expected amount is not shown to you, so the check stays independent.</p>
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {done && <p role="status" className="rounded-md border border-line bg-brand-tint p-3 text-sm">Count recorded. It has been sent to the super admin for checking.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={labelCls} htmlFor="point">Cash drawer, POS or account</label>
          <select id="point" name="point" className={inputCls} required defaultValue="">{<option value="" disabled>Choose</option>}{points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label className={labelCls} htmlFor="day">Date</label><input id="day" name="day" type="date" max={lagosToday()} defaultValue={lagosToday()} className={inputCls} required /></div>
        <div><label className={labelCls} htmlFor="counted">Amount counted (NGN)</label><input id="counted" name="counted" inputMode="decimal" className={inputCls} required /></div>
        <div><label className={labelCls} htmlFor="basis">I am counting</label>
          <select id="basis" name="basis" className={inputCls} defaultValue="day"><option value="day">Only that day&apos;s takings</option><option value="balance">Everything held, including earlier days</option></select></div>
        <div className="sm:col-span-2"><label className={labelCls} htmlFor="note">Note <span className="font-normal text-ink-mute">(optional)</span></label><input id="note" name="note" className={inputCls} /></div>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Submit count"}</button>
    </form>
  );
}
