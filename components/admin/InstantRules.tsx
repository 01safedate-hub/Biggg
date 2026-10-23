"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveInstantRules } from "@/app/admin/ops-actions";

type V = { enabled: boolean; feeNaira: number; targetHours: number; largeItems: number; largeHours: number; pickupMinutes: number };

export function InstantRules({ initial }: { initial: V }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const num = (k: keyof V, label: string, min: number, max: number, hint: string) => (
    <label className="block text-sm font-medium">{label}<input type="number" min={min} max={max} value={v[k] as number} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-line px-3 py-2" /><span className="mt-1 block text-xs font-normal text-ink-mute">{hint}</span></label>
  );
  return (
    <form className="card space-y-4 p-5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMsg(null); const r = await saveInstantRules(v); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }}>
      <div><h2 className="text-lg font-semibold">Targets and instant delivery</h2><p className="mt-1 text-sm text-ink-soft">Customers add instant delivery when their bill appears. The clock starts when they pay that bill. Customers with a large load are told it can take longer.</p></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} /><span><strong>Offer instant delivery.</strong> Orders already running keep their promise.</span></label>
      <div className="grid gap-4 sm:grid-cols-2">
        {num("feeNaira", "Extra fee per item (naira)", 0, 10000, "Usually 500. Applies to every item on the bill.")}
        {num("targetHours", "Target (hours)", 1, 24, "Usually 4.")}
        {num("largeItems", "Large load above (items)", 5, 500, "More items than this and the customer is warned.")}
        {num("largeHours", "Large load can take up to (hours)", 1, 48, "Shown to the customer. Usually 8.")}
        {num("pickupMinutes", "Pickup target (minutes)", 5, 240, "From a paid booking to the agent arriving. Usually 30.")}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save"}</button>
    </form>
  );
}
