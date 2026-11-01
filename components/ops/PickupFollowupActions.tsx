"use client";

import { useState, useTransition } from "react";
import { updatePickupFollowup } from "@/app/staff/(app)/subscription-pickup-calls/actions";

export function PickupFollowupActions({ followupId, initialNotes }: { followupId: string; initialNotes: string }) {
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState<"pending" | "confirmed" | "rescheduled" | "skipped">("pending");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function save(next: "confirmed" | "rescheduled" | "skipped") {
    startTransition(async () => {
      const result = await updatePickupFollowup(followupId, next, notes);
      setMessage(result.ok ? "Call outcome saved." : (result.error ?? "Could not save the call outcome. Please try again."));
      if (result.ok) setStatus(next);
    });
  }
  return <div className="space-y-2">
    <label className="block text-sm font-medium" htmlFor={followupId + "-notes"}>Call notes</label>
    <textarea id={followupId + "-notes"} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} className="field w-full" placeholder="Customer response or new preferred date (if rescheduling)" />
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending || status !== "pending"} onClick={() => save("confirmed")} className="btn-primary">Confirmed by phone</button>
      <button type="button" disabled={pending || status !== "pending"} onClick={() => save("rescheduled")} className="btn-secondary">Reschedule follow-up</button>
      <button type="button" disabled={pending || status !== "pending"} onClick={() => save("skipped")} className="btn-secondary">Skip follow-up</button>
    </div>
    {message && <p role="status" className="text-sm text-ink-soft">{message}</p>}
  </div>;
}
