"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Plan = { slug: string; name: string; priceKobo: number; pieces: number | null };

const naira = (kobo: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);

function PaystackMark() {
  return <img src="/payments/paystack.svg" alt="Paystack" width="112" height="28" className="h-7 w-28 shrink-0 object-contain object-left" />;
}
function FlutterwaveMark() {
  return <img src="/payments/flutterwave.svg" alt="Flutterwave" width="120" height="28" className="h-7 w-[120px] shrink-0 object-contain object-left" />;
}

export function SubscriptionCheckout({ plans, initialPlanSlug }: { plans: Plan[]; initialPlanSlug?: string }) {
  const [planSlug, setPlanSlug] = useState(plans.some((plan) => plan.slug === initialPlanSlug) ? initialPlanSlug! : plans[0]?.slug ?? "");
  const [message, setMessage] = useState("");
  const [busyProvider, setBusyProvider] = useState<"paystack" | "flutterwave" | null>(null);

  async function pay(provider: "paystack" | "flutterwave") {
    if (!planSlug || busyProvider) return;
    setBusyProvider(provider);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("pay-init", { body: { purpose: "subscription", plan_slug: planSlug, provider } });
      if (error) throw new Error(error.message || "Could not start payment. Please try again.");
      const result = data as { url?: string; error?: string } | null;
      if (!result?.url) throw new Error(result?.error ?? "Could not start payment. Please try again.");
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start payment. Please try again.");
      setBusyProvider(null);
    }
  }

  if (!plans.length) return <p className="card p-5">No monthly plans are available right now. Please try again later.</p>;
  return (
    <section className="card space-y-5 p-5">
      <div className="space-y-2"><label htmlFor="plan" className="block text-sm font-medium">Monthly plan</label><select id="plan" value={planSlug} onChange={e => setPlanSlug(e.target.value)} disabled={!!busyProvider} className="w-full rounded-lg border border-line bg-white p-3 disabled:opacity-60">{plans.map(p => <option key={p.slug} value={p.slug}>{p.name} — {naira(p.priceKobo)} / month · {p.pieces ?? "Plan"} pieces</option>)}</select></div>
      <div className="space-y-3">
        <p className="text-sm font-medium">Choose how you want to pay</p>
        <button type="button" disabled={!!busyProvider || !planSlug} onClick={() => pay("paystack")} className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#00C3F7] hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
          <PaystackMark />
          <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">Pay with Paystack</span><span className="block text-xs text-ink-soft">Secure online checkout</span></span>
          <span className="text-sm font-semibold text-ink-soft">{busyProvider === "paystack" ? "Opening…" : "Continue →"}</span>
        </button>
        <button type="button" disabled={!!busyProvider || !planSlug} onClick={() => pay("flutterwave")} className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#F5A623] hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
          <FlutterwaveMark />
          <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">Pay with Flutterwave</span><span className="block text-xs text-ink-soft">Secure online checkout</span></span>
          <span className="text-sm font-semibold text-ink-soft">{busyProvider === "flutterwave" ? "Opening…" : "Continue →"}</span>
        </button>
      </div>
      {message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}
      <p className="text-xs text-ink-mute">The server sets the amount from the active plan. Your plan only activates after provider verification.</p>
    </section>
  );
}
