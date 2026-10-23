"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyPromoCode, removePromoCode } from "@/app/orders/actions";

export function PromoForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return <button type="button" className="text-sm font-medium text-brand-dark underline" onClick={() => setOpen(true)}>Have a discount code?</button>;
  return (
    <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMsg(null); const r = await applyPromoCode(orderId, code); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }}>
      <label htmlFor="promo" className="block text-sm font-medium">Discount code</label>
      <div className="flex gap-2"><input id="promo" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} autoCapitalize="characters" autoComplete="off" className="w-48 rounded-md border border-line px-3 py-2 font-mono uppercase tracking-wider focus:border-brand focus:outline-none" /><button className="btn-secondary" disabled={busy || code.trim().length < 4}>{busy ? "Checking" : "Apply"}</button></div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </form>
  );
}

export function RemovePromo({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button type="button" className="text-sm font-medium text-brand-dark underline" disabled={busy} onClick={async () => { setBusy(true); setErr(null); const r = await removePromoCode(orderId); setBusy(false); if (r.ok) router.refresh(); else setErr(r.message); }}>{busy ? "Removing" : "Remove code"}</button>
      {err && <span role="alert" className="ml-2 text-sm text-red-700">{err}</span>}
    </span>
  );
}
