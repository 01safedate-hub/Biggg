"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { reopenBill, sendBill, showArrivalCode } from "@/app/staff/(app)/ops-actions";
import { naira } from "@/lib/format";

export function ArrivalCode({ orderId }: { orderId: string }) {
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
        <button className="btn-primary" onClick={async () => { const r = await showArrivalCode(orderId); if (r.ok && r.code) setCode(r.code); else setErr(r.message); }}>I have arrived: show my code</button>
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
