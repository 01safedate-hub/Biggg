"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { rateOrder } from "@/app/orders/actions";

export function RatingForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="mt-4 space-y-3" onSubmit={async (e) => { e.preventDefault(); if (!stars) return; setBusy(true); setErr(null); const r = await rateOrder(orderId, stars, comment); setBusy(false); if (r.ok) router.refresh(); else setErr(r.message); }}>
      <p className="text-sm font-medium">How was your delivery?</p>
      <div role="radiogroup" aria-label="Rating" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setStars(n)} className={`text-3xl leading-none ${n <= stars ? "text-amber-500" : "text-slate-300"} hover:text-amber-400`}>★</button>
        ))}
      </div>
      <textarea aria-label="Comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2} placeholder="Anything we should know? (optional)" className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" />
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <button className="btn-primary" disabled={busy || !stars}>{busy ? "Sending" : "Send rating"}</button>
    </form>
  );
}
