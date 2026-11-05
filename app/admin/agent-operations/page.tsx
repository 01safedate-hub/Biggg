import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { clearAgentFraudFlag, recordAgentIncident, recordAgentStrike, resolveAgentIncident } from "./actions";

export const metadata = { title: "Agent custody and discipline" };
export const dynamic = "force-dynamic";

type Custody = {
  order_id: string; pickup_agent_id: string | null; delivery_agent_id: string | null;
  picked_up_at: string | null; hub_in_at: string | null; hub_out_at: string | null;
  delivered_at: string | null; late_alert_at: string | null;
};
type Strike = { id: string; agent_id: string; order_id: string | null; kind: string; note: string; strike_number: number; created_at: string };
type FraudFlag = { id: string; agent_id: string; flag_type: string; flag_day: string; detail: string; status: string; created_at: string };
type Incident = {
  id: string; order_id: string; agent_id: string; custody_leg: string; kind: string;
  description: string; estimated_value_kobo: number | null; investigation_status: string;
  decision_note: string | null; created_at: string;
};
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(value)) : "—";
const label = (v: string) => v.replaceAll("_", " ");

export default async function AgentOperationsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { notice, error } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  const db = supabase as any;
  const [{ data: custodyRows }, { data: strikeRows }, { data: incidentRows }, { data: flagRows }, { data: roleRows }] = await Promise.all([
    db.from("agent_bag_custody").select("*").order("updated_at", { ascending: false }).limit(100),
    db.from("agent_strikes").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("agent_custody_incidents").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("agent_fraud_flags").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("user_roles").select("user_id,role").in("role", ["delivery_agent", "commission_agent"]),
  ]);
  const ids = Array.from(new Set([
    ...(roleRows ?? []).map((x) => x.user_id),
    ...(custodyRows ?? []).flatMap((x: Custody) => [x.pickup_agent_id, x.delivery_agent_id].filter(Boolean)),
    ...(strikeRows ?? []).map((x: Strike) => x.agent_id),
    ...(incidentRows ?? []).map((x: Incident) => x.agent_id),
    ...(flagRows ?? []).map((x: FraudFlag) => x.agent_id),
  ] as string[]));
  const [{ data: profiles }, { data: orders }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id,full_name").in("id", ids) : Promise.resolve({ data: [] }),
    supabase.from("orders").select("id,order_no").limit(1000),
  ]);
  const names = new Map((profiles ?? []).map((x) => [x.id, x.full_name || x.id.slice(0, 8)]));
  const orderNos = new Map((orders ?? []).map((x) => [x.id, x.order_no]));
  const agents = roleRows ?? [];
  const custody = (custodyRows ?? []) as Custody[];
  const strikes = (strikeRows ?? []) as Strike[];
  const incidents = (incidentRows ?? []) as Incident[];
  const flags = (flagRows ?? []) as FraudFlag[];
  const late = custody.filter((x) => x.late_alert_at && !x.hub_in_at);

  return <div className="space-y-6">
    {notice && <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    <header>
      <h1 className="text-2xl font-bold tracking-tight">Agent custody and discipline</h1>
      <p className="mt-1 text-sm text-ink-soft">Track bag handovers, three-hour hub alerts, process strikes and loss/damage investigations.</p>
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      <div className="card p-4"><p className="text-sm text-ink-soft">Custody records</p><p className="mt-1 text-2xl font-bold">{custody.length}</p></div>
      <div className="card p-4"><p className="text-sm text-ink-soft">Overdue hub drop-offs</p><p className="mt-1 text-2xl font-bold">{late.length}</p></div>
      <div className="card p-4"><p className="text-sm text-ink-soft">Open investigations</p><p className="mt-1 text-2xl font-bold">{incidents.filter((x) => x.investigation_status === "open").length}</p></div>
    </section>

    <section className="card overflow-hidden">
      <div className="border-b border-line p-4"><h2 className="font-semibold">Bag custody timeline</h2><p className="mt-1 text-sm text-ink-soft">Pickup agent keeps custody until hub check-in; delivery agent keeps custody from hub sign-out until customer delivery confirmation.</p></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b border-line text-ink-soft"><th className="p-3">Order</th><th className="p-3">Pickup agent</th><th className="p-3">Picked up</th><th className="p-3">Hub in</th><th className="p-3">Delivery agent</th><th className="p-3">Hub out</th><th className="p-3">Delivered</th><th className="p-3">Alert</th></tr></thead>
        <tbody>{custody.map((x) => <tr key={x.order_id} className="border-b border-line">
          <td className="p-3">#{orderNos.get(x.order_id) ?? x.order_id.slice(0,8)}</td>
          <td className="p-3">{names.get(x.pickup_agent_id ?? "") ?? "—"}</td><td className="p-3">{date(x.picked_up_at)}</td><td className="p-3">{date(x.hub_in_at)}</td>
          <td className="p-3">{names.get(x.delivery_agent_id ?? "") ?? "—"}</td><td className="p-3">{date(x.hub_out_at)}</td><td className="p-3">{date(x.delivered_at)}</td>
          <td className="p-3">{x.late_alert_at ? <span className="font-semibold text-red-700">Late · {date(x.late_alert_at)}</span> : x.picked_up_at && !x.hub_in_at ? "Awaiting hub" : "—"}</td>
        </tr>)}{!custody.length && <tr><td colSpan={8} className="p-4 text-ink-soft">No bag custody records yet. They are created automatically as orders move through the handover stages.</td></tr>}</tbody>
      </table></div>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h2 className="font-semibold">Record a process strike</h2>
        <p className="mt-1 text-sm text-ink-soft">1st: warning · 2nd: commission hold for 14 days · 3rd: agent access deactivated.</p>
        <form action={recordAgentStrike} className="mt-4 space-y-3">
          <label className="block text-sm">Agent<select name="agent_id" required className="mt-1 w-full rounded border border-line p-2">{agents.map((a) => <option key={a.user_id} value={a.user_id}>{names.get(a.user_id) ?? a.user_id} · {label(a.role)}</option>)}</select></label>
          <label className="block text-sm">Related order (optional)<select name="order_id" className="mt-1 w-full rounded border border-line p-2"><option value="">No order selected</option>{(orders ?? []).map((o) => <option key={o.id} value={o.id}>#{o.order_no}</option>)}</select></label>
          <label className="block text-sm">Strike type<select name="kind" required className="mt-1 w-full rounded border border-line p-2"><option value="count_skipped">Skipped clothing count</option><option value="cash_taken">Took cash from customer</option><option value="late_drop">Late hub drop-off</option></select></label>
          <label className="block text-sm">Reason<textarea name="note" minLength={3} maxLength={1000} required className="mt-1 w-full rounded border border-line p-2" rows={3}/></label>
          <button className="rounded bg-brand px-4 py-2 font-semibold text-white">Record strike</button>
        </form>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold">Record lost or damaged clothes</h2>
        <p className="mt-1 text-sm text-ink-soft">This opens an investigation. No commission deduction is made until the owner confirms the deduction policy.</p>
        <form action={recordAgentIncident} className="mt-4 space-y-3">
          <label className="block text-sm">Order<select name="order_id" required className="mt-1 w-full rounded border border-line p-2">{custody.map((x) => <option key={x.order_id} value={x.order_id}>#{orderNos.get(x.order_id) ?? x.order_id.slice(0,8)}</option>)}</select></label>
          <label className="block text-sm">Agent<select name="agent_id" required className="mt-1 w-full rounded border border-line p-2">{agents.map((a) => <option key={a.user_id} value={a.user_id}>{names.get(a.user_id) ?? a.user_id} · {label(a.role)}</option>)}</select></label>
          <label className="block text-sm">Custody stage<select name="custody_leg" className="mt-1 w-full rounded border border-line p-2"><option value="pickup">Pickup to hub</option><option value="delivery">Hub to customer</option></select></label>
          <label className="block text-sm">Incident<select name="kind" className="mt-1 w-full rounded border border-line p-2"><option value="lost">Lost item</option><option value="damaged">Damaged item</option></select></label>
          <label className="block text-sm">Estimated item value in naira (optional)<input type="number" name="estimated_value_naira" min="0" step="0.01" className="mt-1 w-full rounded border border-line p-2"/></label>
          <label className="block text-sm">Description<textarea name="description" minLength={3} maxLength={2000} required className="mt-1 w-full rounded border border-line p-2" rows={3}/></label>
          <button className="rounded bg-brand px-4 py-2 font-semibold text-white">Open investigation</button>
        </form>
      </div>
    </section>

    <section className="card overflow-hidden">
      <div className="border-b border-line p-4"><h2 className="font-semibold">Fraud flags and commission holds</h2><p className="mt-1 text-sm text-ink-soft">More than 10 customer invitations in one Lagos day creates a review flag and blocks commission approval and payout until an administrator clears or dismisses it.</p></div>
      <div className="divide-y divide-line">{flags.map((x) => <div key={x.id} className="space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{names.get(x.agent_id) ?? x.agent_id} · {label(x.flag_type)} · {x.flag_day}</p><span className="rounded-full bg-amber-100 px-2 py-1 text-xs">{label(x.status)}</span></div>
        <p>{x.detail}</p>
        {x.status === "open" && <form action={clearAgentFraudFlag} className="flex flex-wrap items-end gap-2"><input type="hidden" name="flag_id" value={x.id}/><label className="min-w-48 flex-1 text-xs">Review note<input name="resolution_note" minLength={3} required className="mt-1 w-full rounded border border-line p-2"/></label><button name="decision" value="cleared" className="rounded bg-emerald-700 px-3 py-2 text-white">Clear flag</button><button name="decision" value="dismissed" className="rounded border border-line px-3 py-2">Dismiss flag</button></form>}
      </div>)}{!flags.length && <p className="p-4 text-sm text-ink-soft">No fraud flags recorded.</p>}</div>
    </section>

    <section className="card overflow-hidden">
      <div className="border-b border-line p-4"><h2 className="font-semibold">Strike history</h2></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-ink-soft"><th className="p-3">Agent</th><th className="p-3">Strike</th><th className="p-3">Type</th><th className="p-3">Order</th><th className="p-3">Reason</th><th className="p-3">Date</th></tr></thead>
        <tbody>{strikes.map((x) => <tr key={x.id} className="border-b border-line"><td className="p-3">{names.get(x.agent_id) ?? x.agent_id}</td><td className="p-3">{x.strike_number} of 3</td><td className="p-3">{label(x.kind)}</td><td className="p-3">{x.order_id ? `#${orderNos.get(x.order_id) ?? x.order_id.slice(0,8)}` : "—"}</td><td className="p-3">{x.note}</td><td className="p-3">{date(x.created_at)}</td></tr>)}{!strikes.length && <tr><td colSpan={6} className="p-4 text-ink-soft">No strikes recorded.</td></tr>}</tbody></table></div>
    </section>

    <section className="card overflow-hidden">
      <div className="border-b border-line p-4"><h2 className="font-semibold">Loss and damage investigations</h2></div>
      <div className="divide-y divide-line">{incidents.map((x) => <div key={x.id} className="space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Order #{orderNos.get(x.order_id) ?? x.order_id.slice(0,8)} · {label(x.kind)} · {label(x.custody_leg)} custody</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs capitalize">{label(x.investigation_status)}</span></div>
        <p>{names.get(x.agent_id) ?? x.agent_id} · {x.description}</p>
        <p className="text-ink-soft">Estimated value: {x.estimated_value_kobo == null ? "Not supplied" : naira(Number(x.estimated_value_kobo))} · Reported {date(x.created_at)}</p>
        {x.investigation_status === "open" && <form action={resolveAgentIncident} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="incident_id" value={x.id}/>
          <label className="min-w-48 flex-1 text-xs">Investigation note<input name="decision_note" minLength={3} required className="mt-1 w-full rounded border border-line p-2"/></label>
          <button name="decision" value="liable" className="rounded bg-amber-700 px-3 py-2 text-white">Agent at fault</button>
          <button name="decision" value="not_liable" className="rounded border border-line px-3 py-2">Not at fault</button>
        </form>}
        {x.decision_note && <p className="text-ink-soft">Decision: {x.decision_note}</p>}
      </div>)}{!incidents.length && <p className="p-4 text-sm text-ink-soft">No incidents reported.</p>}</div>
    </section>
  </div>;
}
