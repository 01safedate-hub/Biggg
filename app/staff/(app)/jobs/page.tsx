import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { STATUS_LABEL, mapsLink } from "@/lib/orders";

export const metadata = { title: "My jobs" };

export default async function JobsPage() {
  const { supabase, user } = await requireRole(["delivery_agent"]);
  const { data } = await supabase.from("orders").select("id,order_no,status,pickup_address,pickup_lat,pickup_lng,customer_id,scheduled_for,created_at,delivery_agent_id")
    .or(`and(pickup_agent_id.eq.${user.id},status.in.(agent_assigned,agent_arrived,counted,count_confirmed)),and(delivery_agent_id.eq.${user.id},status.eq.out_for_delivery)`).order("created_at");
  const cids = Array.from(new Set((data ?? []).map((o) => o.customer_id)));
  const { data: ppl } = cids.length ? await supabase.from("profiles").select("id,phone").in("id", cids) : { data: [] };
  const phone = new Map((ppl ?? []).map((p) => [p.id, p.phone]));
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">My jobs</h1><p className="mt-1 text-sm text-ink-soft">Open a job when you reach the customer. You never take cash: the customer pays on their phone.</p></div>
      <section className="space-y-3">
        {(data ?? []).map((o) => (
          <div key={o.id} className="card"><Link href={`/staff/jobs/${o.id}`} className="block p-4 hover:bg-canvas">
            <p className="font-semibold">Order #{o.order_no} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${o.status === "out_for_delivery" ? "bg-emerald-100 text-emerald-800" : "bg-brand-tint text-brand-dark"}`}>{o.status === "out_for_delivery" ? "Delivery" : "Pickup"}</span></p><p className="text-sm text-ink-soft">{o.pickup_address}</p><p className="mt-1 text-xs font-medium text-brand-dark">{STATUS_LABEL[o.status] ?? o.status}</p>
          </Link>
          <div className="flex gap-3 border-t border-line px-4 py-2 text-sm">
            {phone.get(o.customer_id) && <a className="font-medium text-brand-dark underline" href={`tel:${phone.get(o.customer_id)}`}>Call customer</a>}
            {mapsLink(o.pickup_lat, o.pickup_lng) && <a className="font-medium text-brand-dark underline" target="_blank" rel="noopener noreferrer" href={mapsLink(o.pickup_lat, o.pickup_lng) ?? undefined}>Directions</a>}
          </div></div>
        ))}
        {(data ?? []).length === 0 && <p className="card p-5 text-sm text-ink-soft">No jobs right now. You will be notified when one is assigned.</p>}
      </section>
    </div>
  );
}
