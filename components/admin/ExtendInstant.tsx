"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { extendInstant } from "@/app/admin/more-actions";

export function ExtendInstant({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mins, setMins] = useState(60);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button type="button" className="text-sm font-medium text-brand-dark underline" onClick={() => setOpen(true)}>Give more time</button>;
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-md bg-canvas p-2 text-sm">
      <select aria-label="Extra time" value={mins} onChange={(e) => setMins(Number(e.target.value))} className="rounded-md border border-line px-2 py-1">
        {[30, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} more minutes</option>)}
      </select>
      <input aria-label="Reason for the customer" placeholder="Reason, the customer will see it" value={note} onChange={(e) => setNote(e.target.value)} maxLength={150} className="min-w-48 flex-1 rounded-md border border-line px-2 py-1" />
      <button type="button" className="btn-primary" disabled={busy || note.trim().length < 3} onClick={async () => { setBusy(true); setErr(null); const r = await extendInstant(orderId, mins, note); setBusy(false); if (r.ok) { setOpen(false); setNote(""); router.refresh(); } else setErr(r.message); }}>{busy ? "Saving" : "Extend"}</button>
      <button type="button" className="text-ink-soft underline" onClick={() => setOpen(false)}>Cancel</button>
      {err && <span role="alert" className="w-full text-red-700">{err}</span>}
    </div>
  );
}
