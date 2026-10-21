"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toKobo, lagosToday } from "@/lib/money";
import { uploadEvidence, type EvidenceItem } from "@/lib/evidence";
import { friendlyError } from "@/lib/rpc-errors";
import { EvidenceUploader } from "./EvidenceUploader";
import { inputCls, labelCls } from "./ui";

export function CapitalForm() {
  const router = useRouter();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null); setDone(false);
    const f = new FormData(form);
    const label = String(f.get("label") ?? "").trim();
    const kobo = toKobo(String(f.get("amount") ?? ""));
    if (label.length < 3) return setError("Describe the cost (at least 3 characters).");
    if (!kobo) return setError("Enter the amount in naira, for example 250000.");
    if (items.length === 0) return setError("Add at least one receipt or bank debit screenshot.");
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const evidence = await uploadEvidence(supabase, user.id, items);
      const { error: err } = await supabase.rpc("add_capital_entry", {
        _kind: String(f.get("kind")), _label: label, _amount_kobo: kobo, _entered_on: String(f.get("entered_on")), _evidence: evidence,
      });
      if (err) throw new Error(friendlyError(err.message));
      setDone(true); setItems([]); form.reset(); router.refresh();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5" noValidate>
      <h2 className="text-lg font-semibold">Add a start-up cost</h2>
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {done && <p role="status" className="rounded-md border border-line bg-brand-tint p-3 text-sm">Start-up cost added.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={labelCls} htmlFor="label">What was bought or paid for?</label><input id="label" name="label" className={inputCls} placeholder="e.g. Industrial washing machine" required /></div>
        <div><label className={labelCls} htmlFor="amount">Amount (NGN)</label><input id="amount" name="amount" inputMode="decimal" className={inputCls} required /></div>
        <div><label className={labelCls} htmlFor="entered_on">Date paid</label><input id="entered_on" name="entered_on" type="date" max={lagosToday()} defaultValue={lagosToday()} className={inputCls} required /></div>
        <div className="sm:col-span-2"><label className={labelCls} htmlFor="kind">Type</label>
          <select id="kind" name="kind" className={inputCls} defaultValue="capital"><option value="capital">Start-up cost (capital)</option><option value="rent">Yearly rent</option></select></div>
      </div>
      <EvidenceUploader items={items} onChange={setItems} onError={setError} />
      <p className="text-xs text-ink-mute">Costs cannot be edited or deleted after saving. To correct one, void it with a reason and add it again.</p>
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save cost"}</button>
    </form>
  );
}
