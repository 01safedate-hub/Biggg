import { requireRole } from "@/lib/roles";
import { AssignForm } from "@/components/ops/DeskTools";
import { mapsLink } from "@/lib/orders";

export const metadata = { title: "Dispatch" };

export default async function DispatchPage() {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const [{ data: orders }, { data: ag }] = await Promise.all([
    supabase.from("orders").select("id,order_no,status,pickup_address,pickup_lat,pickup_lng,pickup_agent_id,scheduled_for,customer_id,created_at").in("status", ["awaiting_dispatch", "agent_assigned"]).order("created_at"),
    supabase.rpc("list_agents"),
  ]);
  const agents = (Array.isArray(ag) ? ag : []) as unknown as { id: string; name: string; open_jobs: number }[];
  const ids = Array.from(new Set((orders ?? []).map((o) => o.customer_id)));
  const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name,phone").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p]));
  const name = new Map(agents.map((a) => [a.id, a.name]));
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Dispatch</h1><p className="mt-1 text-sm text-ink-soft">Paid pickups waiting for an agent, and those on the way. You can change the agent until they reach the customer.</p></div>
      <section className="space-y-3">
        {(orders ?? []).map((o) => {
          const c = who.get(o.customer_id); const map = mapsLink(o.pickup_lat, o.pickup_lng);
          return (
            <article key={o.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">Order #{o.order_no} · {c?.full_name}</p><p className="text-sm text-ink-soft">{o.pickup_address} {map && <a className="underline" target="_blank" rel="noopener noreferrer" href={map}>map</a>}</p></div>
                <p className="text-xs font-semibold text-brand-dark">{o.status === "awaiting_dispatch" ? "Needs an agent" : `With ${name.get(o.pickup_agent_id ?? "") ?? "agent"}`}</p></div>
              <AssignForm orderId={o.id} agents={agents} current={o.pickup_agent_id} />
            </article>
          );
        })}
        {(orders ?? []).length === 0 && <p className="card p-5 text-sm text-ink-soft">Nothing waiting. New paid bookings appear here.</p>}
      </section>
    </div>
  );
}
