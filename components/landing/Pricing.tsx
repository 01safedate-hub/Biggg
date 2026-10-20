"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { naira } from "@/lib/format";
import type { Database } from "@/types/database";

type Plan = Database["public"]["Tables"]["plans"]["Row"];

export function Pricing({ plans, pickupsPerMonth }: { plans: Plan[]; pickupsPerMonth: number }) {
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="section">
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Monthly plans</p>
            <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">Predictable pricing for regular laundry</h2>
            <p className="mt-4 max-w-xl text-ink-soft">
              Plans are counted in pieces. A weekly pickup is included. Pieces beyond your allowance are billed per piece.
            </p>
          </div>
          <div role="group" aria-label="Billing period" className="inline-flex rounded-md border border-line p-1 text-sm font-medium">
            {([false, true] as const).map((y) => (
              <button
                key={String(y)}
                onClick={() => setYearly(y)}
                aria-pressed={yearly === y}
                className={`rounded px-4 py-1.5 transition-colors ${yearly === y ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}
              >
                {y ? "Yearly" : "Monthly"}
              </button>
            ))}
          </div>
        </div>

        {plans.length === 0 ? (
          <p className="mt-12 text-ink-mute">Plans will be listed here shortly.</p>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {plans.map((p, i) => {
              const perMonth = yearly ? Math.round((p.monthly_price_kobo * (100 - p.yearly_discount_pct)) / 100) : p.monthly_price_kobo;
              const featured = i === 1;
              return (
                <div key={p.id} className={`card flex flex-col p-6 ${featured ? "border-brand ring-1 ring-brand" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    {featured && <span className="rounded bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand-dark">Most chosen</span>}
                  </div>
                  <p className="mt-1 text-sm text-ink-mute">{p.blurb}</p>
                  <p className="mt-6 text-3xl font-bold tracking-tight">
                    {naira(perMonth)}<span className="text-base font-medium text-ink-mute"> / month</span>
                  </p>
                  {yearly && <p className="mt-1 text-xs text-ink-mute">Billed yearly. Saves {p.yearly_discount_pct}%.</p>}
                  <ul className="mt-6 space-y-3 text-sm text-ink-soft">
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />{p.pieces_per_month.toLocaleString()} pieces per month</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />Up to {p.weekly_allowance.toLocaleString()} pieces per weekly pickup</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />{pickupsPerMonth} scheduled pickups each month</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden />Extra pieces at {naira(p.overage_price_kobo)} each</li>
                  </ul>
                  <Link href={`/request?plan=${p.slug}`} className={`mt-8 ${featured ? "btn-primary" : "btn-secondary"}`}>Choose {p.name}</Link>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-6 text-xs text-ink-mute">Pickup and delivery transport are charged separately by distance and paid before the agent leaves.</p>
      </div>
    </section>
  );
}
