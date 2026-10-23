"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reschedulePickup } from "@/app/orders/actions";
import { SlotPicker } from "@/components/orders/SlotPicker";

export function RescheduleControl({ orderId, current }: { orderId: string; current: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const when = current ? new Date(current).toLocaleString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div className="space-y-2 text-sm">
      {when && <p>Pickup time: <strong>{when}</strong></p>}
      {!open ? <button type="button" className="font-medium text-brand-dark underline" onClick={() => setOpen(true)}>{when ? "Change the time" : "Choose a pickup time"}</button> : (
        <div className="space-y-3 rounded-md border border-line p-3">
          <SlotPicker value={slot} onChange={setSlot} />
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={!slot || busy} onClick={async () => { setBusy(true); setMsg(null); const r = await reschedulePickup(orderId, slot!); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) { setOpen(false); router.refresh(); } }}>{busy ? "Saving" : "Save new time"}</button>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-emerald-700" : "text-red-700"}>{msg.text}</p>}
    </div>
  );
}
