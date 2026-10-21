import Link from "next/link";
import { Stat } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";
import { MODE_LABEL, PURPOSE_LABEL, lagosToday, longDate } from "@/lib/money";
import { naira } from "@/lib/format";
import { inputCls } from "@/components/admin/ui";

export const metadata = { title: "Daily money" };

type Point = {
  id: string; name: string; kind: string; takings_in_kobo: number; refunds_kobo: number; expenses_out_kobo: number; day_net_kobo: number; balance_kobo: number;
  by_mode: Record<string, number>;
  latest_count: { counted_kobo: number; basis: string; difference_kobo: number; counted_by: string; at: string; note: string | null } | null;
};
type Day = { day: string; points: Point[]; online_kobo: number; manual_kobo: number; online_by_purpose: Record<string, number>; manual_by_purpose: Record<string, number>; pending_expenses: number };

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day: raw } = await searchParams;
  const today = lagosToday();
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.rpc("daily_money_view", { _day: day });
  const v = data as unknown as Day | null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily money</h1>
          <p className="mt-1 text-sm text-ink-soft">{longDate(day)}. What each cash drawer, POS and account should hold.</p>
        </div>
        <form className="flex items-end gap-2" method="get">
          <div><label htmlFor="day" className="block text-sm font-medium">Day</label><input id="day" name="day" type="date" max={today} defaultValue={day} className={inputCls} /></div>
          <button className="btn-secondary">Show</button>
        </form>
      </div>

      {!v ? <p className="text-sm text-red-700">Could not load this day. Please refresh.</p> : (
        <>
          {v.pending_expenses > 0 && <Link href="/admin/expenses?status=pending" className="block rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">{v.pending_expenses} expense{v.pending_expenses === 1 ? "" : "s"} still awaiting approval. They are not yet deducted below.</Link>}

          <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2">
            <Stat label="Paid online (Paystack)" value={naira(v.online_kobo)} />
            <Stat label="Collected by staff" value={naira(v.manual_kobo)} hint="Cash, POS and bank transfer" />
          </section>

          <section aria-label="By money point" className="space-y-3">
            <h2 className="text-lg font-semibold">Where the money should be</h2>
            {v.points.map((p) => {
              const c = p.latest_count;
              const diff = c?.difference_kobo ?? 0;
              return (
                <article key={p.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="text-sm text-ink-mute">Holding in total: <span className="font-semibold text-ink">{naira(p.balance_kobo)}</span></p>
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-ink-mute">Taken today</dt><dd className="font-semibold">{naira(p.takings_in_kobo)}</dd></div>
                    <div><dt className="text-ink-mute">Refunded</dt><dd className="font-semibold">{naira(p.refunds_kobo)}</dd></div>
                    <div><dt className="text-ink-mute">Expenses paid out</dt><dd className="font-semibold">{naira(p.expenses_out_kobo)}</dd></div>
                    <div><dt className="text-ink-mute">Should have today</dt><dd className="text-base font-bold">{naira(p.day_net_kobo)}</dd></div>
                  </dl>
                  {Object.keys(p.by_mode).length > 0 && (
                    <p className="mt-3 text-sm text-ink-soft">{Object.entries(p.by_mode).map(([m, k]) => `${MODE_LABEL[m] ?? m}: ${naira(k)}`).join(" · ")}</p>
                  )}
                  <div className={`mt-4 rounded-md border p-3 text-sm ${!c ? "border-line bg-canvas text-ink-mute" : diff === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
                    {!c ? "No count recorded for this day yet." : (
                      <>
                        {c.counted_by} counted {naira(c.counted_kobo)} ({c.basis === "day" ? "that day's takings" : "everything held"}).{" "}
                        <strong>{diff === 0 ? "Matches exactly." : diff < 0 ? `Short by ${naira(-diff)}.` : `Over by ${naira(diff)}.`}</strong>
                        {c.note ? ` Note: ${c.note}` : ""}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          <section aria-label="What payments were for" className="grid gap-4 md:grid-cols-2">
            {([["Online payments", v.online_by_purpose], ["Staff-collected payments", v.manual_by_purpose]] as const).map(([title, rows]) => (
              <div key={title} className="card p-5">
                <h2 className="font-semibold">{title}: what for</h2>
                {Object.keys(rows).length === 0 ? <p className="mt-2 text-sm text-ink-mute">None.</p> : (
                  <ul className="mt-3 divide-y divide-line text-sm">
                    {Object.entries(rows).map(([k, n]) => <li key={k} className="flex justify-between py-2"><span>{PURPOSE_LABEL[k] ?? k}</span><span className="font-semibold">{naira(n)}</span></li>)}
                  </ul>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
