"use client";

import { useState } from "react";
import { setClientOwner } from "@/app/admin/more-actions";

export function OwnerSelect({ clientId, current, agents }: { clientId: string; current: string | null; agents: { id: string; name: string }[] }) {
  const [v, setV] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="card space-y-2 p-4">
      <p className="text-sm font-medium">Brought in by</p>
      <p className="text-xs text-ink-soft">If the agent who counts for this client is the one who brought them in, the count is accepted automatically. Otherwise the client accepts it before paying.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Brought in by" value={v} onChange={(e) => setV(e.target.value)} className="rounded-md border border-line bg-white px-2 py-2 text-sm">
          <option value="">Nobody (booked by themselves)</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button type="button" className="btn-secondary" disabled={busy || v === (current ?? "")} onClick={async () => { setBusy(true); const r = await setClientOwner(clientId, v || null); setBusy(false); setMsg({ ok: r.ok, text: r.message }); }}>{busy ? "Saving" : "Save"}</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
