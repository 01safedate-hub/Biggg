"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { failedDelivery, failedPickup, reopenBill, sendBill, showArrivalCode } from "@/app/staff/(app)/ops-actions";
import { naira } from "@/lib/format";

export function ArrivalCode({ orderId, step = "arrival", label = "I have arrived: show my code" }: { orderId: string; step?: "arrival" | "delivery"; label?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      {code ? (
        <div className="rounded-xl bg-slate-950 p-6 text-center text-white">
          <p className="text-xs uppercase tracking-widest text-slate-400">Show this to the customer</p>
          <p className="mt-2 text-5xl font-bold tracking-[0.4em]" aria-label={`Code ${code.split("").join(" ")}`}>{code}</p>
          <p className="mt-3 text-xs text-slate-400">They type it on their own phone. This page moves on by itself when they do.</p>
        </div>
      ) : (
        <button className="btn-primary" onClick={async () => { const r = await showArrivalCode(orderId, step); if (r.ok && r.code) setCode(r.code); else setErr(r.message); }}>{label}</button>
      )}
    </div>
  );
}

type Item = { id: string; name: string; price_kobo: number; category_id: string };
type Cat = { id: string; name: string };

export function Itemiser({ orderId, cats, items, initial }: { orderId: string; cats: Cat[]; items: Item[]; initial: Record<string, number> }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const total = useMemo(() => items.reduce((s, i) => s + (qty[i.id] ?? 0) * Number(i.price_kobo), 0), [items, qty]);
  const count = Object.values(qty).reduce((s, n) => s + n, 0);
  const set = (id: string, n: number) => setQty((p) => ({ ...p, [id]: Math.max(0, Math.min(200, n)) }));

  async function send() {
    if (!window.confirm(`Send a bill of ${naira(total)} for ${count} item${count === 1 ? "" : "s"} to the customer?`)) return;
    setBusy(true); setErr(null);
    const ids = new Set([...Object.keys(initial), ...Object.keys(qty)]);
    const lines = Array.from(ids).filter((id) => (qty[id] ?? 0) !== (initial[id] ?? 0) || (qty[id] ?? 0) > 0).map((item) => ({ item, qty: qty[item] ?? 0 }));
    const r = await sendBill(orderId, lines);
    setBusy(false);
    if (r.ok) router.refresh(); else setErr(r.message);
  }

  const term = q.trim().toLowerCase();
  return (
    <div className="space-y-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" aria-label="Search items" className="w-full rounded-md border border-line px-3 py-2.5 text-sm" />
      {cats.map((c) => {
        const list = items.filter((i) => i.category_id === c.id && (!term || i.name.toLowerCase().includes(term)));
        if (!list.length) return null;
        return (
          <section key={c.id} className="card p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-mute">{c.name}</h3>
            <ul className="mt-2 divide-y divide-line">
              {list.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{i.name}</p><p className="text-xs text-ink-mute">{naira(Number(i.price_kobo))} each</p></div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label={`Fewer ${i.name}`} className="h-9 w-9 rounded-md border border-line text-lg" onClick={() => set(i.id, (qty[i.id] ?? 0) - 1)}>−</button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{qty[i.id] ?? 0}</span>
                    <button type="button" aria-label={`More ${i.name}`} className="h-9 w-9 rounded-md border border-line text-lg" onClick={() => set(i.id, (qty[i.id] ?? 0) + 1)}>+</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <div className="sticky bottom-3 rounded-xl bg-slate-950 p-4 text-white shadow-xl">
        {err && <p role="alert" className="mb-2 text-sm text-red-300">{err}</p>}
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs text-slate-400">{count} item{count === 1 ? "" : "s"}</p><p className="text-xl font-bold">{naira(total)}</p></div>
          <button className="btn-primary" disabled={busy || count === 0} onClick={send}>{busy ? "Sending" : "Send bill to customer"}</button>
        </div>
      </div>
    </div>
  );
}

export function ReopenButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button className="btn-secondary" onClick={async () => { const r = await reopenBill(orderId); if (r.ok) router.refresh(); else setErr(r.message); }}>Withdraw bill to correct it</button>
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}

const FAIL: [string, string][] = [["no_answer", "Customer did not answer"], ["client_unavailable", "Customer is not around"], ["address_issue", "Cannot find the address"], ["refused", "Customer refused the delivery"]];

export function FailedDeliveryForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("no_answer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button className="btn-secondary" onClick={() => setOpen(true)}>I could not deliver</button>;
  return (
    <div className="space-y-3 rounded-md border border-line p-4">
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <p className="text-sm text-ink-soft">Call the customer first. Only log this after you have tried.</p>
      <select aria-label="What happened" value={why} onChange={(e) => setWhy(e.target.value)} className="w-full rounded-md border border-line px-3 py-2 text-sm">{FAIL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note, for example: called twice" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); const r = await failedDelivery(orderId, why, note); setBusy(false); if (r.ok) router.refresh(); else setErr(r.message); }}>Log it</button>
        <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

const PFAIL: [string, string][] = [["unreachable", "Customer is not picking up calls"], ["not_home", "Customer is not at the address"], ["address_issue", "Cannot find the address"], ["refused", "Customer no longer wants the pickup"]];

export function FailedPickupForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("unreachable");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button className="btn-secondary" onClick={() => setOpen(true)}>I could not do this pickup</button>;
  return (
    <div className="space-y-3 rounded-md border border-line p-4">
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <p className="text-sm text-ink-soft">Call the customer and wait a few minutes first. Only log this after you have tried. The customer keeps their paid transport and the office sends another agent.</p>
      <select aria-label="What happened" value={why} onChange={(e) => setWhy(e.target.value)} className="w-full rounded-md border border-line px-3 py-2 text-sm">{PFAIL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note, for example: called three times" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); const r = await failedPickup(orderId, why, note); setBusy(false); if (r.ok) router.push("/staff/jobs"); else setErr(r.message); }}>Log it</button>
        <button className="btn-secondary" onClick={() => setOpen(false)}>Back</button>
      </div>
    </div>
  );
}
