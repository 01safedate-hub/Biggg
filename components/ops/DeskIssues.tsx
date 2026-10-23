"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deskResolveIssue } from "@/app/staff/(app)/ops-actions";

export function DeskIssueActions({ id, canRefund, limitNaira, paidNaira, suggested }: { id: string; canRefund: boolean; limitNaira: number; paidNaira: number; suggested: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [amt, setAmt] = useState(String(suggested || 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go(action: "resolve" | "reject" | "escalate") {
    setBusy(true); setErr(null);
    const r = await deskResolveIssue(id, action, text, Number(amt) || 0); setBusy(false);
    if (r.ok) router.refresh(); else setErr(r.message);
  }
  if (!open) return <button className="btn-secondary !px-3 !py-1" onClick={() => setOpen(true)}>Respond</button>;
  const n = Number(amt) || 0;
  const over = n > limitNaira;
  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <textarea aria-label="What you found and did" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder="What you found and did. The customer sees this if you resolve it." className="w-full rounded-md border border-line px-3 py-2 text-sm" />
      <label className="flex flex-wrap items-center gap-2 text-sm">Refund (naira, up to {paidNaira.toLocaleString("en-NG")} paid)<input type="number" min={0} max={paidNaira} step="50" value={amt} onChange={(e) => setAmt(e.target.value)} className="w-28 rounded-md border border-line px-2 py-1" /></label>
      {n > 0 && !canRefund && <p className="text-xs text-amber-800">You cannot refund. Use “Send up” and your amount becomes the suggestion.</p>}
      {n > 0 && canRefund && over && <p className="text-xs text-amber-800">Admins can refund up to ₦{limitNaira.toLocaleString("en-NG")}. This is above it, so send it up.</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary !px-3 !py-1" disabled={busy || text.trim().length < 3 || (n > 0 && (!canRefund || over))} onClick={() => go("resolve")}>Resolve</button>
        <button className="btn-secondary !px-3 !py-1" disabled={busy || text.trim().length < 3} onClick={() => go("reject")}>Not valid</button>
        <button className="btn-secondary !px-3 !py-1" disabled={busy || text.trim().length < 3} onClick={() => go("escalate")}>Send up to super admin</button>
        <button className="btn-secondary !px-3 !py-1" onClick={() => setOpen(false)}>Close</button>
      </div>
    </div>
  );
}
