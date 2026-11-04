import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { updateSubscriptionCancellation } from "../actions";

export const metadata = { title: "Manage subscription" };
export const dynamic = "force-dynamic";

const naira = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "Not scheduled";
const billingLabel = (value: string | null) => value === "yearly" ? "12 months · Annual" : value === "six_month" ? "6 months" : value === "three_month" ? "3 months" : "1 month · Monthly";
const notices: Record<string, string> = {
  cancellation_scheduled: "Cancellation is scheduled for the end of your current billing period. Your plan remains active until then.",
  cancellation_reversed: "Your scheduled cancellation has been reversed.",
  subscription_update_failed: "We could not update this subscription. Refresh and try again.",
  subscription_not_found: "We could not find that subscription.",
};

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: active }, { data: pending }, { data: history }] = await Promise.all([
    user ? supabase.from("subscriptions").select("id,plan_id,status,billing_period,current_period_start,current_period_end,cancel_at_period_end,price_kobo,term_amount_kobo,plans(name,pieces_per_month,monthly_price_kobo,weekly_allowance)").eq("customer_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("subscriptions").select("id,billing_period,term_amount_kobo,price_kobo,created_at,plans(name,slug)").eq("customer_id", user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("subscriptions").select("id,status,current_period_start,current_period_end,created_at,plans(name),subscription_invoices!inner(status)").eq("customer_id", user.id).eq("subscription_invoices.status", "paid").order("created_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);

  let usedPieces = 0;
  let pickups: { id: string; scheduled_for: string; status: string; pieces_counted: number | null; overage_pieces: number; overage_kobo: number; excluded_kobo: number; excluded_pieces: number; order_id: string | null }[] = [];
  const activePlan = Array.isArray(active?.plans) ? active.plans[0] : active?.plans;
  let cycleStart = active?.current_period_start ?? new Date().toISOString();
  let cycleEnd = active?.current_period_end ?? "9999-12-31";
  if (active?.current_period_start) {
    const anchor = new Date(active.current_period_start); const now = new Date();
    let months = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + now.getUTCMonth() - anchor.getUTCMonth();
    let start = new Date(anchor); start.setUTCMonth(anchor.getUTCMonth() + months);
    if (start > now) { months -= 1; start = new Date(anchor); start.setUTCMonth(anchor.getUTCMonth() + months); }
    const end = new Date(anchor); end.setUTCMonth(anchor.getUTCMonth() + months + 1);
    cycleStart = start.toISOString(); cycleEnd = end.toISOString();
  }
  if (active?.id) {
    const { data: pickupRows, error: pickupError } = await supabase
      .from("subscription_pickups")
      .select("id,scheduled_for,status,pieces_counted,overage_pieces,overage_kobo,excluded_kobo,excluded_pieces,order_id")
      .eq("subscription_id", active.id)
      .gte("scheduled_for", cycleStart)
      .lt("scheduled_for", cycleEnd)
      .order("scheduled_for");
    if (!pickupError) pickups = pickupRows ?? [];

    // Use the persisted overage figure as the authoritative billing result.
    // Exclude both over-limit eligible garments and excluded-category garments from plan usage.
    usedPieces = pickups
      .filter((pickup) => !["missed", "skipped"].includes(pickup.status))
      .reduce((sum, pickup) => {
        const recorded = Number(pickup.pieces_counted ?? 0);
        const separatelyChargeable = Number(pickup.overage_pieces ?? 0);
        const excluded = Number(pickup.excluded_pieces ?? 0);
        return sum + Math.max(0, recorded - separatelyChargeable - excluded);
      }, 0);
  }
  const allowance = Number(activePlan?.pieces_per_month ?? 0);
  const remaining = Math.max(0, allowance - usedPieces);

  return (
    <main id="main" className="min-h-screen">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-4xl space-y-6 pb-10 pt-4 sm:pt-6">
        <div className="space-y-2"><p className="text-sm font-medium text-brand-dark"><Link href="/dashboard" className="hover:underline">← Customer dashboard</Link></p><h1 className="text-3xl font-bold tracking-tight">Manage subscription</h1><p className="max-w-2xl text-sm text-ink-soft">Review your current plan, clothing allowance, pickup dates and renewal status in one place.</p></div>
        {notice && notices[notice] ? <p role="status" className={`rounded-xl border p-4 text-sm ${notice === "subscription_update_failed" || notice === "subscription_not_found" ? "border-red-200 bg-red-50 text-red-800" : "border-line bg-canvas text-ink"}`}>{notices[notice]}</p> : null}

        {active && activePlan ? <section className="card space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-ink-mute">CURRENT SUBSCRIPTION</p><h2 className="mt-2 text-2xl font-bold">{activePlan.name}</h2><p className="mt-1 text-sm text-ink-soft">Status: Active</p><p className="mt-1 text-sm font-medium text-brand-dark">Billing duration: {billingLabel(active.billing_period)}</p></div><div className="text-right"><p className="text-xl font-bold">{naira(Number(active.term_amount_kobo ?? active.price_kobo ?? activePlan.monthly_price_kobo))}</p><p className="text-xs text-ink-soft">total for {active.billing_period === "yearly" ? "12 months" : active.billing_period === "six_month" ? "6 months" : active.billing_period === "three_month" ? "3 months" : "1 month"}</p><p className="text-xs text-ink-mute">{naira(Number(active.price_kobo ?? activePlan.monthly_price_kobo))} monthly plan rate</p></div></div>
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-canvas p-4"><p className="text-xs text-ink-mute">Allowance used this month</p><p className="mt-1 text-lg font-semibold">{usedPieces} / {allowance}</p></div><div className="rounded-xl bg-canvas p-4"><p className="text-xs text-ink-mute">Pieces remaining</p><p className="mt-1 text-lg font-semibold">{remaining}</p></div><div className="rounded-xl bg-canvas p-4"><p className="text-xs text-ink-mute">Current period ends</p><p className="mt-1 text-lg font-semibold">{date(active.current_period_end)}</p></div></div>
          <div className="h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand" style={{ width: `${allowance > 0 ? Math.min(100, usedPieces / allowance * 100) : 0}%` }} /></div>
          <p className="text-sm text-ink-soft">Your allowance counts eligible pieces only. Excluded categories, category-cap excess and pieces above the monthly allowance are charged separately.</p>
          {active.status === "active" ? <div className="rounded-xl border border-line p-4">
            {active.cancel_at_period_end ? <div className="space-y-3"><p className="text-sm font-medium">Cancellation is scheduled for {date(active.current_period_end)}. Your subscription remains active until then.</p><form action={updateSubscriptionCancellation}><input type="hidden" name="subscription_id" value={active.id} /><input type="hidden" name="cancel_at_period_end" value="false" /><button className="btn-secondary" type="submit">Keep my subscription</button></form></div> : <div className="space-y-3"><div><h3 className="font-semibold">Cancellation settings</h3><p className="mt-1 text-sm text-ink-soft">You can schedule cancellation for the end of this period. This does not cancel the current period or issue a refund.</p></div><form action={updateSubscriptionCancellation}><input type="hidden" name="subscription_id" value={active.id} /><input type="hidden" name="cancel_at_period_end" value="true" /><button className="btn-secondary" type="submit">Schedule cancellation</button></form></div>}
          </div> : <p className="text-sm text-ink-soft">Complete the subscription payment to activate plan benefits.</p>}
        </section> : <section className="card space-y-2 p-5"><h2 className="text-xl font-semibold">No active subscription</h2><p className="text-sm text-ink-soft">You do not currently have a paid, active subscription. Browse the available plans if you want to subscribe. Your previous subscription history remains available further down this page.</p></section>}

        {pending ? <section className="card space-y-3 border border-amber-200 p-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-amber-800">UNPAID CHECKOUT</p><h2 className="mt-1 text-xl font-semibold">{Array.isArray(pending.plans) ? pending.plans[0]?.name : pending.plans?.name ?? "Subscription plan"}</h2><p className="mt-1 text-sm text-ink-soft">This subscription has not been paid for and is not active. No plan benefits or pickups are available until payment is verified.</p><p className="text-sm font-medium">{naira(Number(pending.term_amount_kobo ?? pending.price_kobo ?? 0))} · {pending.billing_period.replace("_", " ")}</p></div><Link href={`/subscriptions/checkout?plan=${encodeURIComponent(Array.isArray(pending.plans) ? pending.plans[0]?.slug ?? "" : pending.plans?.slug ?? "")}&billing_period=${encodeURIComponent(pending.billing_period)}`} className="btn-secondary inline-block">Continue to payment</Link></section> : null}

        {active ? <section className="card space-y-3 p-5"><div><h2 className="text-xl font-semibold">Pickup schedule</h2><p className="text-sm text-ink-soft">Your plan includes two pickups per month, scheduled about 14 days (2 weeks) apart. The monthly piece allowance is shared across both pickups. Unused pieces do not roll over; extra eligible pieces use the plan extra-piece rate; excluded categories are charged at their full catalogue price.</p></div>{pickups.length ? <div className="divide-y divide-line">{pickups.map((pickup) => <div key={pickup.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{date(pickup.scheduled_for)}</p><p className="text-xs text-ink-soft">{pickup.pieces_counted ?? 0} total pieces recorded · {pickup.overage_pieces ?? 0} extra eligible pieces · {naira(Number(pickup.overage_kobo ?? 0))} extra-piece charge · {naira(Number(pickup.excluded_kobo ?? 0))} excluded-category full-price charge{pickup.order_id ? " · Order linked" : " · Pickup request pending"}</p></div><span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium capitalize">{pickup.status.replaceAll("_", " ")}</span></div>)}</div> : <p className="text-sm text-ink-soft">No pickups are scheduled for this billing period yet.</p>}<Link href="/request" className="btn-secondary inline-block">Request a pickup</Link></section> : null}



        {history && history.length > 0 ? <section className="card space-y-3 p-5"><h2 className="text-xl font-semibold">Subscription history</h2><div className="divide-y divide-line">{history.map((item) => { const plan = Array.isArray(item.plans) ? item.plans[0] : item.plans; return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{plan?.name ?? "Laundry plan"}</p><p className="text-xs text-ink-soft">{date(item.current_period_start)} – {date(item.current_period_end)}</p></div><span className="text-sm capitalize text-ink-soft">{item.status}</span></div>; })}</div></section> : null}
        <p className="text-xs text-ink-mute">Plan activation requires verified online payment. Never pay an agent in cash.</p>
      </div>
    </main>
  );
}
