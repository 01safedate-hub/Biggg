"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { markEvidenceSent, openDisputeAction, resolveDisputeAction } from "@/app/admin/ops-actions";
import { inputCls, labelCls } from "@/components/admin/ui";

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  return m ? <p role={m.ok ? "status" : "alert"} className={`text-sm ${m.ok ? "text-emerald-700" : "text-red-700"}`}>{m.text}</p> : null;
}

export function OpenDispute() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="card space-y-3 p-5" onSubmit={async (e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setM(null);
      const r = await openDisputeAction(Number(f.get("no")), String(f.get("purpose")), String(f.get("reason")), String(f.get("due") ?? ""));
      setBusy(false); setM({ ok: r.ok, text: r.message }); if (r.ok && r.id) router.push(`/admin/disputes/${r.id}`);
    }}>
      <div><h2 className="text-lg font-semibold">Record a dispute by hand</h2><p className="mt-1 text-sm text-ink-soft">Paystack and Flutterwave tell us automatically. Use this if your bank or the provider emailed you first.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label htmlFor="d-no" className={labelCls}>Order number</label><input id="d-no" name="no" type="number" min={1} required className={inputCls} /></div>
        <div><label htmlFor="d-p" className={labelCls}>Which payment</label><select id="d-p" name="purpose" className={inputCls}><option value="items">Clothes bill</option><option value="pickup_fare">Transport (pickup and delivery)</option><option value="delivery_fare">Delivery fare</option><option value="demurrage">Storage fee</option></select></div>
        <div><label htmlFor="d-due" className={labelCls}>Reply by (optional)</label><input id="d-due" name="due" type="date" className={inputCls} /></div>
      </div>
      <div><label htmlFor="d-r" className={labelCls}>What the bank or provider said</label><input id="d-r" name="reason" required minLength={3} maxLength={500} className={inputCls} /></div>
      <Msg m={m} />
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Record dispute"}</button>
    </form>
  );
}

export function DisputeActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true); setM(null); const r = await fn(); setBusy(false); setM({ ok: r.ok, text: r.message }); if (r.ok) router.refresh();
  }
  if (status === "won" || status === "lost") return null;
  return (
    <div className="card space-y-3 p-5 print:hidden">
      <h2 className="text-lg font-semibold">What happened</h2>
      <div><label htmlFor="dn" className={labelCls}>Note (required)</label><input id="dn" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className={inputCls} placeholder="For example: sent the evidence by email on the dispute dashboard" /></div>
      <Msg m={m} />
      <div className="flex flex-wrap gap-2">
        {status === "open" && <button type="button" className="btn-secondary" disabled={busy || note.trim().length < 3} onClick={() => run(() => markEvidenceSent(id, note))}>I have sent the evidence</button>}
        <button type="button" className="btn-primary" disabled={busy || note.trim().length < 3} onClick={() => { if (window.confirm("The bank ruled for us. Release the order?")) void run(() => resolveDisputeAction(id, "won", note)); }}>We won</button>
        <button type="button" className="btn-secondary" disabled={busy || note.trim().length < 3} onClick={() => { if (window.confirm("We lost. This records a refund of the full amount in the books. Continue?")) void run(() => resolveDisputeAction(id, "lost", note)); }}>We lost</button>
      </div>
    </div>
  );
}
