"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAgentReferral } from "@/app/staff/(app)/referral-actions";

export function AddAgentReferral() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [values, setValues] = useState({ full_name: "", email: "", phone: "" });
  const field = "mt-1 w-full rounded-md border border-line px-3 py-2";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await createAgentReferral(values);
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) {
      setValues({ full_name: "", email: "", phone: "" });
      router.refresh();
    }
  }
  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <div>
        <h2 className="text-lg font-semibold">Refer a commission agent</h2>
        <p className="mt-1 text-sm text-ink-soft">Record someone you are recommending. This does not create an account or grant staff access.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Full name<input required minLength={2} maxLength={80} autoComplete="name" value={values.full_name} onChange={e=>setValues(v=>({...v,full_name:e.target.value}))} className={field}/></label>
        <label className="text-sm">Email<input required type="email" autoComplete="email" value={values.email} onChange={e=>setValues(v=>({...v,email:e.target.value}))} className={field}/></label>
        <label className="text-sm">Phone<input required type="tel" autoComplete="tel" value={values.phone} onChange={e=>setValues(v=>({...v,phone:e.target.value}))} className={field}/></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Record agent referral"}</button>
        {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
      </div>
    </form>
  );
}
