import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { SubscriptionPaymentReturn } from "@/components/subscriptions/SubscriptionPaymentReturn";

export const metadata = { title: "Monthly laundry plans" };
export const dynamic = "force-dynamic";

const naira = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount / 100);
const excludedCategories = new Set(["accessories", "native-wear", "bedding-home", "suits-formal", "footwear-bags", "uniforms-workwear", "underwear-sleepwear"]);
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ reference?: string; tx_ref?: string; status?: string }> }) {
  const params = await searchParams;
  const paymentReference = params.reference ?? params.tx_ref ?? "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: plans }, { data: active }, { data: subscriptionSettings }] = await Promise.all([
    supabase.from("plans").select("id,slug,name,blurb,monthly_price_kobo,pieces_per_month,active,sort_order,category_limits,weekly_allowance").eq("active", true).order("sort_order"),
    user ? supabase.from("subscriptions").select("id,plan_id,status,current_period_start,current_period_end,plans(name,pieces_per_month,monthly_price_kobo,category_limits)").eq("customer_id", user.id).eq("status", "active").order("current_period_end", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("settings").select("value").eq("key", "subscription").maybeSingle(),
  ]);
  const pickupsPerMonth = Math.max(1, Number((subscriptionSettings?.value as { pickups_per_month?: number } | null)?.pickups_per_month ?? 2));
  let usedPieces = 0;
  if (active?.id) {
    const { data: pickups } = await supabase.from("subscription_pickups").select("id,scheduled_for,status").eq("subscription_id", active.id).gte("scheduled_for", active.current_period_start ?? new Date().toISOString()).lt("scheduled_for", active.current_period_end ?? "9999-12-31").not("status", "in", '("missed","skipped")');
    const pickupIds = (pickups ?? []).map((pickup) => pickup.id);
    if (pickupIds.length) {
      const { data: orders } = await supabase.from("orders").select("id").in("subscription_pickup_id", pickupIds);
      const orderIds = (orders ?? []).map((order) => order.id);
      if (orderIds.length) {
        const { data: lines } = await supabase.from("order_items").select("qty,item_id,category_name,removed_at,items(category_id,item_categories(slug))").in("order_id", orderIds).is("removed_at", null);
        const activePlan = Array.isArray(active.plans) ? active.plans[0] : active.plans;
        const limits = (activePlan?.category_limits ?? {}) as Record<string, number>;
        usedPieces = (lines ?? []).reduce((sum, line) => {
          const item = Array.isArray(line.items) ? line.items[0] : line.items;
          const category = Array.isArray(item?.item_categories) ? item.item_categories[0] : item?.item_categories;
          const slug = slugify(String(category?.slug ?? line.category_name ?? "uncategorized"));
          const hasLimit = Object.prototype.hasOwnProperty.call(limits, slug);
          const limit = Number(limits[slug]);
          if ((hasLimit && limit === 0) || (!hasLimit && excludedCategories.has(slug))) return sum;
          return sum + (hasLimit && limit > 0 ? Math.min(Number(line.qty ?? 0), limit) : Number(line.qty ?? 0));
        }, 0);
      }
    }
  }
  const activePlan = Array.isArray(active?.plans) ? active.plans[0] : active?.plans;
  const allowance = Number(activePlan?.pieces_per_month ?? 0);
  const remaining = Math.max(0, allowance - usedPieces);

  return (
    <main id="main" className="min-h-screen">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-4xl space-y-6 pb-10 pt-4 sm:pt-6">
      <div className="space-y-2"><p className="text-sm font-medium text-brand-dark"><Link href="/services" className="hover:underline">← Review our services</Link></p><h1 className="text-3xl font-bold tracking-tight">Monthly laundry plans</h1><p className="max-w-2xl text-sm text-ink-soft">One monthly payment covers pickup, laundry and delivery for eligible clothes included in your plan. Excluded categories are charged separately and do not use the monthly allowance.</p><p className="max-w-2xl text-sm text-ink-soft">New to LaundryPoint? <Link href="/services" className="font-medium text-brand-dark underline">See what services we offer</Link> before choosing a plan.</p></div>
      {paymentReference ? <SubscriptionPaymentReturn reference={paymentReference} /> : null}
      {active && activePlan ? <section className="card space-y-3 p-5"><p className="text-sm font-semibold text-ink-mute">YOUR ACTIVE PLAN</p><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{activePlan.name}</h2><p className="text-sm text-ink-soft">{active.current_period_end ? `Renews/ends ${new Date(active.current_period_end).toLocaleDateString("en-NG")}` : "Current billing period"}</p></div><p className="text-lg font-bold">{remaining} pieces remaining</p></div><div className="h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand" style={{ width: `${allowance > 0 ? Math.min(100, usedPieces / allowance * 100) : 0}%` }} /></div><p className="text-sm text-ink-soft">{usedPieces} of {allowance} eligible pieces used this period. Excluded categories and category-cap excess are charged separately.</p></section> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {(plans ?? []).map((plan) => <section key={plan.id} className="card space-y-3 p-5"><h2 className="text-lg font-semibold">{plan.name}</h2><p className="text-2xl font-bold">{naira(Number(plan.monthly_price_kobo))}<span className="ml-1 text-sm font-normal text-ink-soft">/ month</span></p><p className="text-sm">{plan.pieces_per_month} eligible clothes per month</p><p className="text-sm text-ink-soft">Includes up to {pickupsPerMonth} pickups per monthly billing period. Weekly allowance: {plan.weekly_allowance ?? "As scheduled"}.</p>{plan.blurb ? <p className="text-sm text-ink-soft">{plan.blurb}</p> : null}{Object.entries((plan.category_limits ?? {}) as Record<string, number>).length > 0 ? <div className="rounded-lg border border-line p-3"><h3 className="text-sm font-semibold">Category limits included in this plan</h3><ul className="mt-2 space-y-1 text-sm">{Object.entries((plan.category_limits ?? {}) as Record<string, number>).map(([slug, limit]) => <li key={slug} className="flex justify-between gap-3"><span>{slug.split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ")}</span><span className="font-medium">{Number(limit) === 0 ? "Not included · charged from first piece" : `Up to ${limit} included pieces`}</span></li>)}</ul><p className="mt-2 text-xs text-ink-soft">Categories not listed have no separate category cap and use the overall plan allowance. Excluded categories are charged from the first piece; pieces above a positive category cap are charged at the plan overage rate.</p></div> : <p className="text-sm text-ink-soft">No separate category caps. The total plan allowance applies to eligible garments.</p>}<p className="text-sm text-ink-soft">Use the allowance over {pickupsPerMonth} pickups. Pieces above the remaining allowance must be recorded and billed separately online.</p>{active ? <Link href="/subscriptions/manage" className="btn-secondary inline-block">Manage subscription</Link> : user ? <Link href={`/subscriptions/checkout?plan=${plan.slug}`} className="btn-primary inline-block">Choose plan</Link> : <Link href="/login?next=/subscriptions" className="btn-primary inline-block">Sign in to choose</Link>}</section>)}
      </div>
      <div className="space-y-2 border-t border-line pt-4"><p className="text-sm text-ink-soft">A monthly plan is optional. You can explore LaundryPoint and use the dashboard without subscribing.</p><Link href="/dashboard" className="inline-flex font-medium text-brand-dark underline underline-offset-4">Skip for now and go to dashboard</Link></div>
      <p className="text-xs text-ink-mute">Plan activation requires verified online payment. Never pay an agent in cash.</p>
      </div>
    </main>
  );
}
