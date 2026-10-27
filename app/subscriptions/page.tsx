import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";

export const metadata = { title: "Monthly laundry plans" };
export const dynamic = "force-dynamic";

const naira = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount / 100);

export default async function SubscriptionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: plans }, { data: active }] = await Promise.all([
    supabase.from("plans").select("id,slug,name,blurb,monthly_price_kobo,pieces_per_month,active,sort_order").eq("active", true).order("sort_order"),
    user ? supabase.from("subscriptions").select("id,plan_id,status,current_period_start,current_period_end,plans(name,pieces_per_month,monthly_price_kobo)").eq("customer_id", user.id).eq("status", "active").order("current_period_end", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  let usedPieces = 0;
  if (active?.id) {
    const { data: pickups } = await supabase.from("subscription_pickups").select("pieces_counted").eq("subscription_id", active.id).gte("scheduled_for", active.current_period_start ?? new Date().toISOString());
    usedPieces = (pickups ?? []).reduce((sum, pickup) => sum + Number(pickup.pieces_counted ?? 0), 0);
  }
  const activePlan = Array.isArray(active?.plans) ? active.plans[0] : active?.plans;
  const allowance = Number(activePlan?.pieces_per_month ?? 0);
  const remaining = Math.max(0, allowance - usedPieces);

  return (
    <main id="main" className="container-page max-w-4xl space-y-6 py-10">
      <Link href="/" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Home</Link>
      <CustomerSidebar />
      <div className="space-y-2"><p className="text-sm font-medium text-brand-dark"><Link href="/services" className="hover:underline">← Review our services</Link></p><h1 className="text-3xl font-bold tracking-tight">Monthly laundry plans</h1><p className="max-w-2xl text-sm text-ink-soft">One monthly payment covers pickup, laundry and delivery for clothes included in your plan. The allowance counts total pieces, whatever the clothing type, across two pickups during the month.</p><p className="max-w-2xl text-sm text-ink-soft">New to LaundryPoint? <Link href="/services" className="font-medium text-brand-dark underline">See what services we offer</Link> before choosing a plan.</p></div>
      {active && activePlan ? <section className="card space-y-3 p-5"><p className="text-sm font-semibold text-ink-mute">YOUR ACTIVE PLAN</p><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{activePlan.name}</h2><p className="text-sm text-ink-soft">{new Date(active.current_period_end ?? "").toLocaleDateString("en-NG") ? `Renews/ends ${new Date(active.current_period_end ?? "").toLocaleDateString("en-NG")}` : "Current billing period"}</p></div><p className="text-lg font-bold">{remaining} pieces remaining</p></div><div className="h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand" style={{ width: `${allowance > 0 ? Math.min(100, usedPieces / allowance * 100) : 0}%` }} /></div><p className="text-sm text-ink-soft">{usedPieces} of {allowance} pieces recorded this period. Extra pieces are billed separately when staff records the count.</p></section> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {(plans ?? []).map((plan) => <section key={plan.id} className="card space-y-3 p-5"><h2 className="text-lg font-semibold">{plan.name}</h2><p className="text-2xl font-bold">{naira(Number(plan.monthly_price_kobo))}<span className="ml-1 text-sm font-normal text-ink-soft">/ month</span></p><p className="text-sm">{plan.pieces_per_month} clothes per month</p>{plan.blurb ? <p className="text-sm text-ink-soft">{plan.blurb}</p> : null}<p className="text-sm text-ink-soft">Use the allowance over two pickups. Pieces above the remaining allowance must be recorded and billed separately online.</p>{user ? <Link href={`/subscriptions/checkout?plan=${plan.slug}`} className="btn-primary inline-block">Choose plan</Link> : <Link href="/login?next=/subscriptions" className="btn-primary inline-block">Sign in to choose</Link>}</section>)}
      </div>
      <p className="text-xs text-ink-mute">Plan activation requires verified online payment. Never pay an agent in cash.</p>
    </main>
  );
}
