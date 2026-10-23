"use client";

import { useState } from "react";
import { closeWeek, logUnits, markPaid, saveWeeklyTarget, voidUnits } from "@/app/admin/weekly/actions";
import { toKobo } from "@/lib/money";
import { inputCls, labelCls } from "./ui";

type R = { ok: boolean; message: string };
function useRun() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  return { busy, msg, run: async (fn: () => Promise<R>) => { setBusy(true); setMsg(null); const r = await fn(); setBusy(false); setMsg(r); return r; } };
}
const Msg = ({ m }: { m: R | null }) => m ? <p role={m.ok ? "status" : "alert"} className={`rounded-md border p-2 text-sm ${m.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{m.message}</p> : null;

export function WeeklyTargetForm({ units, payoutKobo }: { units: number | null; payoutKobo: number }) {
  const { busy, msg, run } = useRun();
  return (
    <form className="card space-y-3 p-5" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const u = String(f.get("units") ?? "").trim();
      const p = toKobo(String(f.get("payout") ?? ""));
      if (!p) return;
      void run(() => saveWeeklyTarget(u ? Number(u) : null, p));
    }}>
      <h2 className="text-lg font-semibold">Weekly target and payout</h2>
      <p className="text-sm text-ink-soft">Only you can change this. Staff see a progress bar, never the number of units.</p>
      <Msg m={msg} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="wk-units" className={labelCls}>Units to wash per week</label><input id="wk-units" name="units" inputMode="numeric" pattern="\d*" defaultValue={units ?? ""} className={inputCls} placeholder="Not set" /></div>
        <div><label htmlFor="wk-pay" className={labelCls}>Weekly payout (₦)</label><input id="wk-pay" name="payout" inputMode="decimal" required defaultValue={payoutKobo / 100} className={inputCls} /></div>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save"}</button>
    </form>
  );
}

export function LogUnits({ staffId }: { staffId: string }) {
  const { busy, msg, run } = useRun();
  const [units, setUnits] = useState("");
  return (
    <div className="space-y-1">
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const n = Number(units); if (!Number.isInteger(n) || n < 1) return; const r = await run(() => logUnits(staffId, n, "")); if (r.ok) setUnits(""); }}>
        <input aria-label="Units washed" inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))} placeholder="Units" className="w-24 rounded-md border border-line px-2 py-1.5 text-sm" />
        <button className="btn-secondary !px-3 !py-1.5" disabled={busy || !units}>Add</button>
      </form>
      {msg && !msg.ok && <p role="alert" className="text-xs text-red-700">{msg.message}</p>}
    </div>
  );
}

export function VoidButton({ id }: { id: string }) {
  const { busy, msg, run } = useRun();
  return (
    <span>
      <button className="text-xs font-medium text-red-700 hover:underline" disabled={busy} onClick={() => { const r = window.prompt("Why is this entry being voided?"); if (r) void run(() => voidUnits(id, r)); }}>Void</button>
      {msg && !msg.ok && <span role="alert" className="ml-2 text-xs text-red-700">{msg.message}</span>}
    </span>
  );
}

export function CloseWeek({ weekStart, disabledReason }: { weekStart: string; disabledReason: string | null }) {
  const { busy, msg, run } = useRun();
  return (
    <div className="space-y-2">
      <Msg m={msg} />
      <button className="btn-primary" disabled={busy || !!disabledReason} onClick={() => { if (window.confirm("Close this week and create payouts for everyone who reached the target?")) void run(() => closeWeek(weekStart)); }}>Close week and create payouts</button>
      {disabledReason && <p className="text-xs text-ink-mute">{disabledReason}</p>}
    </div>
  );
}

export function MarkPaid({ id }: { id: string }) {
  const { busy, msg, run } = useRun();
  return <span><button className="btn-secondary !px-3 !py-1" disabled={busy} onClick={() => run(() => markPaid(id))}>Mark paid</button>{msg && !msg.ok && <span role="alert" className="ml-2 text-xs text-red-700">{msg.message}</span>}</span>;
}
