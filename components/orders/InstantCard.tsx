"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chooseInstant } from "@/app/orders/actions";
import { naira } from "@/lib/format";

export type InstantQuote = { enabled: boolean; per_item_kobo: number; items: number; fee_kobo: number; on: boolean; target_hours: number; large: boolean; large_hours: number };

export function InstantCard({ orderId, q }: { orderId: string; q: InstantQuote }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!q.enabled || q.per_item_kobo <= 0) return null;
  async function toggle() {
    setBusy(true); setErr(null);
    const r = await chooseInstant(orderId, !q.on);
    setBusy(false);
    if (r.ok) router.refresh(); else setErr(r.message);
  }
  return (
    <div className={`rounded-lg border p-4 ${q.on ? "border-brand bg-brand-tint" : "border-line bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">Need it fast? Instant delivery</p>
          <p className="mt-1 text-sm text-ink-soft">We aim to bring your clean clothes back within <strong>{q.target_hours} hours</strong> of your payment. It costs {naira(q.per_item_kobo)} more per item: <strong>{naira(q.fee_kobo)}</strong> for your {q.items} item{q.items === 1 ? "" : "s"}. Your delivery fare is already paid.</p>
          {q.large && <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-950">You have a lot of clothes. A load this size can take up to <strong>{q.large_hours} hours</strong> even with instant delivery, though we will aim to be faster.</p>}
        </div>
        <button type="button" className={q.on ? "btn-secondary" : "btn-primary"} onClick={toggle} disabled={busy}>{busy ? "Saving" : q.on ? "Remove instant" : `Add instant for ${naira(q.fee_kobo)}`}</button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}
