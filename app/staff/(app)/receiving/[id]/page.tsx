import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { CheckLines } from "@/components/ops/DeskTools";
import { OrderTimeline } from "@/components/orders/Timeline";
import type { Timeline } from "@/lib/orders";

export const metadata = { title: "Check and receive" };

export default async function ReceiveOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data: o } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!o) notFound();
  const [{ data: lines }, { data: tl }, { data: its }, { data: cats }, { data: bal }, { data: subscriptionPickup }] = await Promise.all([
    supabase.from("order_items").select("id,name,category_name,qty,check_state,check_note").eq("order_id", id).is("removed_at", null).order("created_at"),
    supabase.rpc("order_timeline", { _order: id }),
    supabase.from("items").select("id,name,price_kobo,category_id").eq("active", true).order("sort_order").order("name"),
    supabase.from("item_categories").select("id,name").eq("active", true).order("sort_order").order("name"),
    supabase.rpc("items_balance", { _order: id }),
    o.source === "subscription"
      ? (supabase as any).from("subscription_pickups").select("id,overage_kobo,overage_pieces,subscription_invoices(status,subscription_pickup_id)").eq("order_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const options = (its ?? []).map((i) => ({ id: i.id, name: i.name, price_kobo: Number(i.price_kobo), category: catName.get(i.category_id) ?? "Other" }));
  const pickupInvoices = Array.isArray(subscriptionPickup?.subscription_invoices) ? subscriptionPickup.subscription_invoices : [];
  const overageInvoice = pickupInvoices.find((invoice: { subscription_pickup_id?: string }) => invoice.subscription_pickup_id === subscriptionPickup?.id);
  const subscriptionOveragePaid = o.source === "subscription" && overageInvoice?.status === "paid";
  // Subscription excess is billed through /account/extra-clothes. Do not block receiving
  // on the generic item-price balance once that pickup-specific invoice is paid.
  const dueKobo = o.source === "subscription"
    ? (Number(subscriptionPickup?.overage_pieces ?? 0) > 0 && !subscriptionOveragePaid ? Math.max(0, Number(subscriptionPickup?.overage_kobo ?? bal ?? 0)) : 0)
    : Math.max(0, Number(bal ?? 0));
  return (
    <div className="space-y-6">
      <Link href="/staff/receiving" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Receiving</Link>
      <div><h1 className="text-2xl font-bold tracking-tight">Order #{o.order_no}</h1><p className="mt-1 text-sm text-ink-soft">{o.source === "subscription" ? "Monthly plan pickup · check garment categories and quantities. Allowance is based on total pieces, not item prices." : `Paid ${naira(Math.max(0, o.items_total_kobo - o.discount_kobo))}`} · {o.status === "received" ? "Already received" : "Open the bag and check each line"}</p></div>
      {o.status === "count_confirmed" ? <CheckLines orderId={id} lines={(lines ?? []) as never} options={options} dueKobo={dueKobo} subscription={o.source === "subscription"} /> : (
        <ul className="card divide-y divide-line">{(lines ?? []).map((l) => <li key={l.id} className="p-4 text-sm">{l.qty} × {l.name} <span className="text-ink-mute">({l.category_name})</span></li>)}</ul>
      )}
      {tl && <OrderTimeline t={tl as unknown as Timeline} showPeople />}
    </div>
  );
}
