"use client";

import { useState } from "react";
import { startPayment } from "@/app/orders/actions";

type Provider = "paystack" | "flutterwave";

const PAYMENT_LOGOS: Record<Provider, { src: string; alt: string }> = {
  paystack: { src: "https://upload.wikimedia.org/wikipedia/commons/0/0b/Paystack_Logo.png", alt: "Paystack" },
  flutterwave: { src: "https://upload.wikimedia.org/wikipedia/commons/9/9e/Flutterwave_Logo.png", alt: "Flutterwave" },
};

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
    try {
      const r = await startPayment(orderId, purpose, p);
      if (r.ok && r.url) { window.location.assign(r.url); return; }
      setErr(r.message);
    } catch {
      setErr("Payment could not be started because of a connection error. Please try again.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-3">
      {err && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <div className="grid grid-cols-1 gap-3">
        {enabledProviders.includes("paystack") && <button type="button" className={`grid min-h-[88px] w-full min-w-0 grid-cols-[minmax(0,112px)_minmax(0,1fr)_20px] items-center gap-3 rounded-xl border bg-white px-3 py-4 text-left shadow-sm transition sm:grid-cols-[136px_minmax(0,1fr)_20px] sm:gap-4 sm:px-4 ${busy === "paystack" ? "cursor-wait opacity-60" : "border-line hover:border-brand hover:ring-2 hover:ring-brand/20"}`} disabled={!!busy} onClick={() => go("paystack")}>
          <span className="flex h-10 min-w-0 items-center justify-start overflow-hidden"><img src={PAYMENT_LOGOS.paystack.src} alt={PAYMENT_LOGOS.paystack.alt} width="136" height="32" className="block max-h-8 max-w-full object-contain object-left" /></span>
          <span className="block min-w-0"><span className="block whitespace-normal text-sm font-semibold leading-5 text-ink sm:text-base">{busy === "paystack" ? "Opening Paystack…" : label}</span><span className="mt-1 block text-xs leading-4 text-ink-soft">Secure online checkout</span></span>
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-xs text-ink-soft">{busy === "paystack" ? "…" : "↗"}</span>
        </button>}
        {enabledProviders.includes("flutterwave") && <button type="button" className={`grid min-h-[88px] w-full min-w-0 grid-cols-[minmax(0,112px)_minmax(0,1fr)_20px] items-center gap-3 rounded-xl border bg-white px-3 py-4 text-left shadow-sm transition sm:grid-cols-[136px_minmax(0,1fr)_20px] sm:gap-4 sm:px-4 ${busy === "flutterwave" ? "cursor-wait opacity-60" : "border-line hover:border-brand hover:ring-2 hover:ring-brand/20"}`} disabled={!!busy} onClick={() => go("flutterwave")}>
          <span className="flex h-10 min-w-0 items-center justify-start overflow-hidden"><img src={PAYMENT_LOGOS.flutterwave.src} alt={PAYMENT_LOGOS.flutterwave.alt} width="136" height="32" className="block max-h-8 max-w-full object-contain object-left" /></span>
          <span className="block min-w-0"><span className="block whitespace-normal text-sm font-semibold leading-5 text-ink sm:text-base">{busy === "flutterwave" ? "Opening Flutterwave…" : label}</span><span className="mt-1 block text-xs leading-4 text-ink-soft">Secure online checkout</span></span>
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-xs text-ink-soft">{busy === "flutterwave" ? "…" : "↗"}</span>
        </button>}
        {enabledProviders.length === 0 && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Online payments are temporarily unavailable. Please contact LaundryPoint for help.</p>}
      </div>
      {enabledProviders.length > 0 && <p className="text-xs text-ink-mute">Pay securely in the provider page that opens. Never share your PIN or OTP with an agent.</p>}
    </div>
  );
}
