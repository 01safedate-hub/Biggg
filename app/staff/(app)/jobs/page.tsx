import Link from "next/link";
import { PhoneActions } from "@/components/ops/PhoneActions";
import { requireRole } from "@/lib/roles";
import { STATUS_LABEL } from "@/lib/orders";
import { AgentPickupMap } from "@/components/ops/AgentPickupMap";
import { ArrivalCode, FailedDeliveryForm, FailedPickupForm, Itemiser, ReopenButton } from "@/components/ops/AgentTools";
import { LocationSharer } from "@/components/ops/LocationSharer";
import { StainList } from "@/components/orders/StainList";

export const metadata = { title: "My jobs" };

export default async function JobsPage() {
  const { supabase, user } = await requireRole(["delivery_agent"]);
  const { data } = await supabase.from("orders").select("id,order_no,status,pickup_address,pickup_lat,pickup_lng,customer_id,scheduled_for,created_at,delivery_agent_id")
    .or(`and(pickup_agent_id.eq.${user.id},status.in.(agent_assigned,agent_arrived,counted,count_confirmed)),and(delivery_agent_id.eq.${user.id},status.eq.out_for_delivery)`).order("created_at");
  const pickupIds = (data ?? []).filter((o) => ["agent_arrived", "counted", "count_confirmed"].includes(o.status)).map((o) => o.id);
  const [{ data: cats }, { data: items }, { data: lines }] = await Promise.all([
    supabase.from("item_categories").select("id,name").eq("active", true).order("sort_order").order("name"),
    supabase.from("items").select("id,name,price_kobo,category_id,description").eq("active", true).order("sort_order").order("name"),
    pickupIds.length ? supabase.from("order_items").select("id,order_id,item_id,name,qty,unit_price_kobo,line_total_kobo").in("order_id", pickupIds).is("removed_at", null) : Promise.resolve({ data: [] }),
  ]);
  const initialByOrder = new Map<string, Record<string, number>>();
  for (const line of lines ?? []) if (line.item_id) initialByOrder.set(line.order_id, { ...(initialByOrder.get(line.order_id) ?? {}), [line.item_id]: line.qty });
  const linesByOrder = new Map<string, typeof lines>();
  for (const line of lines ?? []) linesByOrder.set(line.order_id, [...(linesByOrder.get(line.order_id) ?? []), line]);
  const cids = Array.from(new Set((data ?? []).map((o) => o.customer_id)));
  const { data: ppl } = cids.length ? await supabase.from("profiles").select("id,phone").in("id", cids) : { data: [] };
  const phone = new Map((ppl ?? []).map((p) => [p.id, p.phone]));
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">My jobs</h1><p className="mt-1 text-sm text-ink-soft">Open a job when you reach the customer. You never take cash: the customer pays on their phone.</p></div>
      <AgentPickupMap agentId={user.id} />
      <section className="space-y-3">
        {(data ?? []).map((o) => (
          <div key={o.id} className="card">
            <div className="p-4"><p className="font-semibold">Order #{o.order_no} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${o.status === "out_for_delivery" ? "bg-emerald-100 text-emerald-800" : "bg-brand-tint text-brand-dark"}`}>{o.status === "out_for_delivery" ? "Delivery" : "Pickup"}</span></p><p className="text-sm text-ink-soft">{o.pickup_address}</p><p className="mt-1 text-xs font-medium text-brand-dark">{STATUS_LABEL[o.status] ?? o.status}</p></div>
            <div className="space-y-4 border-t border-line p-4">
              <div className="flex flex-wrap gap-4 text-sm">{phone.get(o.customer_id) && <PhoneActions phone={phone.get(o.customer_id)} label="Call or WhatsApp customer" />}{o.status === "agent_assigned" && <LocationSharer orderId={o.id} />}</div>
              {o.status === "agent_assigned" && <section className="space-y-3"><h3 className="font-semibold">Confirm you are at the door</h3><ArrivalCode orderId={o.id} /><FailedPickupForm orderId={o.id} /></section>}
              {o.status === "agent_arrived" && <section className="space-y-3"><h3 className="font-semibold">Count the clothes by category</h3><Itemiser orderId={o.id} cats={cats ?? []} items={(items ?? []).map((i) => ({ ...i, price_kobo: Number(i.price_kobo) }))} initial={initialByOrder.get(o.id) ?? {}} />{(linesByOrder.get(o.id) ?? []).length === 0 && <FailedPickupForm orderId={o.id} />}</section>}
              {o.status === "counted" && <section className="space-y-3"><h3 className="font-semibold">Waiting for customer payment</h3><p className="text-sm text-ink-soft">The customer must accept the count and pay on their phone. This page updates automatically.</p><ReopenButton orderId={o.id} /></section>}
              {o.status === "count_confirmed" && <section className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950"><p className="font-semibold">Paid ✓</p><p>The customer has paid. Take the clothes to the hub and hand them to the secretary.</p></section>}
              {o.status === "out_for_delivery" && <section className="space-y-3"><h3 className="font-semibold">Delivery</h3><LocationSharer orderId={o.id} /><ArrivalCode orderId={o.id} step="delivery" label="I am at the door: show my code" /><FailedDeliveryForm orderId={o.id} /></section>}
              {["agent_arrived", "counted", "count_confirmed"].includes(o.status) && <StainList supabase={supabase} orderId={o.id} />}
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="card p-5 text-sm text-ink-soft">No jobs right now. You will be notified when one is assigned.</p>}
      </section>
    </div>
  );
}
