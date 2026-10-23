"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addWalkinCustomer, deskCancelWalkin, deskHandover, deskReopenCount, deskTakePayment, findDeskCustomers, startWalkin } from "@/app/staff/(app)/ops-actions";
import { inputCls, labelCls } from "@/components/admin/ui";

type Found = { id: string; name: string; phone: string | null; is_walk_in: boolean; orders: number };

export function WalkinStart() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Found[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const r = await findDeskCustomers(q);
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setRows(r.rows); setAdding(r.rows.length === 0);
    if (r.rows.length === 0 && /\d{4,}/.test(q)) setPhone(q.replace(/[^\d+]/g, ""));
  }
  async function begin(customerId: string) {
    setBusy(true); setErr(null);
    const r = await startWalkin(customerId, notes);
    if (r.ok && r.id) { router.push(`/staff/walkin/${r.id}`); return; }
    setBusy(false); setErr(r.message);
  }
  async function addAndBegin(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const c = await addWalkinCustomer(name, phone);
    if (!c.ok || !c.id) { setBusy(false); return setErr(c.message); }
    await begin(c.id);
  }
  return (
    <div className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">New walk-in customer order</h2>
      {err && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1"><label htmlFor="wq" className={labelCls}>Phone number or name</label><input id="wq" value={q} onChange={(e) => setQ(e.target.value)} minLength={3} required className={inputCls} placeholder="08012345678" inputMode="search" /></div>
        <button className="btn-secondary" disabled={busy}>Find</button>
      </form>
      <div><label htmlFor="wn" className={labelCls}>Note for this order (optional)</label><input id="wn" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className={inputCls} placeholder="For example: two suits need extra care" /></div>
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div><p className="font-medium">{c.name}</p><p className="text-ink-soft">{c.phone ?? "No phone"} · {c.orders} order{c.orders === 1 ? "" : "s"}{c.is_walk_in ? " · desk customer" : ""}</p></div>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => begin(c.id)}>Start order</button>
            </li>
          ))}
        </ul>
      )}
      {rows && !adding && <button type="button" className="text-sm font-medium text-brand-dark underline" onClick={() => setAdding(true)}>Not them? Add a new customer</button>}
      {adding && (
        <form onSubmit={addAndBegin} className="space-y-3 rounded-md border border-line bg-canvas p-4">
          <p className="text-sm text-ink-soft">No match. Add them now. They get no emails unless they later sign up themselves with this phone number.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="an" className={labelCls}>Full name</label><input id="an" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={inputCls} /></div>
            <div><label htmlFor="ap" className={labelCls}>Phone number</label><input id="ap" value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" className={inputCls} /></div>
          </div>
          <button className="btn-primary" disabled={busy}>{busy ? "Starting" : "Add customer and start order"}</button>
        </form>
      )}
    </div>
  );
}

export function WalkinPay({ orderId, points, due }: { orderId: string; points: { id: string; name: string }[]; due: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"cash" | "transfer" | "pos">("cash");
  const [point, setPoint] = useState(points[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (points.length === 0) return <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No cash, bank or POS money point is set up yet. The super admin must add one first.</p>;
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!window.confirm(`Confirm you have received ${due} (${mode}) from the customer?`)) return;
      setBusy(true); setErr(null);
      const r = await deskTakePayment(orderId, mode, point, note);
      setBusy(false);
      if (r.ok) router.refresh(); else setErr(r.message);
    }}>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How they paid">
        {(["cash", "transfer", "pos"] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`rounded-md border px-4 py-2 text-sm ${mode === m ? "border-brand bg-brand-tint font-semibold text-brand-dark" : "border-line"}`}>{m === "cash" ? "Cash" : m === "transfer" ? "Bank transfer" : "POS card"}</button>)}
      </div>
      <div><label htmlFor="mp" className={labelCls}>Money goes into</label><select id="mp" value={point} onChange={(e) => setPoint(e.target.value)} className={inputCls}>{points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      {mode !== "cash" && <div><label htmlFor="pn" className={labelCls}>{mode === "transfer" ? "Sender name or transfer reference" : "POS receipt number"}</label><input id="pn" value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} maxLength={200} className={inputCls} /></div>}
      <button className="btn-primary" disabled={busy || !point}>{busy ? "Recording" : `Record ${due} received`}</button>
    </form>
  );
}

export function WalkinActions({ orderId, kind }: { orderId: string; kind: "reopen" | "handover" | "cancel" }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run(fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) {
    setBusy(true); setErr(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    if (after) after(); else router.refresh();
  }
  return (
    <div className="space-y-2">
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      {kind === "reopen" && <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => deskReopenCount(orderId))}>Change the count</button>}
      {kind === "handover" && <button type="button" className="btn-primary" disabled={busy} onClick={() => { if (window.confirm("Hand the clean clothes to the customer now?")) void run(() => deskHandover(orderId)); }}>{busy ? "Saving" : "Customer has collected their clothes"}</button>}
      {kind === "cancel" && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-red-700">Cancel this order</summary>
          <div className="mt-2 space-y-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Why? (required)" aria-label="Reason" className={inputCls} />
            <button type="button" className="btn-secondary" disabled={busy || note.trim().length < 3} onClick={() => { if (window.confirm("Cancel this walk-in order? Nothing has been paid.")) void run(() => deskCancelWalkin(orderId, note), () => router.push("/staff/walkin")); }}>Cancel order</button>
          </div>
        </details>
      )}
    </div>
  );
}
