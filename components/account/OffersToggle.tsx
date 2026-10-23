"use client";

import { useState } from "react";
import { setOffers } from "@/app/orders/actions";

export function OffersToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={on} onChange={async (e) => { const next = e.target.checked; setOn(next); const r = await setOffers(next); setMsg(r.message); if (!r.ok) setOn(!next); }} />
        <span><strong>Send me offers and reminders by email.</strong><span className="block text-ink-soft">Discounts and news from LaundryPoint. Updates about your orders are always sent either way. You can change this at any time.</span></span></label>
      {msg && <p role="status" className="mt-2 text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
