"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reviewStudentId } from "@/app/staff/(app)/student-ids/actions";

export function StudentIdDecision({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go(approve: boolean) {
    if (!approve && !window.confirm("Reject this ID? The plan will be cancelled and a full refund queued.")) return;
    setBusy(true); setMsg(null);
    const r = await reviewStudentId(id, approve, reason);
    setBusy(false); setMsg({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  }
  return (
    <div className="space-y-2">
      <label className="block text-sm"><span className="font-medium">Reason, if rejecting</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="For example: the ID has expired" className="mt-1 w-full rounded-md border border-line px-3 py-2" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => go(true)}>Approve and start plan</button>
        <button type="button" className="btn-secondary" disabled={busy || reason.trim().length < 3} onClick={() => go(false)}>Reject and refund</button>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
