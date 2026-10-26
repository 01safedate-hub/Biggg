"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acceptCount, disputeCount } from "@/app/orders/actions";

export function AcceptCount({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-3 rounded-lg border border-brand/30 bg-brand-tint/50 p-4">
      <p className="text-sm">Please check this count against your clothes. If it is right, accept it to go on to payment. If something is wrong, tell your agent before you accept.</p>
      <button type="button" className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); setErr(null); const r = await acceptCount(orderId); setBusy(false); if (r.ok) router.refresh(); else setErr(r.message); }}>{busy ? "Saving" : "The count is correct: continue"}</button>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
    </div>
  );
}

export function ReportCount({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return <button type="button" className="text-sm font-medium text-brand-dark underline" onClick={() => setOpen(true)}>The count looks wrong</button>;
  return (
    <div className="space-y-2">
      <label className="block text-sm">What is wrong?
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} placeholder="For example: I gave 6 shirts, the list shows 5" className="mt-1 w-full rounded-md border border-line px-3 py-2" />
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={busy || note.trim().length < 3} onClick={async () => { setBusy(true); const r = await disputeCount(orderId, note); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }}>{busy ? "Sending" : "Tell us"}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
