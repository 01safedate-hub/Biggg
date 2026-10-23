import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { StageBadge } from "@/components/customers/StageBadge";
import { CustomerMap } from "@/components/customers/CustomerMap";
import { CustomerStatus } from "@/components/admin/CustomerRow";
import { dt, gmaps, type CustomerRow, type MapPoint } from "@/lib/customers";

export const metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

type Detail = {
  customer: CustomerRow & { first_order_at: string | null; busiest_month: number; delivered: number; avg_turnaround_s: number | null };
  orders: { id: string; order_no: number; status: string; created_at: string; delivered_at: string | null; address: string | null; fares_kobo: number; items_kobo: number; discount_kobo: number; turnaround_h: number | null }[];
  emails: { subject: string | null; status: string; at: string }[];
};

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("customer_detail", { _id: id });
  if (error || !data) notFound();
  const { customer: c, orders, emails } = data as unknown as Detail;
  const wa = c.phone ? c.phone.replace(/\D/g, "").replace(/^0/, "234") : null;
  const point: MapPoint[] = c.lat != null && c.lng != null ? [{ id: c.id, name: c.full_name, lat: c.lat, lng: c.lng, stage: c.stage, orders: c.orders, address: c.address, zone: c.zone_name }] : [];
  const tile = (label: string, value: string, hint?: string) => <div className="card p-4"><p className="text-sm text-ink-mute">{label}</p><p className="mt-1 text-xl font-bold">{value}</p>{hint && <p className="text-xs text-ink-mute">{hint}</p>}</div>;
  return (
    <div className="space-y-6">
      <Link href="/admin/customers/all" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; All customers</Link>
      <section className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-bold tracking-tight">{c.full_name || "No name"}</h2><StageBadge stage={c.stage} /></div>
          <p className="text-sm text-ink-soft">{c.customer_code} · joined {dt(c.signed_up_at)} · {c.marketing_opt_in ? "Accepts offers by email" : "Has not agreed to offers"}</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {c.phone && <a className="btn-secondary !px-3 !py-1.5" href={`tel:${c.phone}`}>Call {c.phone}</a>}
            {wa && <a className="btn-secondary !px-3 !py-1.5" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}`}>WhatsApp</a>}
            {c.email && <a className="btn-secondary !px-3 !py-1.5" href={`mailto:${c.email}`}>{c.email}</a>}
          </div>
        </div>
        <CustomerStatus id={c.id} status={c.status} />
      </section>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tile("Orders", String(c.orders), c.first_order_at ? `First on ${dt(c.first_order_at)}` : "Has not ordered")}
        {tile("Busiest month", `${c.busiest_month} order${c.busiest_month === 1 ? "" : "s"}`)}
        {tile("Total paid", naira(c.spent_kobo))}
        {tile("Delivery time", c.avg_turnaround_s != null ? `${Math.round((Number(c.avg_turnaround_s) / 3600) * 10) / 10} h` : "–", "Average, booking to delivered")}
      </div>
      <section className="card p-5"><h2 className="text-lg font-semibold">Orders</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm"><thead><tr className="border-b border-line text-ink-mute"><th className="py-2 pr-3 font-medium">Order</th><th className="py-2 pr-3 font-medium">Booked</th><th className="py-2 pr-3 font-medium">Status</th><th className="py-2 pr-3 font-medium">Delivery time</th><th className="py-2 pr-3 font-medium">Transport</th><th className="py-2 pr-3 font-medium">Clothes</th><th className="py-2 font-medium">Discount</th></tr></thead>
          <tbody>{orders.map((o) => <tr key={o.id} className="border-b border-line last:border-0"><th scope="row" className="py-2 pr-3 font-medium"><Link className="text-brand-dark underline" href={`/staff/orders/${o.id}`}>#{o.order_no}</Link></th><td className="py-2 pr-3">{dt(o.created_at)}</td><td className="py-2 pr-3">{STATUS_LABEL[o.status] ?? o.status}</td><td className="py-2 pr-3 tabular-nums">{o.turnaround_h != null ? `${o.turnaround_h} h` : "–"}</td><td className="py-2 pr-3 tabular-nums">{naira(o.fares_kobo)}</td><td className="py-2 pr-3 tabular-nums">{naira(o.items_kobo)}</td><td className="py-2 tabular-nums">{o.discount_kobo ? naira(o.discount_kobo) : "–"}</td></tr>)}
            {orders.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-ink-soft">No orders yet.</td></tr>}</tbody></table></div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3 p-5"><h2 className="text-lg font-semibold">Location</h2>
          {point.length ? (<><p className="text-sm text-ink-soft">{c.address} {c.zone_name ? `· ${c.zone_name}` : ""} <a className="underline" target="_blank" rel="noopener noreferrer" href={gmaps(c.lat!, c.lng!)}>Google Maps</a></p><CustomerMap points={point} single height={260} /></>) : <p className="text-sm text-ink-soft">No location yet. It is saved the first time they book a pickup.</p>}
        </section>
        <section className="card space-y-3 p-5"><h2 className="text-lg font-semibold">Emails we sent them</h2>
          <ul className="divide-y divide-line text-sm">{emails.map((e, i) => <li key={i} className="flex justify-between gap-3 py-2"><span>{e.subject}</span><span className="shrink-0 text-ink-mute">{e.status} · {dt(e.at)}</span></li>)}</ul>
          {emails.length === 0 && <p className="text-sm text-ink-soft">No campaign emails sent to this customer.</p>}
        </section>
      </div>
    </div>
  );
}
