"use client";

import { useState } from "react";
import { startPayment } from "@/app/orders/actions";

export function PayButtons({ orderId, purpose, label }: { orderId: string; purpose: "pickup_fare" | "items" | "delivery_fare" | "demurrage"; label: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go(p: "paystack" | "flutterwave") {
    setBusy(p); setErr(null);
    const r = await startPayment(orderId, purpose, p);
    if (r.ok && r.url) { window.location.assign(r.url); return; }
    setBusy(null); setErr(r.message);
  }
  return (
    <div className="space-y-3">
      {err && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" disabled={!!busy} onClick={() => go("paystack")}>{busy === "paystack" ? "Opening Paystack" : `${label} with Paystack`}</button>
        <button className="btn-secondary" disabled={!!busy} onClick={() => go("flutterwave")}>{busy === "flutterwave" ? "Opening Flutterwave" : `${label} with Flutterwave`}</button>
      </div>
      <p className="text-xs text-ink-mute">Pay with card, bank transfer or USSD on your phone. Only pay inside the page that opens.</p>
    </div>
  );
}
