"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reportIssue } from "@/app/orders/actions";

const KINDS: [string, string][] = [["missing_item", "Something is missing"], ["damaged", "Something is damaged"], ["wrong_item", "I got someone else's item"], ["not_clean", "Not clean enough"], ["other", "Something else"]];

export function IssueForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("missing_item");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return <button type="button" className="text-sm font-medium text-red-700 underline" onClick={() => setOpen(true)}>Something wrong with this order?</button>;
  return (
    <form className="space-y-3 rounded-md border border-line bg-white p-4 text-ink" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMsg(null); const r = await reportIssue(orderId, kind, text); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) { setOpen(false); router.refresh(); } }}>
      <select aria-label="What went wrong" value={kind} onChange={(e) => setKind(e.target.value)} className="w-full rounded-md border border-line px-3 py-2 text-sm">{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <textarea aria-label="Tell us what happened" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} required minLength={3} placeholder="Tell us what happened, for example which item" className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" />
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      <div className="flex gap-2"><button className="btn-primary" disabled={busy || text.trim().length < 3}>{busy ? "Sending" : "Send report"}</button><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}
