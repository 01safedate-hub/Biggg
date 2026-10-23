import Link from "next/link";
import { Stat } from "@/components/admin/Shell";
import { Kpi } from "@/components/admin/Kpi";
import { RangeBar } from "@/components/admin/RangeBar";
import { CompareTable, type CompareRow } from "@/components/admin/CompareTable";
import { TrendChart } from "@/components/admin/charts/TrendChart";
import { BarList } from "@/components/admin/charts/BarList";
import { SplitBar } from "@/components/admin/charts/SplitBar";
import { requireRole } from "@/lib/roles";
import { MODE_LABEL, PURPOSE_LABEL, longDate } from "@/lib/money";
import { naira } from "@/lib/format";
import { resolveRange, type Dashboard } from "@/lib/dash";

export const metadata = { title: "Overview" };

type Recovery = {
  basis: string; capital_kobo: number; rent_kobo: number; capital_pct: number; rent_pct: number;
  remaining_capital_kobo: number; projected_capital_date: string | null;
};
const STAGES: [string, string][] = [
  ["awaiting_fare_payment", "Waiting for transport payment"], ["awaiting_dispatch", "Waiting for an agent"], ["agent_assigned", "Agent on the way"],
  ["agent_arrived", "Agent arrived"], ["counted", "Counted"], ["count_confirmed", "Count confirmed"], ["received", "Received at the shop"],
  ["in_house", "Being washed"], ["ready", "Ready"], ["awaiting_delivery_fare", "Waiting for delivery payment"], ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"], ["closed", "Closed"], ["failed_delivery", "Delivery failed"], ["cancelled", "Cancelled"],
];
const SOURCE_LABEL: Record<string, string> = { online: "Online", walk_in: "Walk-in", whatsapp: "WhatsApp", subscription: "Subscription" };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const range = resolveRange(await searchParams);
  const { supabase } = await requireRole(["super_admin"]);
  const monthStart = `${range.today.slice(0, 8)}01`;
  const [rec, dash, month, settings] = await Promise.all([
    supabase.rpc("recovery_detail"),
    supabase.rpc("admin_dashboard", { _from: range.from, _to: range.to }),
    supabase.rpc("finance_overview", { _from: monthStart, _to: range.today }),
    supabase.from("settings").select("key,value").in("key", ["contact", "whatsapp", "hub", "targets"]),
  ]);
  const r = rec.data as unknown as Recovery | null;
  const d = dash.data as unknown as Dashboard | null;
  const m = month.data as unknown as { profit_kobo: number } | null;
  const s = Object.fromEntries((settings.data ?? []).map((x) => [x.key, (x.value ?? {}) as Record<string, unknown>]));
  const target = typeof s.targets?.monthly_net_kobo === "number" ? (s.targets.monthly_net_kobo as number) : null;

  const checklist = [
    { done: Boolean(s.contact?.phone), text: "Set the contact phone number", href: "/admin/settings" },
    { done: Boolean(s.whatsapp?.number), text: "Set the WhatsApp number", href: "/admin/settings" },
    { done: s.hub?.lat != null && s.hub?.lng != null, text: "Set the store location", href: "/admin/settings" },
    { done: target !== null, text: "Set the monthly target", href: "/admin/settings" },
    { done: (r?.capital_kobo ?? 0) > 0, text: "Add your start-up costs with receipts", href: "/admin/costs" },
    { done: (d?.now.staff ?? 0) > 1, text: "Invite your team", href: "/admin/staff" },
  ];
  const open = checklist.filter((c) => !c.done);

  const days = d ? daysBetween(range.from, range.to) : 0;
  const dayOfMonth = Number(range.today.slice(8));
  const daysInMonth = new Date(Date.UTC(Number(range.today.slice(0, 4)), Number(range.today.slice(5, 7)), 0)).getUTCDate();
  const monthPct = target && m ? Math.max(0, Math.round((m.profit_kobo / target) * 1000) / 10) : null;
  const pacePct = Math.round((dayOfMonth / daysInMonth) * 1000) / 10;

  const compare: CompareRow[] = d ? [
    { label: "Sales", cur: d.cur.revenue_kobo, prev: d.prev.revenue_kobo, fmt: naira },
    { label: "Approved expenses", cur: d.cur.expenses_kobo, prev: d.prev.expenses_kobo, fmt: naira, upIsGood: false },
    { label: "Profit", cur: d.cur.profit_kobo, prev: d.prev.profit_kobo, fmt: naira },
    { label: "Refunds", cur: d.cur.refunds_kobo, prev: d.prev.refunds_kobo, fmt: naira, upIsGood: false },
    { label: "Payments taken", cur: d.cur.payments, prev: d.prev.payments, fmt: String },
    { label: "Average payment", cur: d.cur.avg_ticket_kobo, prev: d.prev.avg_ticket_kobo, fmt: naira },
    { label: "Orders", cur: d.cur.orders.total, prev: d.prev.orders.total, fmt: String },
    { label: "Orders delivered", cur: d.cur.orders.delivered, prev: d.prev.orders.delivered, fmt: String },
    { label: "Cancelled or failed", cur: d.cur.orders.cancelled, prev: d.prev.orders.cancelled, fmt: String, upIsGood: false },
    { label: "New customers", cur: d.cur.new_customers, prev: d.prev.new_customers, fmt: String },
    { label: "Waitlist sign-ups", cur: d.cur.waitlist, prev: d.prev.waitlist, fmt: String },
    { label: "Cash short at counts", cur: -d.cur.cash_short_kobo, prev: -d.prev.cash_short_kobo, fmt: naira, upIsGood: false },
    { label: "Minutes staff were late", cur: d.cur.late_minutes, prev: d.prev.late_minutes, fmt: String, upIsGood: false },
  ] : [];
  const spark = (key: "revenue_kobo" | "expenses_kobo" | "orders") => (d ? d.daily.slice(-12).map((x) => x[key]) : []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-ink-soft">Recovery is measured on {r?.basis === "revenue" ? "sales" : "profit (sales minus approved expenses)"}.</p>
      </div>

      {d && d.now.pending_expenses > 0 && (
        <Link href="/admin/expenses?status=pending" className="block rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          {d.now.pending_expenses} expense{d.now.pending_expenses === 1 ? "" : "s"} waiting for your approval. Review them now.
        </Link>
      )}

      {r && (
        <section aria-label="Cost recovery" className="card p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold">Start-up costs recovered</h2>
            <p className="text-5xl font-bold tracking-tight">{r.capital_pct}%</p>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={r.capital_pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand" style={{ width: `${Math.min(100, r.capital_pct)}%` }} />
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-ink-mute">Total start-up costs</dt><dd className="font-semibold">{naira(r.capital_kobo)}</dd></div>
            <div><dt className="text-ink-mute">Still to recover</dt><dd className="font-semibold">{naira(r.remaining_capital_kobo)}</dd></div>
            <div><dt className="text-ink-mute">Expected full recovery</dt>
              <dd className="font-semibold">{r.capital_kobo === 0 ? "Add your start-up costs" : r.projected_capital_date ? longDate(r.projected_capital_date) : "Not enough sales yet"}</dd></div>
          </dl>
          {r.rent_kobo > 0 && <p className="mt-4 text-sm text-ink-soft">Yearly rent recovered after start-up costs: {r.rent_pct}% of {naira(r.rent_kobo)}.</p>}
        </section>
      )}

      {open.length > 0 && (
        <section aria-label="Setup" className="card p-5">
          <h2 className="text-lg font-semibold">Still to set up ({open.length} of {checklist.length})</h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.text} className="flex items-center gap-2">
                <span aria-hidden className={c.done ? "text-emerald-700" : "text-ink-mute"}>{c.done ? "✓" : "○"}</span>
                {c.done ? <span className="text-ink-mute line-through">{c.text}</span> : <Link href={c.href} className="font-medium text-brand-dark hover:underline">{c.text}</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <RangeBar active={range.key} from={range.from} to={range.to} today={range.today} />

      {!d ? <p role="alert" className="text-sm text-red-700">Could not load the figures. Please refresh.</p> : (
        <>
          <p className="-mt-4 text-sm text-ink-mute">{longDate(range.from)} to {longDate(range.to)} ({days} day{days === 1 ? "" : "s"}), compared with {longDate(d.prev_from)} to {longDate(d.prev_to)}.</p>

          <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Sales" value={naira(d.cur.revenue_kobo)} cur={d.cur.revenue_kobo} prev={d.prev.revenue_kobo} spark={spark("revenue_kobo")} />
            <Kpi label="Approved expenses" value={naira(d.cur.expenses_kobo)} cur={d.cur.expenses_kobo} prev={d.prev.expenses_kobo} upIsGood={false} spark={spark("expenses_kobo")} />
            <Kpi label="Profit" value={naira(d.cur.profit_kobo)} cur={d.cur.profit_kobo} prev={d.prev.profit_kobo} hint={d.cur.revenue_kobo > 0 ? `${Math.round((d.cur.profit_kobo / d.cur.revenue_kobo) * 100)}% of sales kept` : undefined} />
            <Kpi label="Orders" value={String(d.cur.orders.total)} cur={d.cur.orders.total} prev={d.prev.orders.total} spark={spark("orders")} hint={`${d.cur.orders.delivered} delivered`} />
            <Kpi label="Average payment" value={naira(d.cur.avg_ticket_kobo)} cur={d.cur.avg_ticket_kobo} prev={d.prev.avg_ticket_kobo} hint={`${d.cur.payments} payment${d.cur.payments === 1 ? "" : "s"}`} />
            <Kpi label="New customers" value={String(d.cur.new_customers)} cur={d.cur.new_customers} prev={d.prev.new_customers} />
            <Kpi label="Cash short at counts" value={naira(-d.cur.cash_short_kobo)} cur={-d.cur.cash_short_kobo} prev={-d.prev.cash_short_kobo} upIsGood={false} hint={`${d.cur.cash_counts} count${d.cur.cash_counts === 1 ? "" : "s"} done`} />
            <Kpi label="Minutes staff were late" value={String(d.cur.late_minutes)} cur={d.cur.late_minutes} prev={d.prev.late_minutes} upIsGood={false} hint={d.cur.lateness_surcharge_kobo ? `${naira(d.cur.lateness_surcharge_kobo)} in lateness charges` : undefined} />
          </section>

          {target !== null && m && (
            <section aria-label="Monthly target" className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">This month against the target</h2>
                <p className="text-2xl font-bold">{monthPct}%</p>
              </div>
              <div className="relative mt-3 h-3 rounded-full bg-canvas" role="progressbar" aria-valuenow={Math.min(100, monthPct ?? 0)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, monthPct ?? 0)}%` }} />
                <div aria-hidden className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: `${Math.min(100, pacePct)}%` }} />
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {naira(m.profit_kobo)} of {naira(target)}. The marker shows where you should be by day {dayOfMonth} of {daysInMonth} ({pacePct}%).{" "}
                <strong>{(monthPct ?? 0) >= pacePct ? "You are on or ahead of pace." : `You are ${Math.round((pacePct - (monthPct ?? 0)) * 10) / 10} points behind pace.`}</strong>
              </p>
            </section>
          )}

          <section aria-label="Sales and spending" className="card p-5">
            <h2 className="mb-3 text-lg font-semibold">Sales and spending by day</h2>
            <TrendChart rows={d.daily.map((x) => ({ day: x.day, a: x.revenue_kobo, b: x.expenses_kobo }))} aLabel="Sales" bLabel="Approved expenses" />
          </section>

          <section aria-label="Where the money comes from" className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">Online or collected by staff</h2>
              <SplitBar a={d.by_mode.paystack ?? 0} b={Object.entries(d.by_mode).filter(([k]) => k !== "paystack").reduce((n, [, v]) => n + v, 0)}
                aLabel="Paid online" bLabel="Collected by staff" format={naira} hint="Staff-collected means cash, POS and bank transfer." />
            </div>
            <div className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">What people paid for</h2>
              <BarList rows={Object.entries(d.by_purpose).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: PURPOSE_LABEL[k] ?? k, value: v, display: naira(v) }))} />
            </div>
            <div className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">How they paid</h2>
              <BarList rows={Object.entries(d.by_mode).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: MODE_LABEL[k] ?? k, value: v, display: naira(v) }))} />
            </div>
            <div className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">By drawer, POS and account</h2>
              <BarList rows={d.by_money_point.map((p) => ({ label: p.name, value: p.total_kobo, display: naira(p.total_kobo) }))} />
            </div>
            <div className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">Takings by person</h2>
              <BarList rows={d.by_cashier.map((p) => ({ label: p.name, value: p.total_kobo, display: naira(p.total_kobo) }))} />
            </div>
            <div className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">Where the money went</h2>
              <BarList color="#eb6834" rows={d.expense_by_category.map((p) => ({ label: p.name, value: p.total_kobo, display: naira(p.total_kobo) }))} empty="No approved expenses in this period." />
            </div>
          </section>

          <section aria-label="Orders" className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">Orders by stage</h2>
              <BarList ramp rows={STAGES.filter(([k]) => d.orders_by_status[k]).map(([k, label]) => ({ label, value: d.orders_by_status[k], display: String(d.orders_by_status[k]) }))} />
            </div>
            <div className="card p-5">
              <h2 className="mb-3 text-lg font-semibold">Where orders came from</h2>
              <BarList rows={Object.entries(d.orders_by_source).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: SOURCE_LABEL[k] ?? k, value: v, display: String(v) }))} />
            </div>
          </section>

          <section aria-label="Compare periods" className="card p-5">
            <h2 className="mb-3 text-lg font-semibold">This period against the one before</h2>
            <CompareTable rows={compare} curLabel="This period" prevLabel="Before" />
          </section>

          <section aria-label="Right now" className="space-y-4">
            <h2 className="text-lg font-semibold">Right now</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Open orders" value={String(d.now.open_orders)} />
              <Stat label="Active subscriptions" value={String(d.now.active_subscriptions)} />
              <Stat label="Customers" value={String(d.now.customers)} />
              <Stat label="Team members" value={String(d.now.staff)} />
              <Stat label="On the waitlist" value={String(d.now.waitlist_total)} />
            </div>
            {d.waitlist_areas.length > 0 && (
              <div className="card p-5">
                <h3 className="mb-3 font-semibold">Where waitlist sign-ups are (areas you do not serve yet)</h3>
                <BarList rows={d.waitlist_areas.map((a) => ({ label: a.area, value: a.n, display: String(a.n) }))} />
              </div>
            )}
          </section>

          <p className="text-sm"><Link href="/admin/money" className="font-medium text-brand-dark hover:underline">See what each drawer and POS should hold today &rarr;</Link></p>
        </>
      )}
    </div>
  );
}
