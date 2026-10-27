"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { deskAddItem, deskSendCount, failedDelivery, failedPickup, reopenBill, sendBill, showArrivalCode } from "@/app/staff/(app)/ops-actions";
import { StainFlag } from "@/components/ops/StainFlag";
import { naira } from "@/lib/format";

export function ArrivalCode({ orderId, step = "arrival", label = "I have arrived: show my code" }: { orderId: string; step?: "arrival" | "delivery"; label?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
        <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); setErr(null); const r = await showArrivalCode(orderId, step); setBusy(false); if (r.ok && r.code) setCode(r.code); else setErr(r.message); }}>{busy ? "Generating code…" : label}</button>
      )}
    </div>
  );
}

type Item = { id: string; name: string; price_kobo: number; category_id: string; description?: string | null };
type Cat = { id: string; name: string };
type InstantCfg = { perItemKobo: number };

function ConfirmCountModal({ lines, total, count, instantFee, desk, subscription, busy, onCancel, onOk }: {
  lines: { id: string; name: string; qty: number; instant: number; stain: boolean }[]; total: number; count: number; instantFee: number; desk: boolean; subscription: boolean; busy: boolean; onCancel: () => void; onOk: () => void;
}) {
  const stains = lines.filter((l) => l.stain).length;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [busy, onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 sm:items-center" onClick={() => { if (!busy) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="cc-title" className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-line p-5">
          <h2 id="cc-title" className="text-lg font-semibold">{subscription ? "Confirm garment count" : desk ? "Confirm the count with the customer" : "Send this bill to the customer?"}</h2>
          <p className="mt-1 text-sm text-ink-soft">{subscription ? "Record every garment, whatever its type. The monthly allowance is applied automatically; any excess pieces are billed to the customer online." : desk ? "Read each line out loud while the customer watches. They also get an email with this list." : "The customer will see every line and must accept it before paying."}</p>
        </div>
        <ul className="divide-y divide-line overflow-y-auto px-5 text-sm">
          {lines.map((l) => (
            <li key={l.id} className={`flex items-center justify-between gap-3 py-2.5 ${l.stain ? "-mx-5 bg-amber-50 px-5" : ""}`}>
              <span className="min-w-0">
                <span className="font-medium">{l.name}</span>
                {l.instant > 0 && <span className="ml-2 rounded bg-brand-tint px-1.5 py-0.5 text-xs font-semibold text-brand-dark">{l.instant === l.qty ? "instant" : `${l.instant} instant`}</span>}
                {l.stain && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-semibold text-amber-950">hard stain</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">× {l.qty}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-line p-5 text-sm">
          <p className="flex justify-between"><span>Total items</span><strong>{count}</strong></p>
          {stains > 0 && <p className="flex justify-between text-amber-900"><span>Items with hard stains</span><strong>{stains}</strong></p>}
          {!subscription && instantFee > 0 && <p className="flex justify-between"><span>Instant delivery</span><strong>{naira(instantFee)}</strong></p>}
          {!subscription && <p className="flex justify-between text-base"><span>Clothes</span><strong>{naira(total)}</strong></p>}
          <div className="flex flex-wrap justify-end gap-2 pt-3">
            <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>Go back and change</button>
            <button type="button" className="btn-primary" autoFocus disabled={busy} onClick={onOk}>{busy ? "Saving" : subscription ? "Save garment count" : desk ? "Yes, this is correct" : "Send bill"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddItemForm({ cats }: { cats: Cat[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(cats[0]?.id ?? "");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return <button type="button" className="text-sm font-medium text-brand-dark underline" onClick={() => setOpen(true)}>Item not in the list? Add a new item</button>;
  return (
    <form className="space-y-3 rounded-lg border border-line bg-canvas p-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      const r = await deskAddItem(cat, name, Number(price), desc);
      setBusy(false);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) { setName(""); setPrice(""); setDesc(""); router.refresh(); }
    }}>
      <p className="text-sm font-semibold">Add a new item to the price list</p>
      <p className="text-xs text-ink-soft">It becomes available to everyone straight away and is recorded in the audit log with your name.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Group<select value={cat} onChange={(e) => setCat(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-white px-2 py-2">{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-sm">Item name<input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} className="mt-1 w-full rounded-md border border-line bg-white px-2 py-2" /></label>
        <label className="block text-sm">Price each (naira)<input value={price} onChange={(e) => setPrice(e.target.value)} required inputMode="numeric" pattern="[0-9]+(\.[0-9]{1,2})?" className="mt-1 w-full rounded-md border border-line bg-white px-2 py-2" /></label>
        <label className="block text-sm">Short description (optional)<input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} className="mt-1 w-full rounded-md border border-line bg-white px-2 py-2" /></label>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-800" : "text-red-700"}`}>{msg.text}</p>}
      <div className="flex gap-3"><button className="btn-primary" disabled={busy || !cat}>{busy ? "Adding" : "Add item"}</button><button type="button" className="text-sm underline" onClick={() => setOpen(false)}>Close</button></div>
    </form>
  );
}

export function Itemiser({ orderId, cats, items, initial, desk = false, instant, stainedNames = [], canAddItem = false, subscription = false }: {
  orderId: string; cats: Cat[]; items: Item[]; initial: Record<string, number>; desk?: boolean; instant?: InstantCfg; stainedNames?: string[]; canAddItem?: boolean; subscription?: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>(initial);
  const [inst, setInst] = useState<Record<string, number>>({});
  const [stained, setStained] = useState<string[]>(stainedNames);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const total = useMemo(() => items.reduce((s, i) => s + (qty[i.id] ?? 0) * Number(i.price_kobo), 0), [items, qty]);
  const count = Object.values(qty).reduce((s, n) => s + n, 0);
  const instCount = items.reduce((s, i) => s + Math.min(inst[i.id] ?? 0, qty[i.id] ?? 0), 0);
  const instantFee = (instant?.perItemKobo ?? 0) * instCount;
  const set = (id: string, n: number) => { const v = Math.max(0, Math.min(200, n)); setQty((p) => ({ ...p, [id]: v })); setInst((p) => (p[id] > v ? { ...p, [id]: v } : p)); };
  const setI = (id: string, n: number) => setInst((p) => ({ ...p, [id]: Math.max(0, Math.min(qty[id] ?? 0, n)) }));
  const chosen = items.filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ id: i.id, name: i.name, qty: qty[i.id], instant: Math.min(inst[i.id] ?? 0, qty[i.id]), stain: stained.some((n) => n === i.name) }));

  async function send() {
    setBusy(true); setErr(null);
    const ids = new Set([...Object.keys(initial), ...Object.keys(qty)]);
    const lines = Array.from(ids).filter((id) => (qty[id] ?? 0) !== (initial[id] ?? 0) || (qty[id] ?? 0) > 0).map((item) => ({ item, qty: qty[item] ?? 0 }));
    const split = desk ? chosen.filter((c) => c.instant > 0).map((c) => ({ item: c.id, qty: c.instant })) : [];
    const r = desk ? await deskSendCount(orderId, lines, split) : await sendBill(orderId, lines);
    setBusy(false);
    if (r.ok) { setConfirming(false); router.refresh(); } else { setConfirming(false); setErr(r.message); }
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
                <li key={i.id} className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{i.name}</p><p className="text-xs text-ink-mute">{subscription ? "Garment count · included in monthly allowance" : `${naira(Number(i.price_kobo))} each`}</p></div>
                    <div className="flex items-center gap-2">
                      <button type="button" aria-label={`Fewer ${i.name}`} className="h-9 w-9 rounded-md border border-line text-lg" onClick={() => set(i.id, (qty[i.id] ?? 0) - 1)}>−</button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{qty[i.id] ?? 0}</span>
                      <button type="button" aria-label={`More ${i.name}`} className="h-9 w-9 rounded-md border border-line text-lg" onClick={() => set(i.id, (qty[i.id] ?? 0) + 1)}>+</button>
                    </div>
                  </div>
                  {i.description && <details className="mt-1 text-xs text-ink-soft"><summary className="cursor-pointer font-medium text-brand-dark">View description</summary><p className="mt-1">{i.description}</p></details>}
                  {!subscription && instant && (qty[i.id] ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-brand-tint px-3 py-2 text-xs">
                      <span className="font-medium text-brand-dark">Instant ({naira(instant.perItemKobo)} each):</span>
                      <button type="button" aria-label={`Fewer instant ${i.name}`} className="h-7 w-7 rounded border border-line bg-white" onClick={() => setI(i.id, (inst[i.id] ?? 0) - 1)}>−</button>
                      <span className="w-6 text-center font-semibold tabular-nums">{Math.min(inst[i.id] ?? 0, qty[i.id] ?? 0)}</span>
                      <button type="button" aria-label={`More instant ${i.name}`} className="h-7 w-7 rounded border border-line bg-white" onClick={() => setI(i.id, (inst[i.id] ?? 0) + 1)}>+</button>
                      <span className="text-ink-soft">of {qty[i.id]}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {canAddItem && cats.length > 0 && <AddItemForm cats={cats} />}
      {desk && chosen.length > 0 && (
        <StainFlag orderId={orderId} lines={chosen.map((c) => ({ id: c.id, name: c.name }))} nameOnly onFlagged={(n) => setStained((p) => (p.includes(n) ? p : [...p, n]))} />
      )}
      <div className="sticky bottom-3 rounded-xl bg-slate-950 p-4 text-white shadow-xl">
        {err && <p role="alert" className="mb-2 text-sm text-red-300">{err}</p>}
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs text-slate-400">{count} piece{count === 1 ? "" : "s"} recorded{!subscription && instCount > 0 ? ` · ${instCount} instant` : ""}</p>{!subscription && <p className="text-xl font-bold">{naira(total + instantFee)}</p>}</div>
          <button className="btn-primary" disabled={busy || count === 0} onClick={() => { setErr(null); setConfirming(true); }}>{subscription ? "Review garment count" : desk ? "Confirm the count" : "Send bill to customer"}</button>
        </div>
      </div>
      {confirming && <ConfirmCountModal lines={chosen} total={total} count={count} instantFee={instantFee} desk={desk} subscription={subscription} busy={busy} onCancel={() => setConfirming(false)} onOk={send} />}
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
