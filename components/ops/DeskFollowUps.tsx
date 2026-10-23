"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logContact } from "@/app/staff/(app)/ops-actions";

const OUT: [string, string][] = [["reached", "Spoke to the customer"], ["rescheduled", "Agreed a new time"], ["no_answer", "No answer"], ["wrong_number", "Wrong or dead number"]];

export function LogContactForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [out, setOut] = useState("reached");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button className="btn-primary !px-4 !py-2" onClick={() => setOpen(true)}>Log a call</button>;
  return (
    <form className="space-y-3 rounded-md border border-line p-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      const iso = out === "rescheduled" && when ? new Date(when).toISOString() : null;
      const r = await logContact(orderId, out, note, iso); setBusy(false);
      if (r.ok) { setOpen(false); setNote(""); router.refresh(); } else setErr(r.message);
    }}>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <select aria-label="How did the call go" value={out} onChange={(e) => setOut(e.target.value)} className="w-full rounded-md border border-line px-3 py-2 text-sm">{OUT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      {out === "rescheduled" && <label className="block text-sm font-medium">New time the customer agreed<input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 w-full rounded-md border border-line px-3 py-2" /></label>}
      <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} maxLength={500} placeholder="What was said" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
      <div className="flex gap-2"><button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save call"}</button><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}
