"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Plan = { slug: string; name: string; priceKobo: number; pieces: number | null; yearlyDiscountPct?: number };
type BillingPeriod = "monthly" | "six_month" | "yearly";
const naira = (kobo: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);
const months: Record<BillingPeriod, number> = { monthly: 1, six_month: 6, yearly: 12 };
const discount: Record<BillingPeriod, number> = { monthly: 0, six_month: 5, yearly: 10 };

function PaystackMark() {
  return <img src="https://upload.wikimedia.org/wikipedia/commons/0/0b/Paystack_Logo.png" alt="Paystack" width="136" height="32" className="h-8 w-28 shrink-0 object-contain object-left sm:w-[136px]" />;
}
function FlutterwaveMark() {
  return <img src="https://upload.wikimedia.org/wikipedia/commons/9/9e/Flutterwave_Logo.png" alt="Flutterwave" width="136" height="32" className="h-8 w-[136px] shrink-0 object-contain object-left" />;
}

export function SubscriptionCheckout({ plans, initialPlanSlug }: { plans: Plan[]; initialPlanSlug?: string }) {
  const [planSlug, setPlanSlug] = useState(plans.some((plan) => plan.slug === initialPlanSlug) ? initialPlanSlug! : plans[0]?.slug ?? "");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [message, setMessage] = useState("");
  const [busyProvider, setBusyProvider] = useState<"paystack" | "flutterwave" | null>(null);
  const selectedPlan = plans.find((plan) => plan.slug === planSlug);
  const monthsCount = months[billingPeriod];
  const discountPct = billingPeriod === "yearly" ? (selectedPlan?.yearlyDiscountPct ?? discount.yearly) : discount[billingPeriod];
  const totalKobo = selectedPlan ? Math.round(selectedPlan.priceKobo * monthsCount * (1 - discountPct / 100)) : 0;

  async function pay(provider: "paystack" | "flutterwave") {
    if (!planSlug || busyProvider) return;
    setBusyProvider(provider);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("pay-init", { body: { purpose: "subscription", plan_slug: planSlug, billing_period: billingPeriod, provider } });
      if (error) throw new Error(error.message || "Could not start payment. Please try again.");
      const result = data as { url?: string; error?: string } | null;
      if (!result?.url) throw new Error(result?.error ?? "Could not start payment. Please try again.");
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start payment. Please try again.");
      setBusyProvider(null);
    }
  }

  if (!plans.length) return <p className="card p-5">No subscription plans are available right now. Please try again later.</p>;
  return (
    <section className="card space-y-5 p-5">
      <div className="space-y-2"><label htmlFor="plan" className="block text-sm font-medium">Subscription plan</label><select id="plan" value={planSlug} onChange={e => setPlanSlug(e.target.value)} disabled={!!busyProvider} className="w-full rounded-lg border border-line bg-white p-3 disabled:opacity-60">{plans.map(p => <option key={p.slug} value={p.slug}>{p.name} — {naira(p.priceKobo)} / month · {p.pieces ?? "Plan"} pieces</option>)}</select></div>
      <div className="space-y-2"><label htmlFor="billing-period" className="block text-sm font-medium">Billing duration</label><select id="billing-period" value={billingPeriod} onChange={e => setBillingPeriod(e.target.value as BillingPeriod)} disabled={!!busyProvider} className="w-full rounded-lg border border-line bg-white p-3 disabled:opacity-60"><option value="monthly">1 month — no discount</option><option value="six_month">6 months — 5% discount</option><option value="yearly">12 months — 10% discount</option></select></div>
      <div className="rounded-lg bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Duration</span><strong>{monthsCount} months</strong></div><div className="mt-2 flex justify-between"><span>Discount</span><strong>{discountPct}%</strong></div><div className="mt-2 flex justify-between text-base"><span>Total payable</span><strong>{naira(totalKobo)}</strong></div><p className="mt-2 text-xs text-ink-soft">Final amount is calculated and validated by the server before checkout.</p></div>
      <div className="space-y-3"><p className="text-sm font-medium">Choose how you want to pay</p>
        <button type="button" disabled={!!busyProvider || !planSlug} onClick={() => pay("paystack")} className="flex min-h-20 w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-line bg-white px-3 py-4 text-left shadow-sm transition hover:border-[#00C3F7] hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:gap-4 sm:px-4"><PaystackMark /><span className="min-w-0 flex-1"><span className="block whitespace-nowrap text-sm font-semibold text-ink sm:text-base">{busyProvider === "paystack" ? "Opening Paystack…" : "Pay with Paystack"}</span><span className="mt-1 block text-xs text-ink-soft">Secure online checkout</span></span></button>
        <button type="button" disabled={!!busyProvider || !planSlug} onClick={() => pay("flutterwave")} className="flex min-h-20 w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-line bg-white px-3 py-4 text-left shadow-sm transition hover:border-[#F5A623] hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:gap-4 sm:px-4"><FlutterwaveMark /><span className="min-w-0 flex-1"><span className="block whitespace-nowrap text-sm font-semibold text-ink sm:text-base">{busyProvider === "flutterwave" ? "Opening Flutterwave…" : "Pay with Flutterwave"}</span><span className="mt-1 block text-xs text-ink-soft">Secure online checkout</span></span></button>
      </div>
      {message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}
    </section>
  );
}
