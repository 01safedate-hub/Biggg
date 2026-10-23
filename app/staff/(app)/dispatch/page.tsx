import { requireRole } from "@/lib/roles";
import { AssignForm, CancelPaidForm, RedispatchButton } from "@/components/ops/DeskTools";
import { mapsLink } from "@/lib/orders";
import { naira } from "@/lib/format";

export const metadata = { title: "Dispatch" };

export default async function DispatchPage() {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const [{ data: orders }, { data: ag }, { data: back }] = await Promise.all([
    supabase.from("orders").select("id,order_no,status,pickup_address,pickup_lat,pickup_lng,pickup_agent_id,scheduled_for,customer_id,created_at,pickup_fare_kobo,updated_at").in("status", ["awaiting_dispatch", "agent_assigned"]).order("created_at"),
    supabase.rpc("list_agents"),
    supabase.from("orders").select("id,order_no,status,pickup_address,pickup_lat,pickup_lng,delivery_agent_id,customer_id,updated_at").in("status", ["out_for_delivery", "failed_delivery"]).order("updated_at"),
  ]);
  const agents = (Array.isArray(ag) ? ag : []) as unknown as { id: string; name: string; open_jobs: number; on_shift?: boolean }[];
  const ids = Array.from(new Set([...(orders ?? []), ...(back ?? [])].map((o) => o.customer_id)));
  const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name,phone").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p]));
  const name = new Map(agents.map((a) => [a.id, a.name]));
  const failedIds = (back ?? []).filter((o) => o.status === "failed_delivery").map((o) => o.id);
  const { data: cases } = failedIds.length ? await supabase.from("demurrage_cases").select("order_id,status,grace_ends_at,accrued_kobo").in("order_id", failedIds) : { data: [] };
  const dcase = new Map((cases ?? []).map((c) => [c.order_id, c]));
  const waited = (iso: string | null) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso ?? Date.now()).getTime()) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`; };
  const late = (iso: string | null, mins: number) => (Date.now() - new Date(iso ?? Date.now()).getTime()) / 60000 > mins;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-sm" aria-label="Summary">
        {[[ "Pickups need an agent", (orders ?? []).filter((o) => o.status === "awaiting_dispatch").length ], [ "Pickups on the way", (orders ?? []).filter((o) => o.status === "agent_assigned").length ], [ "Deliveries need an agent", (back ?? []).filter((o) => o.status === "out_for_delivery" && !o.delivery_agent_id).length ], [ "Failed deliveries", (back ?? []).filter((o) => o.status === "failed_delivery").length ]].map(([l, n]) => <span key={String(l)} className={`rounded-full border px-3 py-1 ${Number(n) > 0 && (String(l).includes("need") || String(l).includes("Failed")) ? "border-brand bg-brand-tint text-brand-dark" : "border-line text-ink-soft"}`}><strong>{n}</strong> {l}</span>)}
      </div>
      <div><h1 className="text-2xl font-bold tracking-tight">Dispatch</h1><p className="mt-1 text-sm text-ink-soft">Paid pickups waiting for an agent, and those on the way. You can change the agent until they reach the customer.</p></div>
      <section className="space-y-3">
        {(orders ?? []).map((o) => {
          const c = who.get(o.customer_id); const map = mapsLink(o.pickup_lat, o.pickup_lng);
          return (
            <article key={o.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">Order #{o.order_no} · {c?.full_name}</p><p className="text-sm text-ink-soft">{o.pickup_address} {map && <a className="underline" target="_blank" rel="noopener noreferrer" href={map}>map</a>}</p></div>
                <div className="text-right"><p className="text-xs font-semibold text-brand-dark">{o.status === "awaiting_dispatch" ? "Needs an agent" : `With ${name.get(o.pickup_agent_id ?? "") ?? "agent"}`}</p><p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${late(o.updated_at, o.status === "awaiting_dispatch" ? 15 : 60) ? "bg-red-100 text-red-800" : "bg-slate-100 text-ink-soft"}`}>Waiting {waited(o.updated_at)}</p></div></div>
              <AssignForm orderId={o.id} agents={agents} current={o.pickup_agent_id} />
              <CancelPaidForm orderId={o.id} fareKobo={o.pickup_fare_kobo} />
            </article>
          );
        })}
        {(orders ?? []).length === 0 && <p className="card p-5 text-sm text-ink-soft">Nothing waiting. New paid bookings appear here.</p>}
      </section>
      <div><h2 className="text-xl font-bold tracking-tight">Deliveries</h2><p className="mt-1 text-sm text-ink-soft">Clean clothes going back to customers. The customer has paid the delivery fare before they appear here.</p></div>
      <section className="space-y-3">
        {(back ?? []).map((o) => {
          const c = who.get(o.customer_id); const map = mapsLink(o.pickup_lat, o.pickup_lng);
          return (
            <article key={o.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">Order #{o.order_no} · {c?.full_name}</p><p className="text-sm text-ink-soft">{o.pickup_address} {map && <a className="underline" target="_blank" rel="noopener noreferrer" href={map}>map</a>} {c?.phone && <a className="underline" href={`tel:${c.phone}`}>{c.phone}</a>}</p></div>
                <div className="text-right"><p className={`text-xs font-semibold ${o.status === "failed_delivery" ? "text-red-700" : "text-brand-dark"}`}>{o.status === "failed_delivery" ? "Delivery failed" : o.delivery_agent_id ? `With ${name.get(o.delivery_agent_id) ?? "agent"}` : "Needs an agent"}</p><p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${o.status !== "failed_delivery" && late(o.updated_at, o.delivery_agent_id ? 90 : 20) ? "bg-red-100 text-red-800" : "bg-slate-100 text-ink-soft"}`}>Waiting {waited(o.updated_at)}</p></div></div>
              {o.status === "failed_delivery" && (() => { const d = dcase.get(o.id); return d ? <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-950">Storage fee: {d.status === "accruing" ? `running, ${naira(d.accrued_kobo)} so far` : d.status === "paid" ? "paid" : d.status === "waived" ? "waived" : `free until ${new Date(d.grace_ends_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}`}. The customer pays it on their order page.</p> : null; })()}
              {o.status === "failed_delivery" ? <RedispatchButton orderId={o.id} /> : <AssignForm orderId={o.id} agents={agents} current={o.delivery_agent_id} kind="delivery" />}
            </article>
          );
        })}
        {(back ?? []).length === 0 && <p className="card p-5 text-sm text-ink-soft">No deliveries waiting.</p>}
      </section>
    </div>
  );
}
