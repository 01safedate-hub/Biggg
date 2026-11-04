"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { naira } from "@/lib/format";

type BillingPeriod = "monthly" | "three_month" | "six_month" | "yearly";
type Plan = {
  id: string;
  slug: string;
  name: string;
  blurb: string | null;
  monthly_price_kobo: number;
  pieces_per_month: number;
  weekly_allowance?: number;
  category_limits: Record<string, number> | null;
  overage_price_kobo: number;
  monthly_discount_pct?: number;
  three_month_discount_pct?: number;
  six_month_discount_pct?: number;
  yearly_discount_pct?: number;
};

const categoryLabels: Record<string, string> = {
  bedding: "Bedding",
  "bedding-home": "Bedding",
  curtain: "Curtains",
  curtains: "Curtains",
  duvet: "Duvets",
  pillow: "Pillows",
  pillows: "Pillows",
  suit: "Suits and formal wear",
  "suits-formal": "Suits and formal wear",
  shoes: "Shoes",
  footwear: "Shoes",
  "footwear-bags": "Shoes",
};

export function SubscriptionPlanCards({
  plans,
  pickupsPerMonth,
  yearlyDiscountPct,
  initialBillingPeriod = "monthly",
}: {
  plans: Plan[];
  pickupsPerMonth: number;
  yearlyDiscountPct: number;
  initialBillingPeriod?: BillingPeriod;
}) {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(initialBillingPeriod);
  const months = billingPeriod === "yearly" ? 12 : billingPeriod === "six_month" ? 6 : billingPeriod === "three_month" ? 3 : 1;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Subscription plans</p>
          <h2 className="mt-3 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">Choose the plan that works for you</h2>
          <p className="mt-3 max-w-xl text-sm text-ink-soft">Switch between 1, 3, 6 and 12-month billing to compare your total.</p>
        </div>
        <div role="group" aria-label="Billing period" className="inline-flex flex-wrap rounded-md border border-line p-1 text-sm font-medium">
          {([{ value: "monthly", label: "1 month" }, { value: "three_month", label: "3 months" }, { value: "six_month", label: "6 months" }, { value: "yearly", label: "12 months" }] as const).map((option) => (
            <button key={option.value} type="button" onClick={() => setBillingPeriod(option.value)} aria-pressed={billingPeriod === option.value}
              className={`rounded px-3 py-1.5 transition-colors ${billingPeriod === option.value ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {plans.length === 0 ? <p className="mt-12 text-ink-mute">Plans will be listed here shortly.</p> : (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {plans.map((plan, index) => {
            const discountPct = billingPeriod === "yearly" ? Number(plan.yearly_discount_pct ?? yearlyDiscountPct) : billingPeriod === "six_month" ? Number(plan.six_month_discount_pct ?? 5) : billingPeriod === "three_month" ? Number(plan.three_month_discount_pct ?? 2) : Number(plan.monthly_discount_pct ?? 0);
            const total = Math.round(Number(plan.monthly_price_kobo) * months * (100 - discountPct) / 100);
            const featured = index === 1;
            const categories = Object.entries(plan.category_limits ?? {});
            return (
              <article key={plan.id} className={`card flex flex-col p-6 ${featured ? "border-brand ring-1 ring-brand" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  {featured && <span className="rounded bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand-dark">Most chosen</span>}
                </div>
                <p className="mt-1 text-sm text-ink-mute">{plan.blurb}</p>
                <p className="mt-6 text-3xl font-bold tracking-tight">
                  {naira(total)}<span className="text-base font-medium text-ink-mute"> / {months === 1 ? "month" : `${months} months`}</span>
                </p>
                {months > 1 && <p className="mt-1 text-xs text-ink-mute">Billed for {months} months. Saves {discountPct}% · {naira(Math.round(total / months))} average per month.</p>}
                <ul className="mt-6 space-y-3 text-sm text-ink-soft">
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />{plan.pieces_per_month.toLocaleString()} eligible pieces per month</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />{pickupsPerMonth} pickups per month, scheduled about 14 days (2 weeks) apart</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />Up to {Math.min(plan.weekly_allowance ?? plan.pieces_per_month, plan.pieces_per_month).toLocaleString()} included pieces per pickup, within the monthly allowance; unused pieces do not roll over</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />Pieces above the monthly or per-pickup allowance: {naira(plan.overage_price_kobo)} each</li>
                </ul>
                {categories.length > 0 ? (
                  <details className="mt-5 rounded-lg border border-line p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-ink">View category limits and exclusions</summary>
                    <ul className="mt-3 space-y-1 text-xs text-ink-soft">
                      {categories.map(([slug, limit]) => <li key={slug} className="flex justify-between gap-2"><span>{categoryLabels[slug] ?? slug.replaceAll("-", " ").replaceAll("_", " ")}</span><span className="font-medium">{Number(limit) === 0 ? "Excluded" : `Up to ${limit} per month`}</span></li>)}
                    </ul>
                  </details>
                ) : null}
                <p className="mt-4 text-xs text-ink-mute">Your first pickup date is selected during scheduling. The second pickup is planned about two weeks later, subject to available service days.</p>
                <Link href={`/subscriptions/checkout?plan=${encodeURIComponent(plan.slug)}&billing_period=${billingPeriod}`} className={`mt-8 ${featured ? "btn-primary" : "btn-secondary"}`}>Choose {plan.name}</Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
