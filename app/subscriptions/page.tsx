import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { SubscriptionPaymentReturn } from "@/components/subscriptions/SubscriptionPaymentReturn";
import { SubscriptionPlanCards } from "@/components/subscriptions/SubscriptionPlanCards";

export const metadata = { title: "Subscription plans" };
export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ reference?: string; tx_ref?: string; status?: string; billing?: string }> }) {
  const params = await searchParams;
  const paymentReference = params.reference ?? params.tx_ref ?? "";
  const billingPeriod = params.billing === "six_month" || params.billing === "yearly" ? params.billing : "monthly";
  const { supabase, user } = await requireUser(`/subscriptions${params.billing ? `?billing=${encodeURIComponent(params.billing)}` : ""}`);

  const [{ data: plans }, { data: active }, { data: subscriptionSettings }] = await Promise.all([
    supabase.from("plans").select("id,slug,name,blurb,monthly_price_kobo,pieces_per_month,active,sort_order,category_limits,weekly_allowance,overage_price_kobo").eq("active", true).order("sort_order"),
    supabase.from("subscriptions").select("id,status,current_period_end,plans(name)").eq("customer_id", user.id).in("status", ["active", "pending"]).order("current_period_end", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("settings").select("value").eq("key", "subscription").maybeSingle(),
  ]);

  const config = (subscriptionSettings?.value as { yearly_discount_pct?: number } | null) ?? {};
  const pickupsPerMonth = 2;
  const yearlyDiscountPct = Math.min(99, Math.max(0, Number(config.yearly_discount_pct ?? 10)));
  const activePlan = Array.isArray(active?.plans) ? active.plans[0] : active?.plans;

  return (
    <main id="main" className="min-h-screen">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-6xl space-y-8 pb-10 pt-4 sm:pt-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-brand-dark"><Link href="/dashboard" className="hover:underline">← Customer dashboard</Link></p>
          <h1 className="text-3xl font-bold tracking-tight">Subscription plans</h1>
          <p className="max-w-2xl text-sm text-ink-soft">Choose a laundry plan and billing duration. Your plan covers eligible clothes within its allowance; excluded categories and extra pieces are billed separately.</p>
        </header>

        {paymentReference ? <SubscriptionPaymentReturn reference={paymentReference} /> : null}

        {active && activePlan ? (
          <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-ink-mute">{active.status === "active" ? "YOUR ACTIVE PLAN" : "PENDING SUBSCRIPTION"}</p><h2 className="mt-1 text-xl font-bold">{activePlan.name}</h2><p className="mt-1 text-sm text-ink-soft">{active.current_period_end ? `Current period ends ${new Date(active.current_period_end).toLocaleDateString("en-NG")}` : "Subscription status"} </p></div>
            <Link href="/subscriptions/manage" className="btn-secondary">{active.status === "active" ? "Manage subscription" : "Complete subscription"}</Link>
          </section>
        ) : null}

        <section className="space-y-3 border-t border-line pt-5">
          <p className="text-sm text-ink-soft">A subscription is optional. You can continue using LaundryPoint without choosing a plan.</p>
          <Link href="/dashboard" className="btn-secondary inline-block">Skip subscription for now</Link>
        </section>

        <section className="space-y-4">
          <SubscriptionPlanCards plans={(plans ?? []).map((plan) => ({
            id: plan.id,
            slug: plan.slug,
            name: plan.name,
            blurb: plan.blurb,
            monthly_price_kobo: Number(plan.monthly_price_kobo),
            pieces_per_month: Number(plan.pieces_per_month),
            weekly_allowance: plan.weekly_allowance,
            category_limits: (plan.category_limits ?? {}) as Record<string, number>,
            overage_price_kobo: Number(plan.overage_price_kobo),
          }))} pickupsPerMonth={pickupsPerMonth} yearlyDiscountPct={yearlyDiscountPct} initialBillingPeriod={billingPeriod} />
        </section>

        <p className="text-xs text-ink-mute">Plan activation requires verified online payment. Never pay an agent in cash.</p>
      </div>
    </main>
  );
}
