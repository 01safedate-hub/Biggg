"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSlotRules } from "@/app/admin/ops-actions";

type V = { enabled: boolean; window: number; days: number; lead: number; capacity: number };

export function SlotRules({ initial }: { initial: V }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const num = (k: keyof V, label: string, min: number, max: number, hint: string) => (
    <label className="block text-sm font-medium">{label}<input type="number" min={min} max={max} value={v[k] as number} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-line px-3 py-2" /><span className="mt-1 block text-xs font-normal text-ink-mute">{hint}</span></label>
  );
  return (
    <form className="card space-y-4 p-5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMsg(null); const r = await saveSlotRules(v); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }}>
      <div><h2 className="text-lg font-semibold">Pickup time slots</h2><p className="mt-1 text-sm text-ink-soft">Lets customers choose a pickup window. Automatic dispatch holds the job until 30 minutes before the window. On days with shifts, a slot holds as many jobs as the agents on shift can take; otherwise the number below applies.</p></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} /><span><strong>Let customers choose a pickup time.</strong></span></label>
      <div className="grid gap-4 sm:grid-cols-2">
        {num("window", "Slot length (minutes)", 15, 240, "Usually 60.")}
        {num("days", "How many days ahead", 1, 30, "Customers can book up to this far in advance.")}
        {num("lead", "Earliest, from now (minutes)", 0, 1440, "Stops last-minute slots you cannot staff.")}
        {num("capacity", "Pickups per slot with no shifts", 1, 100, "Used on days with no roster.")}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save slot rules"}</button>
    </form>
  );
}
