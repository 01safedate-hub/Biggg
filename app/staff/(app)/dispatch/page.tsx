import { TimeLeft } from "@/components/ops/TimeLeft";
import { requireRole } from "@/lib/roles";
import { AssignForm, CancelPaidForm, RedispatchButton } from "@/components/ops/DeskTools";
import { LogContactForm } from "@/components/ops/DeskFollowUps";
import { mapsLink } from "@/lib/orders";
import { naira } from "@/lib/format";

export const metadata = { title: "Dispatch" };

export default async function DispatchPage() {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const [{ data: orders }, { data: ag }, { data: back }, { data: cb }] = await Promise.all([
    supabase.from("orders").select("id,order_no,status,pickup_address,pickup_lat,pickup_lng,pickup_agent_id,scheduled_for,customer_id,created_at,pickup_fare_kobo,updated_at").in("status", ["awaiting_dispatch", "agent_assigned"]).order("created_at"),
    supabase.rpc("list_agents"),
    supabase.from("orders").select("id,order_no,status,pickup_address,pickup_lat,pickup_lng,delivery_agent_id,customer_id,updated_at,instant,instant_target_at,instant_promise_at").in("status", ["out_for_delivery", "failed_delivery"]).order("instant", { ascending: false }).order("instant_target_at", { ascending: true, nullsFirst: false }).order("updated_at"),
    supabase.rpc("callbacks_queue"),
  ]);
  type CB = { order_id: string; order_no: number; kind: "pickup" | "delivery"; customer: string; phone: string | null; address: string | null; failed_at: string; needs_call: boolean; held_until: string | null; attempts: number; last: { outcome: string; note: string; at: string } | null };
  const callbacks = (Array.isArray(cb) ? cb : []) as unknown as CB[];
  const mustCall = new Set(callbacks.filter((c) => c.needs_call).map((c) => c.order_id));
  const OUTCOME: Record<string, string> = { reached: "Spoke to customer", rescheduled: "New time agreed", no_answer: "No answer", wrong_number: "Wrong number" };
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
      <section className="space-y-3" aria-label="Calls to make">
        <div><h2 className="text-xl font-bold tracking-tight">Calls to make <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium text-ink-soft">{callbacks.length}</span></h2><p className="text-sm text-ink-soft">A pickup or delivery that failed. Call the customer and log it. Nothing goes out again, by hand or automatically, until you have spoken to them or agreed a new time.</p></div>
        {callbacks.map((c) => (
          <article key={c.order_id} className={`card space-y-2 p-4 ${c.needs_call ? "border-l-4 border-l-red-500" : ""}`}>
            <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">Order #{c.order_no} · {c.customer} <span className="ml-1 rounded-full bg-brand-tint px-2 py-0.5 text-xs text-brand-dark">{c.kind === "pickup" ? "Failed pickup" : "Failed delivery"}</span></p>
              <p className="text-sm text-ink-soft">{c.address} {c.phone && <a className="font-medium text-brand-dark underline" href={`tel:${c.phone}`}>{c.phone}</a>}</p></div>
              <p className="text-xs text-ink-soft">{c.attempts} call{c.attempts === 1 ? "" : "s"} so far</p></div>
            {c.last && <p className="text-xs text-ink-soft">Last call: {OUTCOME[c.last.outcome] ?? c.last.outcome}. {c.last.note}</p>}
            {c.held_until && <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-900">New time agreed: {new Date(c.held_until).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}. Automatic dispatch waits until then.</p>}
            {c.needs_call ? <LogContactForm orderId={c.order_id} /> : <p className="text-xs text-emerald-800">Customer reached. You can send this out again below.</p>}
          </article>
        ))}
        {callbacks.length === 0 && <p className="card p-5 text-sm text-ink-soft">No calls waiting.</p>}
      </section>
      <section className="space-y-3">
        {(orders ?? []).map((o) => {
          const c = who.get(o.customer_id); const map = mapsLink(o.pickup_lat, o.pickup_lng);
          return (
            <article key={o.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">Order #{o.order_no} · {c?.full_name}</p>{o.scheduled_for && o.status === "awaiting_dispatch" && new Date(o.scheduled_for).getTime() > Date.now() && <p className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-900">Customer chose {new Date(o.scheduled_for).toLocaleString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>}<p className="text-sm text-ink-soft">{o.pickup_address} {map && <a className="underline" target="_blank" rel="noopener noreferrer" href={map}>map</a>}</p></div>
                <div className="text-right"><p className="text-xs font-semibold text-brand-dark">{o.status === "awaiting_dispatch" ? "Needs an agent" : `With ${name.get(o.pickup_agent_id ?? "") ?? "agent"}`}</p><p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${late(o.updated_at, o.status === "awaiting_dispatch" ? 15 : 60) ? "bg-red-100 text-red-800" : "bg-slate-100 text-ink-soft"}`}>Waiting {waited(o.updated_at)}</p></div></div>
              {mustCall.has(o.id) ? <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-950">Call the customer first (see Calls to make above).</p> : <AssignForm orderId={o.id} agents={agents} current={o.pickup_agent_id} />}
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
              <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">Order #{o.order_no} · {c?.full_name} {o.instant && o.instant_target_at && <TimeLeft targetAt={o.instant_target_at} promiseAt={o.instant_promise_at} />}</p><p className="text-sm text-ink-soft">{o.pickup_address} {map && <a className="underline" target="_blank" rel="noopener noreferrer" href={map}>map</a>} {c?.phone && <a className="underline" href={`tel:${c.phone}`}>{c.phone}</a>}</p></div>
                <div className="text-right"><p className={`text-xs font-semibold ${o.status === "failed_delivery" ? "text-red-700" : "text-brand-dark"}`}>{o.status === "failed_delivery" ? "Delivery failed" : o.delivery_agent_id ? `With ${name.get(o.delivery_agent_id) ?? "agent"}` : "Needs an agent"}</p><p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${o.status !== "failed_delivery" && late(o.updated_at, o.delivery_agent_id ? 90 : 20) ? "bg-red-100 text-red-800" : "bg-slate-100 text-ink-soft"}`}>Waiting {waited(o.updated_at)}</p></div></div>
              {o.status === "failed_delivery" && (() => { const d = dcase.get(o.id); return d ? <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-950">Storage fee: {d.status === "accruing" ? `running, ${naira(d.accrued_kobo)} so far` : d.status === "paid" ? "paid" : d.status === "waived" ? "waived" : `free until ${new Date(d.grace_ends_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}`}. The customer pays it on their order page.</p> : null; })()}
              {o.status === "failed_delivery" ? mustCall.has(o.id) ? <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-950">Call the customer first (see Calls to make above).</p> : <RedispatchButton orderId={o.id} /> : <AssignForm orderId={o.id} agents={agents} current={o.delivery_agent_id} kind="delivery" />}
            </article>
          );
        })}
        {(back ?? []).length === 0 && <p className="card p-5 text-sm text-ink-soft">No deliveries waiting.</p>}
      </section>
    </div>
  );
}
