import { requireRole } from "@/lib/roles";
import { CLEANING_ADMIN } from "@/lib/cleaning-roles";
import { INVOICE_PURPOSE_LABEL, lagosDate, minutesLabel, nairaK } from "@/lib/cleaning";

export const metadata = { title: "Cleaning report" };
export const dynamic = "force-dynamic";

type Rep = {
  revenue: Record<string, number>; requests: number; inspections_done: number; quotes_sent: number; quotes_accepted: number; avg_quote_kobo: number | null;
  lost_reasons: Record<string, number>; visits_done: number; no_shows: number; recleans: number; avg_rating: number | null; active_plans: number; monthly_recurring_kobo: number;
  damage_payouts_kobo: number; utilisation: { booked_min: number; capacity_min: number };
  crew_pay: { name: string; visits: number; minutes: number; five_stars: number; pay_kobo: number }[];
  inspector_pay: { name: string; inspections: number; accepted: number; pay_kobo: number }[];
};

const D = /^\d{4}-\d{2}-\d{2}$/;

export default async function CleaningReport({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireRole(CLEANING_ADMIN);
  const to = D.test(sp.to ?? "") ? sp.to! : lagosDate();
  const from = D.test(sp.from ?? "") ? sp.from! : `${to.slice(0, 8)}01`;
  const { data, error } = await supabase.rpc("cleaning_report" as never, { _from: from, _to: to } as never);
  const r = data as unknown as Rep | null;
  const revenue = Object.values(r?.revenue ?? {}).reduce((s, v) => s + Number(v), 0);
  const util = r && r.utilisation.capacity_min > 0 ? Math.round((r.utilisation.booked_min / r.utilisation.capacity_min) * 100) : 0;
  const tile = (label: string, value: string, note?: string) => <div className="card p-4"><p className="text-xs text-ink-mute">{label}</p><p className="mt-1 text-xl font-bold">{value}</p>{note && <p className="text-xs text-ink-soft">{note}</p>}</div>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Cleaning report</h1><p className="mt-1 text-sm text-ink-soft">Money in, how many quotes turn into jobs, quality, and crew pay for the period.</p></div>
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
          <label>From <input type="date" name="from" defaultValue={from} className="rounded-md border border-line px-2 py-1" /></label>
          <label>To <input type="date" name="to" defaultValue={to} className="rounded-md border border-line px-2 py-1" /></label>
          <button className="btn-secondary">Show</button>
        </form>
      </div>
      {(error || !r) && <p className="card p-4 text-sm text-red-700">Could not load the report.</p>}
      {r && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tile("Cleaning money received", nairaK(revenue), Object.entries(r.revenue).map(([k, v]) => `${INVOICE_PURPOSE_LABEL[k] ?? k} ${nairaK(v)}`).join(" · ") || undefined)}
            {tile("Active plans", String(r.active_plans), `${nairaK(r.monthly_recurring_kobo)} a month`)}
            {tile("Quotes accepted", `${r.quotes_accepted} of ${r.quotes_sent}`, r.quotes_sent ? `${Math.round((r.quotes_accepted / r.quotes_sent) * 100)}% · average quote ${nairaK(r.avg_quote_kobo)}` : undefined)}
            {tile("Crew time used", `${util}%`, `${minutesLabel(r.utilisation.booked_min)} of ${minutesLabel(r.utilisation.capacity_min)}`)}
            {tile("Requests", String(r.requests), `${r.inspections_done} inspections done`)}
            {tile("Visits done", String(r.visits_done), `${r.no_shows} could not get in · ${r.recleans} re-cleans`)}
            {tile("Average rating", r.avg_rating ? `${r.avg_rating} / 5` : "No ratings")}
            {tile("Compensation paid", nairaK(r.damage_payouts_kobo))}
          </div>
          {Object.keys(r.lost_reasons).length > 0 && (
            <section className="card p-4"><h2 className="font-semibold">Why requests were lost</h2>
              <ul className="mt-2 text-sm">{Object.entries(r.lost_reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span>{v}</span></li>)}</ul></section>
          )}
          <section className="card overflow-x-auto p-4">
            <h2 className="font-semibold">Crew pay (worked out from time on site)</h2>
            <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs text-ink-mute"><th>Name</th><th>Visits</th><th>Time on site</th><th>5-star visits</th><th className="text-right">Pay</th></tr></thead>
              <tbody>{r.crew_pay.map((c) => <tr key={c.name} className="border-t border-line"><td className="py-1">{c.name}</td><td>{c.visits}</td><td>{minutesLabel(c.minutes)}</td><td>{c.five_stars}</td><td className="text-right">{nairaK(c.pay_kobo)}</td></tr>)}</tbody></table>
            {r.crew_pay.length === 0 && <p className="text-sm text-ink-mute">No finished visits in this period.</p>}
          </section>
          <section className="card overflow-x-auto p-4">
            <h2 className="font-semibold">Inspector pay</h2>
            <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs text-ink-mute"><th>Name</th><th>Inspections</th><th>Turned into jobs</th><th className="text-right">Pay</th></tr></thead>
              <tbody>{r.inspector_pay.map((c) => <tr key={c.name} className="border-t border-line"><td className="py-1">{c.name}</td><td>{c.inspections}</td><td>{c.accepted}</td><td className="text-right">{nairaK(c.pay_kobo)}</td></tr>)}</tbody></table>
            {r.inspector_pay.length === 0 && <p className="text-sm text-ink-mute">No inspections in this period.</p>}
          </section>
        </>
      )}
    </div>
  );
}
