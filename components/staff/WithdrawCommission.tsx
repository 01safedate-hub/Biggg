"use client";

import { useState } from "react";
import { requestWithdrawal } from "@/app/staff/(app)/commissions/actions";
import { naira } from "@/lib/format";

export type Wallet = { started: boolean; available_kobo: number; fee_pct: number; fee_kobo: number; net_kobo: number; minimum_kobo: number; pending_withdrawal: boolean; bank_ok: boolean };

export function WithdrawCommission({ w }: { w: Wallet }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const blocked = !w.started ? "Commission starts once LaundryPoint has recovered its start-up costs."
    : w.pending_withdrawal ? "You have a withdrawal waiting to be paid."
    : !w.bank_ok ? "Add your bank details in My details first. The account name must match your name."
    : w.available_kobo < w.minimum_kobo ? `You can withdraw once you have at least ${naira(w.minimum_kobo)} approved.` : null;
  return (
    <section className="card space-y-3 p-5" aria-label="Withdraw">
      <h2 className="text-lg font-semibold">Withdraw</h2>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-ink-mute">Approved</dt><dd className="text-lg font-semibold tabular-nums">{naira(w.available_kobo)}</dd></div>
        <div><dt className="text-ink-mute">Running costs ({w.fee_pct}%)</dt><dd className="text-lg font-semibold tabular-nums">−{naira(w.fee_kobo)}</dd></div>
        <div><dt className="text-ink-mute">You receive</dt><dd className="text-lg font-bold tabular-nums text-emerald-700">{naira(w.net_kobo)}</dd></div>
      </dl>
      <p className="text-xs text-ink-mute">{w.fee_pct}% of every withdrawal stays with LaundryPoint to cover running costs and expenses.</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-2 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.message}</p>}
      {!msg?.ok && (blocked ? <p className="text-sm text-ink-soft">{blocked}</p> : (
        <button type="button" className="btn-primary" disabled={busy} onClick={async () => {
          if (!window.confirm(`Withdraw ${naira(w.available_kobo)}?\n\n${w.fee_pct}% (${naira(w.fee_kobo)}) is kept for running costs. You will receive ${naira(w.net_kobo)} to your bank account after approval.`)) return;
          setBusy(true); setMsg(await requestWithdrawal()); setBusy(false);
        }}>{busy ? "Requesting" : `Withdraw ${naira(w.net_kobo)}`}</button>
      ))}
    </section>
  );
}
