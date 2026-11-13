"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { waiveOrderTransport } from "@/app/staff/(app)/transport/actions";

/** Make the transport on one unpaid order free, with a reason that is logged. */
export function WaiveTransport({ orderId, amountKobo }: { orderId: string; amountKobo: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button type="button" className="btn-secondary mt-3" onClick={() => setOpen(true)}>Make transport free</button>;
  return (
    <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await waiveOrderTransport(orderId, reason); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }); }}>
      <label htmlFor="waive-reason" className="block text-sm font-medium">Why is transport free on this order? (₦{(amountKobo / 100).toLocaleString("en-NG")})</label>
      <input id="waive-reason" required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="For example: redelivery after a complaint" />
      <div className="flex gap-2"><button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Confirm free transport"}</button><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button></div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-800" : "text-red-700"}`}>{msg.text}</p>}
    </form>
  );
}
