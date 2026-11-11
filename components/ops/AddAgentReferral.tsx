"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAgentReferral } from "@/app/staff/(app)/referral-actions";

export function AddAgentReferral() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [values, setValues] = useState({ full_name: "", email: "", phone: "" });
  const [sure, setSure] = useState(false);
  const field = "mt-1 w-full rounded-md border border-line px-3 py-2";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sure) { setMessage({ ok: false, text: "Tick the box to confirm this person will work for LaundryPoint as an agent. For a customer, use the Customer referrals tab." }); return; }
    setBusy(true);
    setMessage(null);
    const result = await createAgentReferral(values);
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) {
      setValues({ full_name: "", email: "", phone: "" });
      setSure(false);
      router.refresh();
    }
  }
  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <div>
        <h2 className="text-lg font-semibold">Refer a commission agent</h2>
        <p className="mt-1 text-sm text-ink-soft">Send an application invitation to someone you recommend. They must complete staff onboarding, attend hub/NIN verification, and receive final approval before they can work.</p>
      </div>
      <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><strong>This is not for customers.</strong> It makes the person a LaundryPoint agent (staff), and agents cannot place laundry orders. To add someone who wants their clothes washed, use the <strong>Customer referrals</strong> tab instead.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Full name<input required minLength={2} maxLength={80} autoComplete="name" value={values.full_name} onChange={e=>setValues(v=>({...v,full_name:e.target.value}))} className={field}/></label>
        <label className="text-sm">Email<input required type="email" autoComplete="email" value={values.email} onChange={e=>setValues(v=>({...v,email:e.target.value}))} className={field}/></label>
        <label className="text-sm">Phone<input required type="tel" autoComplete="tel" value={values.phone} onChange={e=>setValues(v=>({...v,phone:e.target.value}))} className={field}/></label>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-1" /> This person will work for LaundryPoint as a commission agent. They are not a customer.</label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy || !sure}>{busy ? "Saving…" : "Record agent referral"}</button>
        {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
      </div>
    </form>
  );
}
