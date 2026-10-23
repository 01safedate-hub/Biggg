"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enterArrivalCode } from "@/app/orders/actions";

export function ArrivalCodeForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMsg(null); const r = await enterArrivalCode(orderId, code); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }}>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <label htmlFor="arrival" className="block text-sm font-medium">Code shown by your agent</label>
      <input id="arrival" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="w-40 rounded-md border border-line px-3 py-3 text-center text-2xl font-bold tracking-[0.5em] focus:border-brand focus:outline-none" placeholder="0000" />
      <div><button className="btn-primary" disabled={busy || code.length !== 4}>{busy ? "Checking" : "Confirm my agent"}</button></div>
    </form>
  );
}
