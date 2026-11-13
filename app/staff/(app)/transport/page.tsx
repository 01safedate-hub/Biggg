import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { TransportRuleForm, EndRuleButton } from "@/components/transport/TransportRules";

export const metadata = { title: "Free transport" };
export const dynamic = "force-dynamic";

type Rule = {
  id: string; label: string; service: string; scope: string; legs: string; zone: string | null; plan: string | null; customer: string | null; customer_phone: string | null;
  starts_at: string; ends_at: string | null; public_message: string | null; live: boolean; active: boolean; ended_at: string | null; created_by: string | null; orders: number; waived_kobo: number;
};

const when = (d: string | null) => d ? new Date(d).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }) : "No end date";
const LEGS: Record<string, string> = { both: "Pickup and delivery", pickup: "Pickup only", delivery: "Delivery only" };

export default async function TransportPage() {
  const { supabase } = await requireRole(["admin", "super_admin"]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const monthStart = today.slice(0, 8) + "01";
  const [{ data: rules }, { data: zones }, { data: plans }, { data: report }] = await Promise.all([
    supabase.rpc("transport_waivers_list" as never),
    supabase.from("zones").select("id,name").eq("is_live", true).order("name"),
    supabase.from("plans").select("id,name").eq("active", true).order("sort_order"),
    supabase.rpc("transport_waived_report" as never, { _from: monthStart, _to: today } as never),
  ]);
  const list = (rules ?? []) as unknown as Rule[];
  const rep = (report ?? {}) as { waived_kobo?: number; orders?: number; collected_kobo?: number };
  const live = list.filter((r) => r.live);
  const scheduled = list.filter((r) => r.active && !r.live && new Date(r.starts_at) > new Date());
  const past = list.filter((r) => !r.live && !(r.active && new Date(r.starts_at) > new Date()));
  const target = (r: Rule) => r.scope === "all" ? "Everyone" : r.scope === "zone" ? `Zone: ${r.zone}` : r.scope === "plan" ? `Plan: ${r.plan}` : `Customer: ${r.customer ?? ""}${r.customer_phone ? ` (${r.customer_phone})` : ""}`;
  const card = (r: Rule, canEnd: boolean) => (
    <li key={r.id} className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{r.label} <span className="ml-1 rounded bg-canvas px-2 py-0.5 text-xs font-medium text-ink-soft">{r.service === "cleaning" ? "Cleaning" : "Laundry"}</span></p>
          <p className="mt-1 text-sm text-ink-soft">{target(r)} · {LEGS[r.legs]}</p>
          <p className="text-sm text-ink-soft">{when(r.starts_at)} → {r.ended_at ? `ended ${when(r.ended_at)}` : when(r.ends_at)}</p>
          {r.public_message && <p className="mt-1 text-sm">Shown to customers: “{r.public_message}”</p>}
          <p className="mt-1 text-xs text-ink-mute">{r.orders} orders · {naira(r.waived_kobo)} waived{r.created_by ? ` · set by ${r.created_by}` : ""}</p>
        </div>
        {canEnd && <EndRuleButton id={r.id} />}
      </div>
    </li>
  );
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Free transport</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">Make pickup and delivery free for everyone, one zone, one plan or one customer. A rule only affects new bookings; orders already booked keep the price they were booked at. Delivery agents are still paid for every trip.</p>
      </header>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="This month">
        <div className="card p-4"><p className="text-sm text-ink-soft">Transport waived this month</p><p className="mt-1 text-2xl font-bold">{naira(rep.waived_kobo ?? 0)}</p></div>
        <div className="card p-4"><p className="text-sm text-ink-soft">Orders with free transport</p><p className="mt-1 text-2xl font-bold">{rep.orders ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-ink-soft">Transport fares collected</p><p className="mt-1 text-2xl font-bold">{naira(rep.collected_kobo ?? 0)}</p></div>
      </section>
      <section aria-labelledby="live-h">
        <h2 id="live-h" className="text-lg font-semibold">Live now ({live.length})</h2>
        {live.length === 0 ? <p className="mt-2 text-sm text-ink-soft">No rule is live. Every booking pays the normal fare.</p> : <ul className="mt-3 space-y-3">{live.map((r) => card(r, true))}</ul>}
      </section>
      {scheduled.length > 0 && <section aria-labelledby="sched-h"><h2 id="sched-h" className="text-lg font-semibold">Starting later</h2><ul className="mt-3 space-y-3">{scheduled.map((r) => card(r, true))}</ul></section>}
      <section aria-labelledby="new-h" className="card p-5">
        <h2 id="new-h" className="text-lg font-semibold">New rule</h2>
        <TransportRuleForm zones={(zones ?? []).map((z) => ({ id: z.id, name: z.name }))} plans={(plans ?? []).map((p) => ({ id: p.id, name: p.name }))} />
      </section>
      {past.length > 0 && <section aria-labelledby="past-h"><h2 id="past-h" className="text-lg font-semibold">Ended</h2><ul className="mt-3 space-y-3">{past.slice(0, 30).map((r) => card(r, false))}</ul></section>}
    </div>
  );
}
