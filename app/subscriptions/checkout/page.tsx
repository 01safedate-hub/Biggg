import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubscriptionCheckout } from "@/components/subscriptions/SubscriptionCheckout";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";

export const metadata = { title: "Choose a subscription plan" };
export const dynamic = "force-dynamic";

export default async function SubscriptionCheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; billing_period?: string }> }) {
  const { plan: requestedPlan, billing_period: requestedBillingPeriod } = await searchParams;
  const initialBillingPeriod = requestedBillingPeriod === "six_month" || requestedBillingPeriod === "yearly" ? requestedBillingPeriod : "monthly";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main id="main" className="container-page max-w-xl space-y-4 py-10"><h1 className="text-2xl font-bold">Sign in to continue</h1><Link className="btn-primary inline-block" href="/login?next=/subscriptions/checkout">Sign in</Link></main>;
  const { data: existingSubscription } = await supabase.from("subscriptions").select("id,status").eq("customer_id", user.id).in("status", ["active", "pending"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingSubscription) redirect("/subscriptions/manage");
  const [{ data: plans }, { data: subscriptionSettings }] = await Promise.all([
    supabase.from("plans").select("slug,name,monthly_price_kobo,pieces_per_month,active,sort_order").eq("active", true).order("sort_order"),
    supabase.from("settings").select("value").eq("key", "subscription").maybeSingle(),
  ]);
  const yearlyDiscountPct = Math.min(99, Math.max(0, Number((subscriptionSettings?.value as { yearly_discount_pct?: number } | null)?.yearly_discount_pct ?? 10)));
  return (
    <main id="main" className="min-h-screen">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-3xl space-y-6 pb-10 pt-2 sm:pt-4">
        <Link href="/subscriptions" className="inline-block text-sm font-medium text-ink-soft hover:text-ink">&larr; Subscription plans</Link>
        <div><h1 className="text-3xl font-bold tracking-tight">Choose your subscription plan</h1><p className="mt-2 text-sm text-ink-soft">Choose a 1, 6 or 12-month billing term. The server calculates your final price and verifies payment before activating your subscription.</p></div>
        <SubscriptionCheckout plans={(plans ?? []).map(p => ({ slug: p.slug, name: p.name, priceKobo: Number(p.monthly_price_kobo), pieces: p.pieces_per_month }))} initialPlanSlug={requestedPlan} initialBillingPeriod={initialBillingPeriod} yearlyDiscountPct={yearlyDiscountPct} />
      </div>
    </main>
  );
}
