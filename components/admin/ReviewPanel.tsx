"use client";

import { useState } from "react";
import { reviewStaff } from "@/app/admin/staff/[id]/actions";
import { inputCls } from "./ui";

export function ReviewPanel({ userId, status, isAgent, hubReady }: { userId: string; status: string; isAgent?: boolean; hubReady?: boolean }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go(approve: boolean) {
    setBusy(true); setMsg(null);
    const r = await reviewStaff(userId, approve, note);
    setBusy(false); setMsg({ ok: r.ok, text: r.message });
  }
  return (
    <section className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">Final approval</h2>
      <p className="text-sm text-ink-soft">{isAgent ? "A super admin gives final approval only after the hub visit, secretary identity check, orientation and agreement are complete." : "Check the submitted details and approve when complete."}</p>
      {isAgent && <p className={`rounded border p-3 text-sm ${hubReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{hubReady ? "Hub verification and orientation are complete." : "Hub verification and orientation are not complete. Approval remains blocked."}</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for staff (required when requesting changes)" className={inputCls} aria-label="Note" />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || status === "verified" || (!!isAgent && !hubReady)} onClick={() => go(true)}>Approve and activate</button>
        <button className="btn-secondary" disabled={busy} onClick={() => go(false)}>Request changes</button>
      </div>
    </section>
  );
}
