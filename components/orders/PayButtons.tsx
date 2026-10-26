"use client";

import { useState } from "react";
import { startPayment } from "@/app/orders/actions";

type Provider = "paystack" | "flutterwave";

export function PayButtons({ orderId, purpose, label, enabledProviders = ["paystack", "flutterwave"] }: {
  orderId: string;
  purpose: "pickup_fare" | "items" | "delivery_fare" | "demurrage";
  label: string;
  enabledProviders?: Provider[];
}) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go(p: Provider) {
    setBusy(p); setErr(null);
    const r = await startPayment(orderId, purpose, p);
    if (r.ok && r.url) { window.location.assign(r.url); return; }
    setBusy(null); setErr(r.message);
  }
  return (
    <div className="space-y-3">
      {err && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <div className="flex flex-wrap gap-3">
        {enabledProviders.includes("paystack") && <button type="button" className="btn-primary inline-flex items-center gap-3" disabled={!!busy} onClick={() => go("paystack")}>
          <img src="/paystack.svg" alt="" width="84" height="24" className="h-6 w-auto" />
          <span>{busy === "paystack" ? "Opening Paystack…" : label}</span>
        </button>}
        {enabledProviders.includes("flutterwave") && <button type="button" className="btn-secondary inline-flex items-center gap-3" disabled={!!busy} onClick={() => go("flutterwave")}>
          <img src="/flutterwave.svg" alt="" width="108" height="24" className="h-6 w-auto" />
          <span>{busy === "flutterwave" ? "Opening Flutterwave…" : label}</span>
        </button>}
        {enabledProviders.length === 0 && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Online payments are temporarily unavailable. Please contact LaundryPoint for help.</p>}
      </div>
      {enabledProviders.length > 0 && <p className="text-xs text-ink-mute">Pay securely in the provider page that opens. Never share your PIN or OTP with an agent.</p>}
    </div>
  );
}
