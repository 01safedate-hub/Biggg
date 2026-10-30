"use client";

import { useState } from "react";
import { reviewStaff } from "@/app/admin/staff/[id]/actions";
import { inputCls } from "./ui";

export function ReviewPanel({ userId, status, hubVerified }: { userId: string; status: string; hubVerified: boolean }) {
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
      <h2 className="text-lg font-semibold">Verification</h2>
      <p className="text-sm text-ink-soft">Online profile approval is a separate step. A successful in-person hub identity check must be recorded first.</p>\n      {!hubVerified && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Approval is blocked until the hub identity check passes.</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the staff member (needed to request changes)" className={inputCls} aria-label="Note" />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || status === "verified" || !hubVerified} onClick={() => go(true)}>Mark verified</button>
        <button className="btn-secondary" disabled={busy} onClick={() => go(false)}>Request changes</button>
      </div>
    </section>
  );
}
