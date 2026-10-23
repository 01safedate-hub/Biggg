"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { assignAgent, checkLine, receiveOrder } from "@/app/staff/(app)/ops-actions";

export function AssignForm({ orderId, agents, current }: { orderId: string; agents: { id: string; name: string; open_jobs: number }[]; current: string | null }) {
  const router = useRouter();
  const [agent, setAgent] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select aria-label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
          <option value="">Choose an agent</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.open_jobs} open)</option>)}
        </select>
        <button className="btn-primary !px-4 !py-2" disabled={busy || !agent || agent === current} onClick={async () => { setBusy(true); setMsg(null); const r = await assignAgent(orderId, agent); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }}>{current ? "Reassign" : "Assign"}</button>
      </div>
      {msg && !msg.ok && <p role="alert" className="text-sm text-red-700">{msg.text}</p>}
    </div>
  );
}

export function CheckLines({ orderId, lines }: { orderId: string; lines: { id: string; name: string; category_name: string | null; qty: number; check_state: string; check_note: string | null }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const allOk = lines.length > 0 && lines.every((l) => l.check_state === "ok");

  async function mark(id: string, ok: boolean) {
    let note = "";
    if (!ok) { note = window.prompt("What is wrong? (for example: this is a duvet, not a shirt)") ?? ""; if (note.trim().length < 3) return; }
    setBusy(id); setErr(null);
    const r = await checkLine(orderId, id, ok, note);
    setBusy(null);
    if (r.ok) router.refresh(); else setErr(r.message);
  }

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <ul className="card divide-y divide-line">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium">{l.qty} × {l.name}</p><p className="text-xs text-ink-mute">Agent put it in: {l.category_name}</p>
              {l.check_state === "flagged" && <p className="mt-1 text-sm text-red-700">Flagged: {l.check_note}</p>}</div>
            <div className="flex gap-2">
              <button className={`rounded-md border px-3 py-1.5 text-sm font-medium ${l.check_state === "ok" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-line"}`} disabled={busy === l.id} onClick={() => mark(l.id, true)}>{l.check_state === "ok" ? "Correct ✓" : "Correct"}</button>
              <button className={`rounded-md border px-3 py-1.5 text-sm font-medium ${l.check_state === "flagged" ? "border-red-500 bg-red-50 text-red-800" : "border-line"}`} disabled={busy === l.id} onClick={() => mark(l.id, false)}>Wrong category</button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn-primary" disabled={!allOk || busy === "recv"} onClick={async () => { setBusy("recv"); const r = await receiveOrder(orderId); setBusy(null); if (r.ok) router.push("/staff/receiving"); else setErr(r.message); }}>Mark as received</button>
      {!allOk && <p className="text-xs text-ink-mute">Every line must be marked correct. A wrong category has to be sorted out with the customer and the super admin before it can be received.</p>}
    </div>
  );
}
