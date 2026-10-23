"use client";

import { useState } from "react";
import { addExpenseCategory, addItem, addItemCategory, addMoneyPoint, renameExpenseCategory, saveItem, setMoneyPointActive } from "@/app/admin/catalog-actions";
import { toKobo } from "@/lib/money";
import { inputCls, labelCls } from "./ui";

type R = { ok: boolean; message: string };
function useRun() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  return { busy, msg, run: async (fn: () => Promise<R>) => { setBusy(true); setMsg(null); const r = await fn(); setBusy(false); setMsg(r); return r; } };
}
const Msg = ({ m }: { m: R | null }) => m ? <p role={m.ok ? "status" : "alert"} className={`rounded-md border p-2 text-sm ${m.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{m.message}</p> : null;

export function AddMoneyPoint() {
  const { busy, msg, run } = useRun();
  return (
    <form className="card space-y-4 p-5" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget; const f = new FormData(form);
      const ob = String(f.get("opening") ?? "").trim();
      const kobo = ob === "" || ob === "0" ? 0 : toKobo(ob);
      if (kobo == null) return;
      const r = await run(() => addMoneyPoint({ name: String(f.get("name")), kind: String(f.get("kind")), bank_name: String(f.get("bank_name") ?? ""), account_name: String(f.get("account_name") ?? ""), account_number: String(f.get("account_number") ?? ""), opening_balance_kobo: kobo }));
      if (r.ok) form.reset();
    }}>
      <h2 className="text-lg font-semibold">Add a money point</h2>
      <Msg m={msg} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label htmlFor="mp-name" className={labelCls}>Name</label><input id="mp-name" name="name" required className={inputCls} placeholder="e.g. Shop POS" /></div>
        <div><label htmlFor="mp-kind" className={labelCls}>Type</label><select id="mp-kind" name="kind" className={inputCls}><option value="cash">Cash drawer</option><option value="pos">POS</option><option value="bank">Bank account</option><option value="online">Online (Paystack)</option></select></div>
        <div><label htmlFor="mp-open" className={labelCls}>Opening balance (₦)</label><input id="mp-open" name="opening" inputMode="decimal" defaultValue="0" className={inputCls} /></div>
        <div><label htmlFor="mp-bank" className={labelCls}>Bank (optional)</label><input id="mp-bank" name="bank_name" className={inputCls} /></div>
        <div><label htmlFor="mp-an" className={labelCls}>Account name (optional)</label><input id="mp-an" name="account_name" className={inputCls} /></div>
        <div><label htmlFor="mp-no" className={labelCls}>Account number (optional)</label><input id="mp-no" name="account_number" inputMode="numeric" maxLength={10} className={inputCls} /></div>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? "Adding" : "Add"}</button>
    </form>
  );
}

export function PointToggle({ id, active }: { id: string; active: boolean }) {
  const { busy, msg, run } = useRun();
  return <span><button className="btn-secondary !px-3 !py-1" disabled={busy} onClick={() => run(() => setMoneyPointActive(id, !active))}>{active ? "Turn off" : "Turn on"}</button>{msg && !msg.ok && <span role="alert" className="ml-2 text-xs text-red-700">{msg.message}</span>}</span>;
}

export function AddCategory({ kind }: { kind: "expense" | "item" }) {
  const { busy, msg, run } = useRun();
  return (
    <form className="card space-y-3 p-5" onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const n = String(new FormData(form).get("name") ?? ""); const r = await run(() => kind === "expense" ? addExpenseCategory(n) : addItemCategory(n)); if (r.ok) form.reset(); }}>
      <h2 className="text-lg font-semibold">{kind === "expense" ? "Add an expense category" : "Add a group"}</h2>
      <Msg m={msg} />
      <div className="flex gap-2"><input name="name" required aria-label="Name" className={inputCls + " !mt-0"} /><button className="btn-primary" disabled={busy}>Add</button></div>
    </form>
  );
}

export function RenameCategory({ id, name }: { id: string; name: string }) {
  const { busy, msg, run } = useRun();
  const [v, setV] = useState(name);
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => renameExpenseCategory(id, v)); }}>
      <input value={v} onChange={(e) => setV(e.target.value)} aria-label="Category name" className="w-full max-w-xs rounded-md border border-line px-3 py-1.5 text-sm" />
      <button className="btn-secondary !px-3 !py-1.5" disabled={busy || v.trim() === name}>Save</button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.message}</span>}
    </form>
  );
}

export function ItemRow({ id, name, priceKobo, active }: { id: string; name: string; priceKobo: number; active: boolean }) {
  const { busy, msg, run } = useRun();
  const [n, setN] = useState(name);
  const [p, setP] = useState(String(priceKobo / 100));
  const [a, setA] = useState(active);
  const kobo = p.trim() === "0" ? 0 : toKobo(p);
  const dirty = n !== name || kobo !== priceKobo || a !== active;
  return (
    <li className="grid gap-2 py-2 sm:grid-cols-[1fr_9rem_auto_auto] sm:items-center">
      <input value={n} onChange={(e) => setN(e.target.value)} aria-label="Item name" className="rounded-md border border-line px-3 py-1.5 text-sm" />
      <input value={p} onChange={(e) => setP(e.target.value)} inputMode="decimal" aria-label="Price in naira" className="rounded-md border border-line px-3 py-1.5 text-sm" />
      <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={a} onChange={(e) => setA(e.target.checked)} /> On sale</label>
      <div className="flex items-center gap-2">
        <button className="btn-secondary !px-3 !py-1.5" disabled={busy || !dirty || kobo == null} onClick={() => run(() => saveItem(id, { name: n, price_kobo: kobo!, active: a }))}>Save</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.message}</span>}
      </div>
    </li>
  );
}

export function AddItem({ categoryId }: { categoryId: string }) {
  const { busy, msg, run } = useRun();
  return (
    <form className="flex flex-wrap items-center gap-2 pt-3" onSubmit={async (e) => {
      e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
      const raw = String(f.get("price") ?? "").trim(); const kobo = raw === "0" ? 0 : toKobo(raw);
      if (kobo == null) return;
      const r = await run(() => addItem(categoryId, { name: String(f.get("name")), price_kobo: kobo }));
      if (r.ok) form.reset();
    }}>
      <input name="name" required placeholder="New item" aria-label="New item name" className="rounded-md border border-line px-3 py-1.5 text-sm" />
      <input name="price" required inputMode="decimal" placeholder="₦ price" aria-label="Price in naira" className="w-28 rounded-md border border-line px-3 py-1.5 text-sm" />
      <button className="btn-secondary !px-3 !py-1.5" disabled={busy}>Add item</button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.message}</span>}
    </form>
  );
}
