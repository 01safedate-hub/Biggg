"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toKobo, lagosToday } from "@/lib/money";
import { uploadEvidence, type EvidenceItem } from "@/lib/evidence";
import { friendlyError } from "@/lib/rpc-errors";
import { EvidenceUploader } from "./EvidenceUploader";
import { inputCls, labelCls } from "./ui";

type Opt = { id: string; name: string };

export function ExpenseForm({ categories, points, autoApproved }: { categories: Opt[]; points: Opt[]; autoApproved: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null); setDone(null);
    const f = new FormData(form);
    const label = String(f.get("label") ?? "").trim();
    const kobo = toKobo(String(f.get("amount") ?? ""));
    if (label.length < 3) return setError("Describe what this was for (at least 3 characters).");
    if (!kobo) return setError("Enter the amount in naira, for example 15000 or 15000.50.");
    if (items.length === 0) return setError("Add at least one receipt or bank debit screenshot.");

    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const evidence = await uploadEvidence(supabase, user.id, items);
      const { error: err } = await supabase.rpc("submit_expense", {
        _label: label, _amount_kobo: kobo, _category_id: String(f.get("category")), _spent_on: String(f.get("spent_on")),
        _money_point_id: String(f.get("point")), _vendor: String(f.get("vendor") ?? ""), _evidence: evidence,
      });
      if (err) throw new Error(friendlyError(err.message));
      setDone(autoApproved ? "Expense recorded and approved." : "Expense sent for approval. It will count once the super admin approves it.");
      setItems([]); form.reset(); router.refresh();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5" noValidate>
      <h2 className="text-lg font-semibold">Record an expense</h2>
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {done && <p role="status" className="rounded-md border border-line bg-brand-tint p-3 text-sm">{done}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={labelCls} htmlFor="label">What was it for?</label><input id="label" name="label" className={inputCls} placeholder="e.g. Fuel for the delivery bike" required /></div>
        <div><label className={labelCls} htmlFor="amount">Amount (NGN)</label><input id="amount" name="amount" inputMode="decimal" className={inputCls} placeholder="15000" required /></div>
        <div><label className={labelCls} htmlFor="spent_on">Date spent</label><input id="spent_on" name="spent_on" type="date" max={lagosToday()} defaultValue={lagosToday()} className={inputCls} required /></div>
        <div><label className={labelCls} htmlFor="category">Category</label>
          <select id="category" name="category" className={inputCls} required defaultValue="">{<option value="" disabled>Choose</option>}{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className={labelCls} htmlFor="point">Paid from</label>
          <select id="point" name="point" className={inputCls} required defaultValue="">{<option value="" disabled>Choose</option>}{points.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="sm:col-span-2"><label className={labelCls} htmlFor="vendor">Paid to <span className="font-normal text-ink-mute">(optional)</span></label><input id="vendor" name="vendor" className={inputCls} /></div>
      </div>
      <EvidenceUploader items={items} onChange={setItems} onError={setError} />
      <p className="text-xs text-ink-mute">Once saved, an expense cannot be edited or deleted. A mistake is corrected by voiding it with a reason.</p>
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : autoApproved ? "Save expense" : "Send for approval"}</button>
    </form>
  );
}
