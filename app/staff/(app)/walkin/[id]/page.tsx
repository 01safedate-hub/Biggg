import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { Itemiser } from "@/components/ops/AgentTools";
import { DeliveryPanel, WalkinActions, WalkinInstant, WalkinPay } from "@/components/ops/WalkinTools";
import { PhoneActions } from "@/components/ops/PhoneActions";
import { AssignForm } from "@/components/ops/DeskTools";
import { PrintButton } from "@/components/orders/PrintButton";
import { AutoRefresh } from "@/components/orders/AutoRefresh";

export const metadata = { title: "Walk-in order" };
export const dynamic = "force-dynamic";

export default async function WalkinOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data: o } = await supabase.from("orders").select("*").eq("id", id).in("source", ["walk_in", "one_time"]).maybeSingle();
  if (!o) notFound();
  const [{ data: cust }, { data: lines }, { data: cats }, { data: items }, { data: pts }, { data: pay }, { data: related }, { data: icfg }, { data: stainRows }, { data: agentRows }] = await Promise.all([
    supabase.from("profiles").select("full_name,phone,is_walk_in").eq("id", o.customer_id).maybeSingle(),
    supabase.from("order_items").select("id,item_id,name,qty,unit_price_kobo,line_total_kobo").eq("order_id", id).is("removed_at", null),
    supabase.from("item_categories").select("id,name").eq("active", true).order("sort_order").order("name"),
    supabase.from("items").select("id,name,price_kobo,category_id,description").eq("active", true).order("sort_order").order("name"),
    supabase.from("money_points").select("id,name,kind").eq("active", true).neq("kind", "online").order("name"),
    supabase.from("payments").select("mode,amount_kobo,reference,paid_at,note").eq("order_id", id).eq("kind", "payment").eq("status", "success").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("orders").select("id,order_no,status,instant,parent_order_id").or(`parent_order_id.eq.${id},id.eq.${o.parent_order_id ?? id},parent_order_id.eq.${o.parent_order_id ?? id}`).neq("id", id),
    supabase.from("settings").select("value").eq("key", "instant").maybeSingle(),
    supabase.from("order_photos").select("note").eq("order_id", id).eq("kind", "stain"),
    o.status === "out_for_delivery" ? supabase.rpc("list_agents") : Promise.resolve({ data: [] }),
  ]);
  const icv = (icfg?.value ?? {}) as { enabled?: boolean; fee_per_item_kobo?: number };
  const stainedNames = Array.from(new Set((stainRows ?? []).map((r) => (r.note ?? "").split(": ")[0]).filter(Boolean)));
  const agents = (Array.isArray(agentRows) ? agentRows : []) as unknown as { id: string; name: string; open_jobs: number; on_shift?: boolean }[];
  const iq = o.status === "counted" ? (await supabase.rpc("instant_quote", { _order: id })).data as unknown as { enabled: boolean; per_item_kobo: number; items: number; fee_kobo: number; on: boolean; target_hours: number } | null : null;
  const initial: Record<string, number> = {};
  for (const l of lines ?? []) if (l.item_id) initial[l.item_id] = l.qty;
  const total = Math.max(0, o.items_total_kobo - o.discount_kobo) + o.instant_fee_kobo;
  const moving = ["count_confirmed", "received", "in_house", "awaiting_delivery_fare", "out_for_delivery"].includes(o.status);
  const paidLabel = pay ? (pay.mode === "cash" ? "Cash" : pay.mode === "transfer" ? "Bank transfer" : "POS card") : "";
  return (
    <div className="space-y-5">
      {(moving || (o.source === "one_time" && o.status === "ready")) && <AutoRefresh seconds={20} />}
      <div className="flex items-center justify-between print:hidden"><Link href="/staff/walkin" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Walk-in orders</Link>{pay && <PrintButton />}</div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Order #{o.order_no} <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium text-ink-soft print:hidden">{STATUS_LABEL[o.status] ?? o.status}</span></h1>
        <p className="mt-1 text-sm text-ink-soft">{cust?.full_name} · <PhoneActions phone={cust?.phone} message={o.status === "ready" ? `Hello ${(cust?.full_name ?? "").split(" ")[0]}, your clothes (order #${o.order_no}) are ready at LaundryPoint. Please come to collect them, or tell us if you want them delivered.` : undefined} /> · {o.source === "one_time" ? "one-time pickup" : "walk-in at the hub"}</p>
        {(related ?? []).length > 0 && <p className="mt-1 text-sm">Linked orders: {(related ?? []).map((r) => <Link key={r.id} href={`/staff/walkin/${r.id}`} className="mr-2 font-medium text-brand-dark underline">#{r.order_no}{r.instant ? " (instant)" : ""}</Link>)}</p>}
        {o.notes && <p className="mt-1 text-sm">Note: {o.notes}</p>}
      </div>

      {o.status === "agent_arrived" && (
        <section className="space-y-3 print:hidden">
          <h2 className="text-lg font-semibold">1. Count the clothes with the customer</h2>
          <Itemiser desk orderId={id} cats={cats ?? []} items={(items ?? []).map((i) => ({ ...i, price_kobo: Number(i.price_kobo) }))} initial={initial} instant={icv.enabled && (icv.fee_per_item_kobo ?? 0) > 0 ? { perItemKobo: icv.fee_per_item_kobo as number } : undefined} stainedNames={stainedNames} canAddItem />
          <WalkinActions orderId={id} kind="cancel" />
        </section>
      )}

      {o.status === "counted" && (
        <section className="card space-y-4 p-5 print:hidden">
          <h2 className="text-lg font-semibold">2. Take payment</h2>
          <ul className="divide-y divide-line text-sm">{(lines ?? []).map((l) => <li key={l.id} className="flex justify-between py-2"><span>{l.qty} × {l.name}</span><span>{naira(l.line_total_kobo ?? 0)}</span></li>)}</ul>
          {iq?.enabled && <WalkinInstant orderId={id} on={iq.on} perItemKobo={iq.per_item_kobo} items={iq.items} feeKobo={iq.fee_kobo} targetHours={iq.target_hours} />}
          {o.instant_fee_kobo > 0 && <p className="text-sm text-ink-soft">Includes instant delivery {naira(o.instant_fee_kobo)}.</p>}
          <p className="text-2xl font-bold">Customer pays {naira(total)}</p>
          <WalkinPay orderId={id} points={(pts ?? []).map((p) => ({ id: p.id, name: p.name }))} due={naira(total)} />
          <div className="flex flex-wrap gap-4 border-t border-line pt-4"><WalkinActions orderId={id} kind="reopen" /><WalkinActions orderId={id} kind="cancel" /></div>
        </section>
      )}

      {moving && <p className="card p-5 text-sm text-ink-soft print:hidden">Paid. {o.status === "count_confirmed" ? "Next: mark it received on the Receiving page, then it joins the wash queue." : "It is in the wash queue. It will show as ready here when washing is done."}</p>}
      {o.source === "one_time" && o.status === "ready" && (
        <section className="card space-y-2 border-brand/30 p-5">
          <h2 className="text-lg font-semibold">Customer fulfillment choice</h2>
          {o.fulfillment_choice === "collect" ? (
            <><p className="font-medium text-emerald-700">Collection requested by customer</p><p className="text-sm text-ink-soft">No delivery fee is due. Keep this order at the hub and confirm handover after the customer collects the clothes.</p></>
          ) : o.fulfillment_choice === "deliver" ? (
            <><p className="font-medium text-brand-dark">Delivery requested by customer</p><p className="text-sm text-ink-soft">Use the saved delivery address and latest fare below. Do not hand over as a collection unless the customer changes their choice.</p><p className="text-sm">Address: {o.pickup_address || "Not provided"}</p><p className="text-sm">Current delivery fare: {naira(o.delivery_fare_kobo ?? 0)}</p></>
          ) : (
            <p className="text-sm text-ink-soft">The customer has not saved a collection or delivery choice yet. Contact them before arranging fulfillment.</p>
          )}
        </section>
      )}

      {o.status === "ready" && (
        <section className="card space-y-4 p-5 print:hidden">
          <h2 className="text-lg font-semibold">Clothes are ready</h2>
          <p className="text-sm text-ink-soft">Tell the customer by call or WhatsApp (tap their number above). When they come, give them the clothes and confirm below. If they want delivery, arrange it first.</p>
          <WalkinActions orderId={id} kind="handover" />
          <div className="border-t border-line pt-4"><DeliveryPanel orderId={id} customerId={o.customer_id} status="ready" address={o.pickup_address} fareKobo={o.delivery_fare_kobo ?? 0} hasAccount={!cust?.is_walk_in} pickupLat={o.pickup_lat} pickupLng={o.pickup_lng} points={(pts ?? []).map((p) => ({ id: p.id, name: p.name }))} /></div>
        </section>
      )}
      {o.status === "awaiting_delivery_fare" && (
        <section className="card space-y-3 p-5 print:hidden"><h2 className="text-lg font-semibold">Waiting for the delivery fee</h2><DeliveryPanel orderId={id} customerId={o.customer_id} status="awaiting_delivery_fare" address={o.pickup_address} fareKobo={o.delivery_fare_kobo ?? 0} hasAccount={!cust?.is_walk_in} pickupLat={o.pickup_lat} pickupLng={o.pickup_lng} points={(pts ?? []).map((p) => ({ id: p.id, name: p.name }))} /></section>
      )}
      {o.status === "out_for_delivery" && (
        <section className="card space-y-3 p-5 print:hidden">
          <h2 className="text-lg font-semibold">Delivery fee paid: assign a rider</h2>
          <p className="text-sm text-ink-soft">Deliver to: {o.pickup_address}</p>
          <AssignForm orderId={id} agents={agents} current={o.delivery_agent_id} kind="delivery" />
        </section>
      )}
      {o.status === "delivered" && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 print:hidden">The customer has their clothes.</p>}
      {o.status === "cancelled" && <p className="rounded-md border border-line bg-canvas p-3 text-sm text-ink-soft print:hidden">This order was cancelled.</p>}

      {pay && (
        <section className="card p-5">
          <h2 className="text-lg font-semibold">Receipt</h2>
          <p className="text-sm text-ink-soft">Order #{o.order_no} · {pay.paid_at ? new Date(pay.paid_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }) : ""}</p>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-line">{(lines ?? []).map((l) => <tr key={l.id}><td className="py-2">{l.qty} × {l.name}</td><td className="py-2 text-right">{naira(l.line_total_kobo ?? 0)}</td></tr>)}</tbody>
            <tfoot><tr className="font-semibold"><td className="pt-3">Paid ({paidLabel})</td><td className="pt-3 text-right">{naira(pay.amount_kobo)}</td></tr></tfoot>
          </table>
          <p className="mt-2 text-xs text-ink-mute">Reference {pay.reference}</p>
        </section>
      )}
    </div>
  );
}
