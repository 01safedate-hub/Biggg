import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { mapsLink } from "@/lib/orders";
import { naira } from "@/lib/format";
import { ArrivalCode, FailedDeliveryForm, FailedPickupForm, Itemiser, ReopenButton } from "@/components/ops/AgentTools";
import { LocationSharer } from "@/components/ops/LocationSharer";
import { AutoRefresh } from "@/components/orders/AutoRefresh";

export const metadata = { title: "Pickup job" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireRole(["delivery_agent"]);
  const { data: o } = await supabase.from("orders").select("*").eq("id", id).or(`pickup_agent_id.eq.${user.id},delivery_agent_id.eq.${user.id}`).maybeSingle();
  if (!o) notFound();
  const [{ data: cust }, { data: lines }, { data: cats }, { data: items }] = await Promise.all([
    supabase.from("profiles").select("full_name,phone").eq("id", o.customer_id).maybeSingle(),
    supabase.from("order_items").select("id,item_id,name,qty,unit_price_kobo,line_total_kobo").eq("order_id", id).is("removed_at", null),
    supabase.from("item_categories").select("id,name").eq("active", true).order("sort_order").order("name"),
    supabase.from("items").select("id,name,price_kobo,category_id").eq("active", true).order("sort_order").order("name"),
  ]);
  const initial: Record<string, number> = {};
  for (const l of lines ?? []) if (l.item_id) initial[l.item_id] = l.qty;
  const map = mapsLink(o.pickup_lat, o.pickup_lng);
  const total = Math.max(0, o.items_total_kobo - o.discount_kobo);
  const delivering = o.delivery_agent_id === user.id && ["out_for_delivery", "delivered", "failed_delivery"].includes(o.status);
  if (delivering) {
    return (
      <div className="space-y-6">
        {o.status === "out_for_delivery" && <AutoRefresh seconds={5} />}
        <Link href="/staff/jobs" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Jobs</Link>
        <div><h1 className="text-2xl font-bold tracking-tight">Delivery · Order #{o.order_no}</h1>
          <p className="mt-1 text-sm text-ink-soft">{cust?.full_name} · {cust?.phone && <a className="font-medium text-brand-dark underline" href={`tel:${cust.phone}`}>{cust.phone}</a>}</p>
          <p className="mt-1 text-sm text-ink-soft">{o.pickup_address} {map && <a className="underline" target="_blank" rel="noopener noreferrer" href={map}>Open in Google Maps</a>}</p></div>
        <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">The delivery fare is already paid online. Do not collect any cash.</p>
        <section className="card p-5"><h2 className="text-lg font-semibold">In the bag</h2>
          <ul className="mt-2 divide-y divide-line text-sm">{(lines ?? []).map((l) => <li key={l.id} className="py-2">{l.qty} × {l.name}</li>)}</ul></section>
        {o.status === "out_for_delivery" && <section className="card space-y-4 p-5"><h2 className="text-lg font-semibold">When you reach the door</h2><LocationSharer orderId={id} /><ArrivalCode orderId={id} step="delivery" label="I am at the door: show my code" /><FailedDeliveryForm orderId={id} /></section>}
        {o.status === "delivered" && <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950"><h2 className="text-xl font-bold">Delivered ✓</h2><p className="text-sm">The customer confirmed with the code. Well done.</p></section>}
        {o.status === "failed_delivery" && <section className="rounded-xl border border-red-300 bg-red-50 p-5 text-red-950"><h2 className="text-xl font-bold">Logged as not delivered</h2><p className="text-sm">Bring the bag back to the hub. The office will arrange another try.</p></section>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {["agent_assigned", "agent_arrived", "counted"].includes(o.status) && <AutoRefresh seconds={5} />}
      <Link href="/staff/jobs" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Jobs</Link>
      <div><h1 className="text-2xl font-bold tracking-tight">Order #{o.order_no}</h1>
        <p className="mt-1 text-sm text-ink-soft">{cust?.full_name} · {cust?.phone && <a className="font-medium text-brand-dark underline" href={`tel:${cust.phone}`}>{cust.phone}</a>}</p>
        <p className="mt-1 text-sm text-ink-soft">{o.pickup_address} {map && <a className="underline" target="_blank" rel="noopener noreferrer" href={map}>Open in Google Maps</a>}</p>
        {o.notes && <p className="mt-1 text-sm">Note: {o.notes}</p>}</div>
      <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Do not take cash from the customer. They pay on their own phone, and you leave once you see it marked paid here.</p>

      {o.status === "agent_assigned" && <section className="card space-y-3 p-5"><h2 className="text-lg font-semibold">1. Confirm you are at the door</h2><LocationSharer orderId={id} /><ArrivalCode orderId={id} /><FailedPickupForm orderId={id} /></section>}
      {o.status === "agent_arrived" && <section className="space-y-3"><h2 className="text-lg font-semibold">2. Count the clothes by category</h2><Itemiser orderId={id} cats={cats ?? []} items={(items ?? []).map((i) => ({ ...i, price_kobo: Number(i.price_kobo) }))} initial={initial} />{(lines ?? []).length === 0 && <FailedPickupForm orderId={id} />}</section>}
      {o.status === "counted" && (
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold">3. Waiting for the customer to pay</h2>
          <ul className="divide-y divide-line text-sm">{(lines ?? []).map((l) => <li key={l.id} className="flex justify-between py-2"><span>{l.qty} × {l.name}</span><span>{naira(l.line_total_kobo ?? 0)}</span></li>)}</ul>
          <p className="text-lg font-bold">Bill: {naira(total)}</p>
          <p className="text-sm text-ink-soft">The bill is on their phone. This page updates when they have paid.</p>
          <ReopenButton orderId={id} />
        </section>
      )}
      {o.status === "count_confirmed" && (
        <section className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
          <h2 className="text-xl font-bold">Paid ✓ {naira(total)}</h2>
          <p className="text-sm">The customer has paid on their phone. You can leave. Take the clothes to the hub and hand them to the secretary.</p>
        </section>
      )}
    </div>
  );
}
