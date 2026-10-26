"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addClient } from "@/app/staff/(app)/ops-actions";

export function AddClient() {
  const router = useRouter();
  const [v, setV] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = "mt-1 w-full rounded-md border border-line px-3 py-2";
  return (
    <form className="card space-y-3 p-5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMsg(null); const r = await addClient(v); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) { setV({ name: "", email: "", phone: "" }); router.refresh(); } }}>
      <h2 className="text-lg font-semibold">Add a client</h2>
      <p className="text-sm text-ink-soft">They get an email to choose a password. Clothes you count for them are accepted straight away, and they have 24 hours to tell us if the count is wrong.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Full name<input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={field} autoComplete="off" /></label>
        <label className="text-sm">Phone<input required inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className={field} autoComplete="off" /></label>
        <label className="text-sm">Email<input required type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} className={field} autoComplete="off" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? "Adding" : "Add client"}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
