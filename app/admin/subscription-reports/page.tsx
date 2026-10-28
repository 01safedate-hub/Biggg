import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";

export const metadata = { title: "Subscription reports" };
export const dynamic = "force-dynamic";

type Payment = { amount_kobo: number; purpose: string; status: string; created_at: string; invoice_id: string | null };
type Invoice = { id: string; subscription_id: string; status: string };
type Subscription = { id: string; plan_id: string; status: string; updated_at: string | null; created_at: string };
type Plan = { id: string; name: string };

const money = (kobo: number) => naira(kobo);
const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-NG", { month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(d);

export default async function SubscriptionReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase } = await requireRole(["super_admin"]);
  const { month: rawMonth } = await searchParams;
  const month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : new Date().toISOString().slice(0, 7);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const [{ data: payments, error: paymentError }, { data: invoices }, { data: subscriptions }, { data: plans }] = await Promise.all([
    supabase.from("payments").select("amount_kobo,purpose,status,created_at,invoice_id").eq("status", "success").gte("created_at", startIso).lt("created_at", endIso).in("purpose", ["subscription", "extra_clothes"]),
    supabase.from("subscription_invoices").select("id,subscription_id,status"),
    supabase.from("subscriptions").select("id,plan_id,status,updated_at,created_at"),
    supabase.from("plans").select("id,name"),
  ]);
  const paidInvoices = new Map((invoices ?? []).map((i) => [i.id, i as Invoice]));
  const subs = (subscriptions ?? []) as Subscription[];
  const subById = new Map(subs.map((s) => [s.id, s]));
  const planById = new Map((plans ?? []).map((p) => [p.id, p as Plan]));
  const subscriptionRevenue = new Map<string, number>();
  let extraRevenue = 0;
  let unallocatedSubscriptionRevenue = 0;
  for (const raw of (payments ?? []) as Payment[]) {
    if (raw.purpose === "extra_clothes") { extraRevenue += Number(raw.amount_kobo); continue; }
    const invoice = raw.invoice_id ? paidInvoices.get(raw.invoice_id) : undefined;
    const subscription = invoice ? subById.get(invoice.subscription_id) : undefined;
    const planName = subscription ? (planById.get(subscription.plan_id)?.name ?? "Plan unavailable") : "Unallocated / legacy";
    if (!subscription) unallocatedSubscriptionRevenue += Number(raw.amount_kobo);
    subscriptionRevenue.set(planName, (subscriptionRevenue.get(planName) ?? 0) + Number(raw.amount_kobo));
  }
  const allSubRevenue = [...subscriptionRevenue.values()].reduce((sum, n) => sum + n, 0);
  const churned = subs.filter((s) => s.status === "cancelled" && s.updated_at && s.updated_at >= startIso && s.updated_at < endIso).length;
  const newSubscriptions = subs.filter((s) => s.created_at >= startIso && s.created_at < endIso).length;
  const active = subs.filter((s) => s.status === "active").length;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">Subscription reports</h1><p className="mt-1 text-sm text-ink-soft">Successful recorded payments and subscription status changes for the selected month.</p></div><form method="get" className="flex items-end gap-2"><label className="text-sm">Month<input className="input mt-1 block" type="month" name="month" defaultValue={month} /></label><button className="btn-secondary" type="submit">Show</button></form></div>
    {paymentError && <p className="card p-4 text-sm text-red-700">Could not load payment records. Check permissions and refresh.</p>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <article className="card p-4"><p className="text-sm text-ink-soft">Subscription payments</p><p className="mt-1 text-2xl font-bold">{money(allSubRevenue)}</p></article>
      <article className="card p-4"><p className="text-sm text-ink-soft">Extra-clothes payments</p><p className="mt-1 text-2xl font-bold">{money(extraRevenue)}</p></article>
      <article className="card p-4"><p className="text-sm text-ink-soft">Active subscriptions now</p><p className="mt-1 text-2xl font-bold">{active}</p></article>
      <article className="card p-4"><p className="text-sm text-ink-soft">Cancellations updated in {fmtDate(start)}</p><p className="mt-1 text-2xl font-bold">{churned}</p><p className="mt-1 text-xs text-ink-mute">Uses subscription updated_at as cancellation timing.</p></article>
    </section>
    <section className="card p-4 sm:p-5"><h2 className="font-semibold">Subscription revenue by plan</h2>{subscriptionRevenue.size === 0 ? <p className="mt-3 text-sm text-ink-soft">No successful subscription payments found for this month.</p> : <ul className="mt-3 divide-y divide-line">{[...subscriptionRevenue.entries()].sort((a,b)=>b[1]-a[1]).map(([name, amount])=><li key={name} className="flex justify-between gap-3 py-3 text-sm"><span>{name}</span><strong>{money(amount)}</strong></li>)}</ul>}{unallocatedSubscriptionRevenue > 0 && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Unallocated/legacy subscription payments: {money(unallocatedSubscriptionRevenue)}. These records could not be linked through an invoice to a current subscription and are shown separately from plan-attributed amounts.</p>}</section>
    <p className="text-xs text-ink-mute">Revenue includes payment rows with status “success” and created_at within the selected month. Pending and failed payments are excluded. Extra-clothes revenue is kept separate from subscription fees.</p>
  </div>;
}
