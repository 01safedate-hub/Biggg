"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveDispatchRules } from "@/app/admin/ops-actions";

export function DispatchRules({ initial }: { initial: { auto: boolean; maxJobs: number; reassignMin: number; needCheckin: boolean } }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="card space-y-4 p-5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMsg(null); const r = await saveDispatchRules(v); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }}>
      <div><h2 className="text-lg font-semibold">Automatic dispatch</h2><p className="mt-1 text-sm text-ink-soft">When on, every new paid pickup and every delivery goes to the best free agent within a minute. You can still change the agent by hand on the Dispatch page.</p></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={v.auto} onChange={(e) => setV({ ...v, auto: e.target.checked })} /><span><strong>Assign agents automatically.</strong> The agent with the fewest open jobs gets the next one; a tie goes to whoever has waited longest.</span></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={v.needCheckin} onChange={(e) => setV({ ...v, needCheckin: e.target.checked })} /><span>Only agents who have checked in on their shift. Recommended.</span></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Most open jobs per agent<input type="number" min={1} max={20} value={v.maxJobs} onChange={(e) => setV({ ...v, maxJobs: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-line px-3 py-2" /></label>
        <label className="block text-sm font-medium">Move a pickup to someone else after (minutes)<input type="number" min={10} max={480} value={v.reassignMin} onChange={(e) => setV({ ...v, reassignMin: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-line px-3 py-2" /><span className="mt-1 block text-xs font-normal text-ink-mute">If the agent has not reached the customer in this time. Deliveries get twice as long. A job moves at most 3 times, then it appears under Needs attention.</span></label>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save rules"}</button>
    </form>
  );
}
