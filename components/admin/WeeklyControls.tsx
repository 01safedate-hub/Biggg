"use client";

import { useState } from "react";
import { markPaid, setTeamTarget } from "@/app/admin/weekly/actions";
import { toKobo } from "@/lib/money";
import { naira } from "@/lib/format";
import { inputCls, labelCls } from "./ui";

type R = { ok: boolean; message: string };
function useRun() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  return { busy, msg, run: async (fn: () => Promise<R>) => { setBusy(true); setMsg(null); const r = await fn(); setBusy(false); setMsg(r); return r; } };
}
const Msg = ({ m }: { m: R | null }) => m ? <p role={m.ok ? "status" : "alert"} className={`rounded-md border p-2 text-sm ${m.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{m.message}</p> : null;

/** Owner-only form. Shows live what each person would receive before saving. */
export function TeamTargetForm({ weekStart, label, units, poolKobo, members, feePct, editing }: {
  weekStart: string; label: string; units: number | null; poolKobo: number | null; members: number; feePct: number; editing: boolean;
}) {
  const { busy, msg, run } = useRun();
  const [u, setU] = useState(units ? String(units) : "");
  const [pool, setPool] = useState(poolKobo ? String(poolKobo / 100) : "");
  const poolK = toKobo(pool) ?? 0;
  const gross = members > 0 ? Math.floor(poolK / members) : 0;
  const fee = Math.round((gross * feePct) / 100);
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const n = Number(u);
      if (!Number.isInteger(n) || n < 1 || !poolK) return;
      if (!window.confirm(`${editing ? "Update" : "Set"} the target for ${label} to ${n.toLocaleString("en-NG")} clothes with a ${naira(poolK)} pool?\n\nEveryone on the weekly target (${members}) will be emailed.`)) return;
      void run(() => setTeamTarget(weekStart, n, poolK));
    }}>
      <Msg m={msg} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor={`tt-u-${weekStart}`} className={labelCls}>Clothes to wash as a team</label>
          <input id={`tt-u-${weekStart}`} value={u} onChange={(e) => setU(e.target.value.replace(/\D/g, ""))} inputMode="numeric" required className={inputCls} placeholder="e.g. 800" /></div>
        <div><label htmlFor={`tt-p-${weekStart}`} className={labelCls}>Pool to share (₦)</label>
          <input id={`tt-p-${weekStart}`} value={pool} onChange={(e) => setPool(e.target.value)} inputMode="decimal" required className={inputCls} placeholder="e.g. 100000" /></div>
      </div>
      {poolK > 0 && members > 0 && (
        <p className="rounded-md bg-canvas p-3 text-sm text-ink-soft">
          Shared equally by <b className="text-ink">{members}</b>: {naira(gross)} each, less {feePct}% for running costs ({naira(fee)}) = <b className="text-ink">{naira(gross - fee)} each</b>.
        </p>
      )}
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : editing ? "Update target and email the team" : "Set target and email the team"}</button>
    </form>
  );
}

export function MarkPaid({ id, name, amount }: { id: string; name: string; amount: number }) {
  const { busy, msg, run } = useRun();
  if (msg?.ok) return <span className="text-sm font-medium text-emerald-700">Paid</span>;
  return (
    <div className="space-y-1">
      <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" disabled={busy}
        onClick={() => { if (window.confirm(`Mark ${naira(amount)} to ${name} as paid? Only do this after the transfer has gone through.`)) void run(() => markPaid(id)); }}>
        {busy ? "Saving" : "Mark paid"}
      </button>
      {msg && !msg.ok && <Msg m={msg} />}
    </div>
  );
}
