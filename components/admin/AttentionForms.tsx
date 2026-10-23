"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { resolveIssueAction, resolveReview, waiveStorageFee } from "@/app/admin/ops-actions";

type R = { ok: boolean; message: string };

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  async function run(f: () => Promise<R>) { setBusy(true); const r = await f(); setBusy(false); setMsg(r); if (r.ok) router.refresh(); }
  return { busy, msg, run };
}
const Msg = ({ m }: { m: R | null }) => (m && !m.ok ? <p role="alert" className="text-xs text-red-700">{m.message}</p> : null);

export function WaiveButton({ orderId }: { orderId: string }) {
  const { busy, msg, run } = useAct();
  return (
    <div><button className="btn-secondary !px-3 !py-1" disabled={busy} onClick={() => { const why = window.prompt("Why are you waiving the storage fee?") ?? ""; if (why.trim().length >= 3) run(() => waiveStorageFee(orderId, why.trim())); }}>Waive fee</button><Msg m={msg} /></div>
  );
}

export function ReviewActions({ eventId }: { eventId: number }) {
  const { busy, msg, run } = useAct();
  const ask = (action: "refund" | "keep", q: string) => { const n = window.prompt(q) ?? ""; if (n.trim().length >= 3) run(() => resolveReview(eventId, action, n.trim())); };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-secondary !px-3 !py-1" disabled={busy} onClick={() => ask("refund", "Why refund this payment to the customer?")}>Refund it</button>
      <button className="btn-secondary !px-3 !py-1" disabled={busy} onClick={() => ask("keep", "How did you handle it? (for example: customer asked us to keep it as credit)")}>Handled, keep it</button>
      <Msg m={msg} />
    </div>
  );
}

export function IssueResolve({ id, maxNaira }: { id: string; maxNaira: number }) {
  const { busy, msg, run } = useAct();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [amt, setAmt] = useState("0");
  if (!open) return <button className="btn-secondary !px-3 !py-1" onClick={() => setOpen(true)}>Respond</button>;
  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <textarea aria-label="What we found and did" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder="What you found and what you did. The customer sees this." className="w-full rounded-md border border-line px-3 py-2 text-sm" />
      <label className="flex items-center gap-2 text-sm">Refund (naira, up to {maxNaira.toLocaleString("en-NG")})<input type="number" min={0} max={maxNaira} step="50" value={amt} onChange={(e) => setAmt(e.target.value)} className="w-28 rounded-md border border-line px-2 py-1" /></label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary !px-3 !py-1" disabled={busy || text.trim().length < 3} onClick={() => run(() => resolveIssueAction(id, "resolved", text, Number(amt) || 0))}>Resolve</button>
        <button className="btn-secondary !px-3 !py-1" disabled={busy || text.trim().length < 3} onClick={() => run(() => resolveIssueAction(id, "rejected", text, 0))}>Not valid</button>
        <button className="btn-secondary !px-3 !py-1" onClick={() => setOpen(false)}>Close</button>
      </div>
      <Msg m={msg} />
    </div>
  );
}
