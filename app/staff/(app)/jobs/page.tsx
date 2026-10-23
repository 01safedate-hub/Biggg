import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { STATUS_LABEL } from "@/lib/orders";

export const metadata = { title: "My jobs" };

export default async function JobsPage() {
  const { supabase, user } = await requireRole(["delivery_agent"]);
  const { data } = await supabase.from("orders").select("id,order_no,status,pickup_address,scheduled_for,created_at,delivery_agent_id")
    .or(`and(pickup_agent_id.eq.${user.id},status.in.(agent_assigned,agent_arrived,counted,count_confirmed)),and(delivery_agent_id.eq.${user.id},status.eq.out_for_delivery)`).order("created_at");
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">My jobs</h1><p className="mt-1 text-sm text-ink-soft">Open a job when you reach the customer. You never take cash: the customer pays on their phone.</p></div>
      <section className="space-y-3">
        {(data ?? []).map((o) => (
          <Link key={o.id} href={`/staff/jobs/${o.id}`} className="card block p-4 hover:bg-canvas">
            <p className="font-semibold">Order #{o.order_no} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${o.status === "out_for_delivery" ? "bg-emerald-100 text-emerald-800" : "bg-brand-tint text-brand-dark"}`}>{o.status === "out_for_delivery" ? "Delivery" : "Pickup"}</span></p><p className="text-sm text-ink-soft">{o.pickup_address}</p><p className="mt-1 text-xs font-medium text-brand-dark">{STATUS_LABEL[o.status] ?? o.status}</p>
          </Link>
        ))}
        {(data ?? []).length === 0 && <p className="card p-5 text-sm text-ink-soft">No jobs right now. You will be notified when one is assigned.</p>}
      </section>
    </div>
  );
}
