import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { compactNaira } from "@/lib/dash";
import { Donut } from "@/components/customers/Donut";
import { Columns } from "@/components/customers/Columns";
import { SeriesCompare } from "@/components/customers/SeriesCompare";
import { BarList } from "@/components/admin/charts/BarList";
import { STAGES, monthLabel, pct, type Analytics } from "@/lib/customers";

export const metadata = { title: "Customers and growth" };
export const dynamic = "force-dynamic";

const Card = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="card space-y-4 p-5"><div><h2 className="text-lg font-semibold">{title}</h2>{hint && <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>}</div>{children}</section>
);
const Tile = ({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "good" }) => (
  <div className="card p-4"><p className="text-sm text-ink-mute">{label}</p><p className={`mt-1 text-2xl font-bold tracking-tight ${tone === "warn" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : ""}`}>{value}</p>{hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}</div>
);

export default async function CustomersOverview() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.rpc("customer_analytics");
  const a = data as unknown as Analytics | null;
  if (!a) return <p className="card p-5 text-sm text-ink-soft">Could not load the numbers. Refresh the page.</p>;
  const t = a.totals;
  const stageCount = (k: string) => a.stages[k as keyof typeof a.stages] ?? 0;
  const neverPct = pct(t.never_ordered, t.customers);
  const repeatPct = pct(t.repeat, t.ordered);
  const oneDone = stageCount("one_and_done");
  const lapsed = stageCount("lapsed");
  const thisMonth = a.visits[a.visits.length - 1];
  const insights: { text: string; href?: string; cta?: string }[] = [];
  if (t.customers === 0) insights.push({ text: "No customers have signed up yet. The charts below fill in by themselves as people join and book." });
  if (t.never_ordered > 0) insights.push({ text: `${t.never_ordered} of ${t.customers} people (${neverPct}%) signed up but have never ordered.`, href: "/admin/customers/campaigns/new?segment=never_ordered", cta: "Email them an offer" });
  if (oneDone > 0) insights.push({ text: `${oneDone} customer${oneDone === 1 ? "" : "s"} ordered once and have not come back in 30 days or more.`, href: "/admin/customers/campaigns/new?segment=one_and_done", cta: "Send a win-back code" });
  if (lapsed > 0) insights.push({ text: `${lapsed} repeat customer${lapsed === 1 ? "" : "s"} went quiet for 60 days or more.`, href: "/admin/customers/campaigns/new?segment=lapsed", cta: "Reach out" });
  if (t.customers > 0 && t.opted_in < t.customers / 2) insights.push({ text: `Only ${t.opted_in} of ${t.customers} customers agreed to receive offers, so those are the only people campaigns can reach. Ask for consent at signup and after a first delivery.` });
  const cmp = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? "No change" : "New") : `${cur >= prev ? "▲" : "▼"} ${Math.abs(Math.round(((cur - prev) / prev) * 100))}%`);
  const wk = a.weekly, last = wk[wk.length - 1], before = wk[wk.length - 2];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Customers" value={String(t.customers)} hint={`${t.new_30d} joined in the last 30 days`} />
        <Tile label="Never ordered" value={`${t.never_ordered}`} hint={`${neverPct}% of signups`} tone={neverPct > 50 ? "warn" : undefined} />
        <Tile label="Come back for more" value={`${repeatPct}%`} hint={`${t.repeat} of ${t.ordered} who ordered have ordered again`} tone={repeatPct >= 40 ? "good" : undefined} />
        <Tile label="Ordered in last 30 days" value={String(t.active_30d)} hint="Customers with an order" />
        <Tile label="Typical delivery time" value={a.turnaround.median_h != null ? `${a.turnaround.median_h} h` : "–"} hint={a.turnaround.delivered ? `Middle value over ${a.turnaround.delivered} delivered orders` : "From booking to delivered"} />
        <Tile label="Paid by customers" value={compactNaira(t.spent_kobo)} hint={naira(t.spent_kobo)} />
        <Tile label="Can receive offers" value={String(t.opted_in)} hint="Agreed to emails, can unsubscribe any time" />
        <Tile label="This week" value={`${last?.signups ?? 0} signups`} hint={`${cmp(last?.signups ?? 0, before?.signups ?? 0)} on last week · ${last?.orders ?? 0} orders`} />
      </div>

      {insights.length > 0 && (
        <section className="rounded-xl border border-brand/30 bg-brand-tint p-5" aria-label="What to act on">
          <h2 className="text-lg font-semibold text-brand-dark">What to act on</h2>
          <ul className="mt-3 space-y-2">{insights.map((i) => <li key={i.text} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{i.text}</span>{i.href && <Link href={i.href} className="font-semibold text-brand-dark underline">{i.cta}</Link>}</li>)}</ul>
        </section>
      )}

      <Card title="Signups and orders over time" hint="Compare day by day, week by week or month by month. Returning means a customer who had ordered before that period."><SeriesCompare data={{ daily: a.daily, weekly: a.weekly, monthly: a.monthly }} /></Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Where customers are in their journey" hint="Every customer sits in exactly one group. Click a group to see the people.">
          <Donut caption="customers" centre={String(t.customers)} slices={STAGES.map((s) => ({ label: s.label, value: stageCount(s.key), color: s.color, href: `/admin/customers/all?stage=${s.key}` }))} />
        </Card>
        <Card title="Groups at a glance" hint="What each group means and who to contact.">
          <div className="overflow-x-auto"><table className="w-full min-w-[24rem] text-left text-sm"><thead><tr className="border-b border-line text-ink-mute"><th className="py-2 pr-3 font-medium">Group</th><th className="py-2 pr-3 font-medium">People</th><th className="py-2 font-medium">Share</th></tr></thead>
            <tbody>{STAGES.map((s) => <tr key={s.key} className="border-b border-line last:border-0 align-top"><th scope="row" className="py-2.5 pr-3 font-medium"><span aria-hidden className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}<span className="block text-xs font-normal text-ink-mute">{s.blurb}</span></th><td className="py-2.5 pr-3 font-semibold tabular-nums">{stageCount(s.key)}</td><td className="py-2.5 tabular-nums">{pct(stageCount(s.key), t.customers)}%</td></tr>)}</tbody></table></div>
        </Card>
      </div>

      <Card title="How often customers use us each month" hint="Each column is a month. It shows how many customers ordered once, twice, three to four times, or five or more times in it.">
        <Columns stacked rows={a.visits.map((v) => ({ label: monthLabel(v.month).replace(/ 20/, " ’"), values: { once: v.once, twice: v.twice, three_four: v.three_four, five_plus: v.five_plus } }))}
          series={[{ key: "once", label: "Once", color: "#94a3b8" }, { key: "twice", label: "Twice", color: "#6da7ec" }, { key: "three_four", label: "3 to 4 times", color: "#2a78d6" }, { key: "five_plus", label: "5 or more", color: "#1baf7a" }]} empty="No orders yet. This fills in as customers book." />
        {thisMonth && (
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="rounded-full border border-line px-3 py-1.5 hover:bg-canvas" href="/admin/customers/all?min=1&max=1">Once this month: <strong>{thisMonth.once}</strong></Link>
            <Link className="rounded-full border border-line px-3 py-1.5 hover:bg-canvas" href="/admin/customers/all?min=2&max=2">Twice: <strong>{thisMonth.twice}</strong></Link>
            <Link className="rounded-full border border-line px-3 py-1.5 hover:bg-canvas" href="/admin/customers/all?min=3&max=4">3 to 4 times: <strong>{thisMonth.three_four}</strong></Link>
            <Link className="rounded-full border border-line px-3 py-1.5 hover:bg-canvas" href="/admin/customers/all?min=5">5 or more: <strong>{thisMonth.five_plus}</strong></Link>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="How long deliveries take" hint="From the moment a customer books to the moment the clothes are delivered.">
          <Columns rows={a.turnaround.buckets.map((b) => ({ label: b.label, values: { count: b.count } }))} series={[{ key: "count", label: "Orders", color: "#2a78d6" }]} height={220} empty="No delivered orders yet." />
          {a.turnaround.delivered > 0 && <p className="text-sm text-ink-soft">Average {a.turnaround.avg_h} hours · middle value {a.turnaround.median_h} hours · {a.turnaround.delivered} delivered orders.</p>}
        </Card>
        <Card title="Where customers are" hint="By the area of their latest pickup. See every pin on the Map tab.">
          <BarList rows={a.areas.map((x) => ({ label: x.area, value: x.customers, display: `${x.customers}`, note: `${x.orders} orders · ${compactNaira(x.spent_kobo)}` }))} empty="No customers yet." />
          {a.waitlist.length > 0 && (<div className="border-t border-line pt-4"><h3 className="text-sm font-semibold">Waiting for us to open in their area</h3><ul className="mt-2 space-y-1 text-sm">{a.waitlist.map((w) => <li key={w.area} className="flex justify-between"><span className="text-ink-soft">{w.area}</span><span className="font-semibold tabular-nums">{w.people}</span></li>)}</ul></div>)}
        </Card>
      </div>
    </div>
  );
}
