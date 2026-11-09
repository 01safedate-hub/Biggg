"use client";

import { useState } from "react";
import { cancelExit, confirmSalaries, payOutSavings, recordDismissal } from "@/app/admin/savings/actions";
import { naira } from "@/lib/format";
import { toKobo } from "@/lib/money";

type R = { ok: boolean; message: string };
const Msg = ({ m }: { m: R | null }) => m ? <p role={m.ok ? "status" : "alert"} className={`rounded-md border p-2 text-sm ${m.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{m.message}</p> : null;

type Line = { staff_id: string; name: string; pct: number; salary_kobo: number };

/** Monthly step: confirm what each person was paid; their savings rate is put aside from it. */
export function ConfirmSalaries({ months, lines }: { months: { value: string; label: string }[]; lines: Line[] }) {
  const [month, setMonth] = useState(months[0]?.value ?? "");
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.staff_id, String(l.salary_kobo / 100)])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  const rows = lines.map((l) => { const k = toKobo(vals[l.staff_id] ?? "") ?? 0; const saved = Math.round((k * l.pct) / 100); return { ...l, k, saved }; });
  const totalSaved = rows.reduce((n, r) => n + r.saved, 0);
  if (!months.length) return <p className="text-sm text-ink-soft">Every month up to now is already confirmed.</p>;
  if (msg?.ok) return <Msg m={msg} />;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const label = months.find((m) => m.value === month)?.label ?? month;
      if (!window.confirm(`Confirm ${label} salaries for ${rows.length} people?\n\n${naira(totalSaved)} goes into their savings. This cannot be changed afterwards.`)) return;
      setBusy(true);
      setMsg(await confirmSalaries(month, rows.map((r) => ({ staff_id: r.staff_id, salary_kobo: r.k }))));
      setBusy(false);
    }}>
      <div>
        <label htmlFor="sal-month" className="block text-sm font-medium">Month</label>
        <select id="sal-month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 rounded-md border border-line px-3 py-2">
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink-mute"><th className="py-2 pr-2">Name</th><th className="py-2 pr-2">Salary paid (₦)</th><th className="py-2 pr-2">Saves</th><th className="py-2">Take-home</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.staff_id} className="border-b border-line">
                <td className="py-2 pr-2 font-medium">{r.name}</td>
                <td className="py-2 pr-2"><input aria-label={`${r.name} salary`} inputMode="decimal" value={vals[r.staff_id] ?? ""} onChange={(e) => setVals({ ...vals, [r.staff_id]: e.target.value })} className="w-24 rounded-md border border-line px-2 py-1" /></td>
                <td className="py-2 pr-2 tabular-nums"><span className="block">{r.pct}%</span><span className="whitespace-nowrap">{naira(r.saved)}</span></td>
                <td className="whitespace-nowrap py-2 tabular-nums">{naira(r.k - r.saved)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-soft">Pay each person their take-home amount. The rest is their savings.</p>
      <Msg m={msg} />
      <button className="btn-primary" disabled={busy || rows.length === 0}>{busy ? "Saving" : `Confirm salaries · ${naira(totalSaved)} to savings`}</button>
    </form>
  );
}

export function StaffSavingsActions({ staffId, name, balance, due, exitKind, paid }: { staffId: string; name: string; balance: number; due: boolean; exitKind: string | null; paid: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  const go = async (fn: () => Promise<R>) => { setBusy(true); setMsg(await fn()); setBusy(false); };
  if (msg?.ok) return <Msg m={msg} />;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {due && !paid && balance > 0 && (
        <button type="button" className="btn-primary !px-3 !py-1.5 text-sm" disabled={busy} onClick={() => {
          const ref = window.prompt(`Pay out ${naira(balance)} to ${name}.\n\nAfter making the transfer, enter how it was paid and the reference (for example: Transfer, GTB ref 123456):`);
          if (ref && ref.trim().length >= 3) void go(() => payOutSavings(staffId, ref.trim()));
        }}>Pay out {naira(balance)}</button>
      )}
      {!exitKind && (
        <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" disabled={busy} onClick={() => {
          const reason = window.prompt(`Record that ${name} was dismissed? Their savings (${naira(balance)}) become due straight away.\n\nReason:`);
          if (reason && reason.trim().length >= 3) void go(() => recordDismissal(staffId, reason.trim()));
        }}>Record dismissal</button>
      )}
      {exitKind && !paid && (
        <button type="button" className="text-sm text-ink-mute underline" disabled={busy} onClick={() => {
          if (window.confirm(`Withdraw ${name}'s ${exitKind === "dismissal" ? "dismissal" : "notice"}? They stay on staff and keep saving.`)) void go(() => cancelExit(staffId));
        }}>Withdraw {exitKind === "dismissal" ? "dismissal" : "notice"}</button>
      )}
      {msg && !msg.ok && <Msg m={msg} />}
    </div>
  );
}
