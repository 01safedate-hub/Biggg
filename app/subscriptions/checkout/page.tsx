import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubscriptionCheckout } from "@/components/subscriptions/SubscriptionCheckout";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";

export const metadata = { title: "Choose a subscription plan" };
export const dynamic = "force-dynamic";

export default async function SubscriptionCheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; billing_period?: string }> }) {
  const { plan: requestedPlan, billing_period: requestedBillingPeriod } = await searchParams;
  const initialBillingPeriod = requestedBillingPeriod === "three_month" || requestedBillingPeriod === "six_month" || requestedBillingPeriod === "yearly" ? requestedBillingPeriod : "monthly";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main id="main" className="container-page max-w-xl space-y-4 py-10"><h1 className="text-2xl font-bold">Sign in to continue</h1><Link className="btn-primary inline-block" href={`/login?next=${encodeURIComponent(`/subscriptions/checkout?plan=${requestedPlan ?? ""}&billing_period=${initialBillingPeriod}`)}`}>Sign in</Link></main>;
  const { data: underReview } = await supabase.from("subscriptions").select("id").eq("customer_id", user.id).eq("status", "pending_review").limit(1).maybeSingle();
  if (underReview) redirect("/subscriptions/manage");
  type Usage = { plan_name: string; plan_slug: string; period_end: string; next_term: { status: string; starts_on: string } | null };
  const [{ data: plans }, { data: subscriptionSettings }, { data: usageData }, { data: idRow }] = await Promise.all([
    supabase.from("plans").select("slug,name,monthly_price_kobo,pieces_per_month,active,sort_order,monthly_discount_pct,three_month_discount_pct,six_month_discount_pct,yearly_discount_pct,pickups_per_month,requires_student_id").eq("active", true).order("sort_order"),
    supabase.from("settings").select("value").eq("key", "subscription").maybeSingle(),
    supabase.rpc("subscription_usage"),
    supabase.from("student_verifications").select("status").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(5),
  ]);
  const usage = usageData as unknown as Usage | null;
  const ids = (idRow ?? []) as { status: "pending" | "approved" | "rejected" }[];
  const studentStatus = ids.some((r) => r.status === "approved") ? "approved" : ids[0]?.status ?? "none";
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
  const current = usage ? { name: usage.plan_name, lastDay: fmt(new Date(new Date(usage.period_end).getTime() - 60_000)), startsOn: fmt(new Date(usage.period_end)), nextPaid: usage.next_term?.status === "paid" } : null;
  const yearlyDiscountPct = Math.min(99, Math.max(0, Number((subscriptionSettings?.value as { yearly_discount_pct?: number } | null)?.yearly_discount_pct ?? 10)));
  return (
    <main id="main" className="min-h-screen">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-3xl space-y-6 pb-10 pt-2 sm:pt-4">
        <Link href="/subscriptions" className="inline-block text-sm font-medium text-ink-soft hover:text-ink">&larr; Subscription plans</Link>
        <div><h1 className="text-3xl font-bold tracking-tight">{current ? "Renew or change your plan" : "Choose your subscription plan"}</h1><p className="mt-2 text-sm text-ink-soft">Choose a 1, 3, 6 or 12-month billing term. The server calculates your final price and verifies payment before activating your subscription.</p></div>
        <SubscriptionCheckout plans={(plans ?? []).map(p => ({ slug: p.slug, name: p.name, priceKobo: Number(p.monthly_price_kobo), pieces: p.pieces_per_month, monthlyDiscountPct: Number(p.monthly_discount_pct ?? 0), threeMonthDiscountPct: Number(p.three_month_discount_pct ?? 2), sixMonthDiscountPct: Number(p.six_month_discount_pct ?? 5), yearlyDiscountPct: Number(p.yearly_discount_pct ?? yearlyDiscountPct), pickups: Number(p.pickups_per_month ?? 2), student: Boolean(p.requires_student_id) }))} initialPlanSlug={requestedPlan ?? usage?.plan_slug} initialBillingPeriod={initialBillingPeriod} yearlyDiscountPct={yearlyDiscountPct} current={current} userId={user.id} studentStatus={studentStatus} />
      </div>
    </main>
  );
}
