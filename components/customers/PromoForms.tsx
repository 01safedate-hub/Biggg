"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPromoAction, setPromoActive } from "@/app/admin/customers/actions";
import { inputCls, labelCls } from "@/components/admin/ui";

export function PromoCreate() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="card space-y-4 p-5" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      const uses = String(f.get("uses") ?? "").trim();
      setBusy(true); setMsg(null);
      const r = await createPromoAction({ code: String(f.get("code") ?? ""), percent: Number(f.get("percent")), maxUses: uses ? Number(uses) : null, expires: String(f.get("expires") ?? "") || null, note: String(f.get("note") ?? "") });
      setBusy(false); setMsg({ ok: r.ok, text: r.message });
      if (r.ok) { form.reset(); router.refresh(); }
    }}>
      <h2 className="text-lg font-semibold">New discount code</h2>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-2 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><label htmlFor="code" className={labelCls}>Code</label><input id="code" name="code" required maxLength={20} placeholder="COMEBACK15" autoCapitalize="characters" className={`${inputCls} font-mono uppercase`} /></div>
        <div><label htmlFor="percent" className={labelCls}>Percent off clothes bill</label><input id="percent" name="percent" type="number" min={1} max={90} required defaultValue={10} className={inputCls} /></div>
        <div><label htmlFor="uses" className={labelCls}>Total uses (blank = no limit)</label><input id="uses" name="uses" type="number" min={1} className={inputCls} /></div>
        <div><label htmlFor="expires" className={labelCls}>Last valid day (optional)</label><input id="expires" name="expires" type="date" className={inputCls} /></div>
      </div>
      <div><label htmlFor="note" className={labelCls}>Note for yourself (optional)</label><input id="note" name="note" maxLength={120} placeholder="Win-back for one-time customers" className={inputCls} /></div>
      <p className="text-xs text-ink-mute">Each customer can use a code once. The discount comes off the clothes bill, not the transport fare, and follows the bill if the agent changes the list.</p>
      <button className="btn-primary" disabled={busy}>{busy ? "Creating" : "Create code"}</button>
    </form>
  );
}

export function PromoToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className="btn-secondary !px-3 !py-1" disabled={busy} onClick={async () => { setBusy(true); await setPromoActive(id, !active); setBusy(false); router.refresh(); }}>{active ? "Switch off" : "Switch on"}</button>;
}
