import Link from "next/link";
import { Stat } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";
import { lagosToday, longDate } from "@/lib/money";
import { naira } from "@/lib/format";

export const metadata = { title: "Overview" };

type Recovery = {
  basis: string; capital_kobo: number; rent_kobo: number; revenue_kobo: number; expenses_kobo: number; measured_kobo: number;
  avg_daily_kobo: number; avg_monthly_kobo: number; avg_per_payment_kobo: number; capital_pct: number; rent_pct: number;
  remaining_capital_kobo: number; remaining_total_kobo: number; projected_capital_date: string | null; projected_total_date: string | null; days_used: number;
};
type Day = { online_kobo: number; manual_kobo: number; pending_expenses: number };

export default async function AdminHome() {
  const { supabase } = await requireRole(["super_admin"]);
  const [rec, day] = await Promise.all([supabase.rpc("recovery_detail"), supabase.rpc("daily_money_view", { _day: lagosToday() })]);
  const r = rec.data as unknown as Recovery | null;
  const d = day.data as unknown as Day | null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-ink-soft">Recovery is measured on {r?.basis === "revenue" ? "sales" : "profit (sales minus approved expenses)"}.</p>
      </div>

      {d && d.pending_expenses > 0 && (
        <Link href="/admin/expenses?status=pending" className="block rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          {d.pending_expenses} expense{d.pending_expenses === 1 ? "" : "s"} waiting for your approval. Review them now.
        </Link>
      )}

      {r ? (
        <>
          <section aria-label="Cost recovery" className="card p-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold">Start-up costs recovered</h2>
              <p className="text-3xl font-bold tracking-tight">{r.capital_pct}%</p>
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

          <section aria-label="Earnings" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total sales" value={naira(r.revenue_kobo)} />
            <Stat label="Approved expenses" value={naira(r.expenses_kobo)} />
            <Stat label="Average per day" value={naira(r.avg_daily_kobo)} hint={`Over the last ${r.days_used} day${r.days_used === 1 ? "" : "s"}`} />
            <Stat label="Average per month" value={naira(r.avg_monthly_kobo)} hint={`Average per payment ${naira(r.avg_per_payment_kobo)}`} />
          </section>
        </>
      ) : <p className="text-sm text-red-700">Could not load the recovery figures. Please refresh.</p>}

      {d && (
        <section aria-label="Today" className="card p-6">
          <h2 className="text-lg font-semibold">Today</h2>
          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-mute">Paid online (Paystack)</dt><dd className="text-xl font-bold">{naira(d.online_kobo)}</dd></div>
            <div><dt className="text-ink-mute">Collected by staff (cash, POS, transfer)</dt><dd className="text-xl font-bold">{naira(d.manual_kobo)}</dd></div>
          </dl>
          <Link href="/admin/money" className="mt-4 inline-block text-sm font-medium text-brand-dark hover:underline">See what each drawer and POS should hold &rarr;</Link>
        </section>
      )}
    </div>
  );
}
