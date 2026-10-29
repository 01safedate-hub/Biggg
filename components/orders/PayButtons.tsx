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
      <div className="grid grid-cols-1 gap-3">
        {enabledProviders.includes("paystack") && <button type="button" className={`grid min-h-[76px] w-full min-w-0 grid-cols-[minmax(0,112px)_minmax(0,1fr)] items-center gap-3 rounded-xl border px-3 py-4 text-left shadow-sm transition sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-4 sm:px-4 ${busy ? "cursor-wait opacity-60" : "hover:border-brand"} border-brand bg-brand text-white`} disabled={!!busy} onClick={() => go("paystack")}>
          <span className="flex h-9 min-w-0 items-center justify-start overflow-hidden rounded-md bg-white px-2"><img src="/paystack.svg" alt="Paystack" width="120" height="28" className="block max-h-7 max-w-full object-contain object-left" /></span>
          <span className="block min-w-0"><span className="block whitespace-normal text-sm font-semibold leading-5 sm:text-base">{busy === "paystack" ? "Opening Paystack…" : label}</span><span className="mt-1 block text-xs leading-4 text-white/85">Pay securely with Paystack</span></span>
        </button>}
        {enabledProviders.includes("flutterwave") && <button type="button" className={`grid min-h-[76px] w-full min-w-0 grid-cols-[minmax(0,112px)_minmax(0,1fr)] items-center gap-3 rounded-xl border border-line bg-white px-3 py-4 text-left shadow-sm transition sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-4 sm:px-4 ${busy ? "cursor-wait opacity-60" : "hover:border-brand"}`} disabled={!!busy} onClick={() => go("flutterwave")}>
          <span className="flex h-9 min-w-0 items-center justify-start overflow-hidden rounded-md bg-white px-1"><img src="/flutterwave.svg" alt="Flutterwave" width="120" height="28" className="block max-h-7 max-w-full object-contain object-left" /></span>
          <span className="block min-w-0"><span className="block whitespace-normal text-sm font-semibold leading-5 text-ink sm:text-base">{busy === "flutterwave" ? "Opening Flutterwave…" : label}</span><span className="mt-1 block text-xs leading-4 text-ink-soft">Pay securely with Flutterwave</span></span>
        </button>}
        {enabledProviders.length === 0 && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Online payments are temporarily unavailable. Please contact LaundryPoint for help.</p>}
      </div>
      {enabledProviders.length > 0 && <p className="text-xs text-ink-mute">Pay securely in the provider page that opens. Never share your PIN or OTP with an agent.</p>}
    </div>
  );
}
