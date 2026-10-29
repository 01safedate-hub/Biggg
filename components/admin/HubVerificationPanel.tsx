"use client";

import { useState } from "react";
import { recordHubVerification } from "@/app/admin/staff/[id]/actions";
import { inputCls } from "./ui";

type HubRecord = {
  outcome: string;
  person_present: boolean;
  nin_document_checked: boolean;
  nin_matches_profile: boolean;
  photo_matches_person: boolean;
  referee_checked: boolean;
  hub_location: string;
  notes: string | null;
  verified_at: string;
};

export function HubVerificationPanel({ userId, record }: { userId: string; record: HubRecord | null }) {
  const [checks, setChecks] = useState({ person_present: false, nin_document_checked: false, nin_matches_profile: false, photo_matches_person: false, referee_checked: false });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(outcome: "passed" | "rejected") {
    setBusy(true); setMsg(null);
    const r = await recordHubVerification(userId, { outcome, ...checks, notes });
    setBusy(false); setMsg(r);
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">In-person hub identity check</h2>
      <p className="text-sm text-ink-soft">Only record this after the person physically attends the LaundryPoint hub. Compare their NIN document to the submitted NIN and compare the person to their staff photo. The NIN itself is not copied into this record.</p>
      {record && <div className="rounded border border-line p-3 text-sm"><p><strong>Latest result:</strong> {record.outcome} · {record.hub_location}</p><p>Recorded {new Date(record.verified_at).toLocaleString()}</p>{record.notes && <p>Note: {record.notes}</p>}</div>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <div className="space-y-2">
        {([
          ["person_present", "Agent physically present at LaundryPoint hub"],
          ["nin_document_checked", "Original NIN document checked in person"],
          ["nin_matches_profile", "NIN details match the submitted profile"],
          ["photo_matches_person", "Person matches the submitted staff photo"],
          ["referee_checked", "Referee details checked (where applicable)"],
        ] as const).map(([key, label]) => <label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checks[key]} onChange={e => setChecks(old => ({ ...old, [key]: e.target.checked }))} /><span>{label}</span></label>)}
      </div>
      <div><label htmlFor={`hub-note-${userId}`} className="mb-1 block text-sm font-medium">Verification notes</label><textarea id={`hub-note-${userId}`} className={inputCls} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Record any relevant outcome or discrepancy; do not enter the full NIN." /></div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || !checks.person_present || !checks.nin_document_checked || !checks.nin_matches_profile || !checks.photo_matches_person} onClick={() => submit("passed")}>{busy ? "Saving…" : "Record successful hub check"}</button>
        <button className="btn-secondary" disabled={busy || notes.trim().length < 3} onClick={() => submit("rejected")}>{busy ? "Saving…" : "Record failed check"}</button>
      </div>
    </section>
  );
}
