"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { naira } from "@/lib/format";
import type { Database } from "@/types/database";

type Plan = Database["public"]["Tables"]["plans"]["Row"];

export function Pricing({ plans, pickupsPerMonth, yearlyDiscountPct }: { plans: Plan[]; pickupsPerMonth: number; yearlyDiscountPct: number }) {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "six_month" | "yearly">("monthly");

  return (
    <section id="pricing" className="section">
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Monthly plans</p>
            <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">Predictable pricing for regular laundry</h2>
            <p className="mt-4 max-w-xl text-ink-soft">
              Plans include two pickups per month, scheduled about 14 days (2 weeks) apart. Your monthly piece allowance is shared across both pickups; unused pieces do not roll over.
            </p>
          </div>
          <div role="group" aria-label="Billing period" className="inline-flex flex-wrap rounded-md border border-line p-1 text-sm font-medium">
            {([{ value: "monthly", label: "Monthly" }, { value: "six_month", label: "6 months" }, { value: "yearly", label: "Annual" }] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setBillingPeriod(option.value)}
                aria-pressed={billingPeriod === option.value}
                className={`rounded px-3 py-1.5 transition-colors ${billingPeriod === option.value ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {plans.length === 0 ? (
          <p className="mt-12 text-ink-mute">Plans will be listed here shortly.</p>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {plans.map((p, i) => {
              const months = billingPeriod === "yearly" ? 12 : billingPeriod === "six_month" ? 6 : 1;
              const discountPct = billingPeriod === "yearly" ? Number(p.yearly_discount_pct ?? yearlyDiscountPct) : billingPeriod === "six_month" ? Number(p.six_month_discount_pct ?? 5) : Number(p.monthly_discount_pct ?? 0);
              const total = Math.round(p.monthly_price_kobo * months * (100 - discountPct) / 100);
              const featured = i === 1;
              return (
                <div key={p.id} className={`card flex flex-col p-6 ${featured ? "border-brand ring-1 ring-brand" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    {featured && <span className="rounded bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand-dark">Most chosen</span>}
                  </div>
                  <p className="mt-1 text-sm text-ink-mute">{p.blurb}</p>
                  <p className="mt-6 text-3xl font-bold tracking-tight">
                    {naira(total)}<span className="text-base font-medium text-ink-mute"> / {months === 1 ? "month" : `${months} months`}</span>
                  </p>
                  {months > 1 && <p className="mt-1 text-xs text-ink-mute">Billed for {months} months. Saves {discountPct}% · {naira(Math.round(total / months))} average per month.</p>}
                  <ul className="mt-6 space-y-3 text-sm text-ink-soft">
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />{p.pieces_per_month.toLocaleString()} pieces per month</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />Monthly allowance shared across both pickups</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />{pickupsPerMonth} pickups each month · about 14 days apart</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />Extra garments beyond the plan allowance: {naira(p.overage_price_kobo)} each</li>
                  </ul>
                  {Object.keys(p.category_limits ?? {}).length > 0 ? <details className="mt-4 rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">View category limits and exclusions</summary><ul className="mt-3 space-y-1 text-xs text-ink-soft">{Object.entries(p.category_limits ?? {}).map(([key, limit]) => <li key={key} className="flex justify-between gap-3"><span>{key.replaceAll("_", " ").replaceAll("-", " ")}</span><span className="font-medium">{Number(limit) === 0 ? "Excluded" : `Up to ${limit} per month`}</span></li>)}</ul></details> : null}
                  <Link href={`/subscriptions/checkout?plan=${p.slug}&billing_period=${billingPeriod}`} className={`mt-8 ${featured ? "btn-primary" : "btn-secondary"}`}>Choose {p.name}</Link>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-6 text-xs text-ink-mute">Pickup and delivery transport are charged separately by distance. Open each plan’s category details to see excluded categories and category limits.</p>
      </div>
    </section>
  );
}
