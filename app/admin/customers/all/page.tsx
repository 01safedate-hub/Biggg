import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { StageBadge } from "@/components/customers/StageBadge";
import { STAGES, dt, gmaps, monthLabel, type CustomerRow } from "@/lib/customers";
import { rpcArgs, type Filters } from "@/lib/customer-filters";

export const metadata = { title: "All customers" };
export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function AllCustomers({ searchParams }: { searchParams: Promise<Filters> }) {
  const f = await searchParams;
  const page = Math.max(1, Number(f.page) || 1);
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.rpc("customer_list", rpcArgs(f, PAGE, (page - 1) * PAGE));
  const res = data as unknown as { total: number; rows: CustomerRow[]; month: string } | null;
  const rows = res?.rows ?? [];
  const total = res?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (over: Partial<Filters>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, ...over })) if (v) p.set(k, String(v)); const s = p.toString(); return s ? `?${s}` : ""; };
  const exportHref = `/admin/customers/export${qs({ page: undefined })}`;
  const sel = "rounded-md border border-line bg-white px-3 py-2 text-sm";
  const visitsOn = f.min || f.max;
  return (
    <div className="space-y-5">
      <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter customers">
        <input name="q" defaultValue={f.q ?? ""} placeholder="Name, email, phone or code" aria-label="Search" className={`${sel} sm:col-span-2`} />
        <select name="stage" defaultValue={f.stage ?? ""} aria-label="Group" className={sel}><option value="">All groups</option>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <select name="sort" defaultValue={f.sort ?? "recent"} aria-label="Sort by" className={sel}>
          <option value="recent">Newest signups</option><option value="orders">Most orders</option><option value="spent">Highest spend</option><option value="quiet">Longest quiet</option><option value="turnaround">Slowest deliveries</option>
        </select>
        <div className="flex items-center gap-2 sm:col-span-2"><span className="text-sm text-ink-soft">Orders in</span>
          <input type="month" name="month" defaultValue={f.month ?? ""} aria-label="Month" className={sel} />
          <span className="text-sm text-ink-soft">between</span>
          <input name="min" inputMode="numeric" defaultValue={f.min ?? ""} aria-label="At least" placeholder="2" className={`${sel} w-16`} /><span className="text-sm text-ink-soft">and</span>
          <input name="max" inputMode="numeric" defaultValue={f.max ?? ""} aria-label="At most" placeholder="4" className={`${sel} w-16`} /></div>
        <select name="opted" defaultValue={f.opted ?? ""} aria-label="Offers" className={sel}><option value="">Offers: any</option><option value="yes">Agreed to offers</option><option value="no">Not agreed</option></select>
        <div className="flex gap-2"><button className="btn-primary">Apply</button><Link href="/admin/customers/all" className="btn-secondary">Clear</Link></div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft"><strong className="text-ink">{total}</strong> customer{total === 1 ? "" : "s"}{visitsOn ? ` · orders counted in ${res?.month ? monthLabel(res.month) : "this month"}` : ""}</p>
        <div className="flex gap-3 text-sm">
          {f.stage && <Link className="font-medium text-brand-dark underline" href={`/admin/customers/campaigns/new?segment=${f.stage}`}>Email this group</Link>}
          <a className="font-medium text-brand-dark underline" href={exportHref}>Download spreadsheet (CSV)</a>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead><tr className="border-b border-line bg-canvas text-ink-mute"><th className="px-4 py-3 font-medium">Customer</th><th className="px-3 py-3 font-medium">Contact</th><th className="px-3 py-3 font-medium">Group</th><th className="px-3 py-3 font-medium">Orders</th><th className="px-3 py-3 font-medium">That month</th><th className="px-3 py-3 font-medium">Last order</th><th className="px-3 py-3 font-medium">Delivery time</th><th className="px-3 py-3 font-medium">Spent</th><th className="px-3 py-3 font-medium">Area</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line align-top last:border-0 hover:bg-canvas/60">
                <td className="px-4 py-3"><Link href={`/admin/customers/${c.id}`} className="font-medium text-brand-dark hover:underline">{c.full_name || "No name"}</Link><p className="text-xs text-ink-mute">{c.customer_code} · joined {dt(c.signed_up_at)}</p>{c.status !== "active" && <p className="text-xs font-medium text-red-700">Restricted</p>}</td>
                <td className="px-3 py-3">{c.phone ? <a className="underline" href={`tel:${c.phone}`}>{c.phone}</a> : <span className="text-ink-mute">No phone</span>}<p className="max-w-[12rem] truncate text-xs text-ink-soft">{c.email}</p><p className="text-xs text-ink-mute">{c.marketing_opt_in ? "Accepts offers" : "No offers"}</p></td>
                <td className="px-3 py-3"><StageBadge stage={c.stage} /></td>
                <td className="px-3 py-3 font-semibold tabular-nums">{c.orders}</td>
                <td className="px-3 py-3 tabular-nums">{c.month_orders}</td>
                <td className="px-3 py-3">{dt(c.last_order_at)}{c.orders > 0 && <p className="text-xs text-ink-mute">{c.days_quiet} days ago</p>}</td>
                <td className="px-3 py-3 tabular-nums">{c.avg_turnaround_h != null ? `${c.avg_turnaround_h} h` : "–"}</td>
                <td className="px-3 py-3 tabular-nums">{c.spent_kobo ? naira(c.spent_kobo) : "–"}</td>
                <td className="px-3 py-3">{c.zone_name ?? "–"}{c.lat != null && c.lng != null && <a className="block text-xs underline" target="_blank" rel="noopener noreferrer" href={gmaps(c.lat, c.lng)}>Google Maps</a>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-ink-soft">{total === 0 && !f.q && !f.stage && !visitsOn ? "No customers have signed up yet." : "Nobody matches these filters."}</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pages">
          {page > 1 ? <Link className="btn-secondary" href={`/admin/customers/all${qs({ page: String(page - 1) })}`}>&larr; Previous</Link> : <span />}
          <span className="text-ink-soft">Page {page} of {pages}</span>
          {page < pages ? <Link className="btn-secondary" href={`/admin/customers/all${qs({ page: String(page + 1) })}`}>Next &rarr;</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
