import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { InstantRules } from "@/components/admin/InstantRules";
import { naira } from "@/lib/format";

export const metadata = { title: "Speed analytics" };
export const dynamic = "force-dynamic";

type S = { n: number; avg?: number; median?: number; p90?: number; within_pct?: number };
type P = { target_min: number; all: S; instant: S; standard: S; avg_wait_min: number | null; avg_travel_min: number | null; by_day: { day: string; n: number; avg: number; within_pct: number }[]; by_agent: { agent: string; n: number; avg: number; within_pct: number }[]; slowest: { order_id: string; order_no: number; minutes: number; wait_min: number; travel_min: number; agent: string; at: string }[] };
type G = { n: number; avg_items: number; avg_clock_h: number; median_clock_h: number; p90_clock_h: number; avg_total_h: number; avg_to_hub_min: number; avg_wash_min: number; avg_last_leg_min: number; within_target_pct: number; within_promise_pct: number | null; late_n: number | null; fee_kobo: number };
type T = { target_hours: number; groups: { instant?: G; standard?: G }; late: { order_id: string; order_no: number; items: number; hours: number; over_min: number; fee_kobo: number; delivered_at: string }[] };
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);
const dt = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const hm = (h: number | undefined) => (h == null ? "-" : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);

function Stat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return <div className="card p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-mute">{label}</p><p className={`mt-1 text-2xl font-bold ${bad ? "text-red-700" : ""}`}>{value}</p>{sub && <p className="mt-1 text-xs text-ink-soft">{sub}</p>}</div>;
}
function Bar({ pct, target = 80 }: { pct: number; target?: number }) {
  return <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100" aria-hidden><div className={`h-full ${pct >= target ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>;
}

export default async function Speed({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days } = await searchParams;
  const n = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const { supabase, roles } = await requireRole(["admin", "super_admin"]);
  const to = new Date(); const from = new Date(Date.now() - (n - 1) * 86400000);
  const [{ data: pd }, { data: td }, { data: cfgRow }, { data: pk }] = await Promise.all([
    supabase.rpc("pickup_analytics", { _from: ymd(from), _to: ymd(to) }),
    supabase.rpc("turnaround_analytics", { _from: ymd(from), _to: ymd(to) }),
    supabase.from("settings").select("value").eq("key", "instant").maybeSingle(),
    supabase.from("settings").select("value").eq("key", "pickup_target").maybeSingle(),
  ]);
  const p = pd as unknown as P | null; const t = td as unknown as T | null;
  if (!p || !t) return <p className="card p-5 text-sm">Could not load this page. Please refresh.</p>;
  const cfg = (cfgRow?.value ?? {}) as { enabled?: boolean; fee_per_item_kobo?: number; target_hours?: number; large_load_items?: number; large_load_hours?: number };
  const pt = (pk?.value ?? {}) as { minutes?: number };
  const chip = (d: number) => <Link key={d} href={`/staff/speed?days=${d}`} className={`rounded-full border px-3 py-1 text-sm ${n === d ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>Last {d} days</Link>;
  const row = (label: string, s: S) => <tr key={label}><td className="py-2 font-medium">{label}</td><td className="py-2 text-right">{s.n}</td><td className="py-2 text-right">{s.n ? `${s.avg} min` : "-"}</td><td className="py-2 text-right">{s.n ? `${s.median} min` : "-"}</td><td className="py-2 text-right">{s.n ? `${s.p90} min` : "-"}</td><td className="py-2 text-right">{s.n ? `${s.within_pct}%` : "-"}</td></tr>;
  const gi = t.groups.instant; const gs = t.groups.standard;
  const cmp = (label: string, f: (g: G) => string) => <tr key={label}><td className="py-2 text-ink-soft">{label}</td><td className="py-2 text-right font-medium">{gi ? f(gi) : "-"}</td><td className="py-2 text-right">{gs ? f(gs) : "-"}</td></tr>;
  const avgBad = (p.all.avg ?? 0) > p.target_min;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Speed analytics</h1><p className="mt-1 text-sm text-ink-soft">How fast agents reach customers against the {p.target_min} minute target, and how long clothes take to come back, instant versus standard. Pickup time runs from a paid booking (or the customer&apos;s chosen time) to the agent confirming at the door.</p></div>
      <div className="flex gap-2">{[7, 30, 90].map(chip)}</div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pickup: target {p.target_min} minutes</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Average pickup time" value={p.all.n ? `${p.all.avg} min` : "-"} sub={p.all.n ? `Target ${p.target_min} min · ${p.all.n} pickups` : "No pickups in this range"} bad={p.all.n > 0 && avgBad} />
          <Stat label="Within target" value={p.all.n ? `${p.all.within_pct}%` : "-"} sub={p.all.n ? `Slowest 1 in 10 took ${p.all.p90} min` : undefined} bad={p.all.n > 0 && (p.all.within_pct ?? 0) < 50} />
          <Stat label="Waiting for an agent" value={p.avg_wait_min != null ? `${p.avg_wait_min} min` : "-"} sub="Paid booking to agent assigned" />
          <Stat label="Agent travelling" value={p.avg_travel_min != null ? `${p.avg_travel_min} min` : "-"} sub="Assigned to at the door" />
        </div>
        <div className="card overflow-x-auto p-4">
          <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-ink-mute"><th className="py-1">Customers</th><th className="py-1 text-right">Pickups</th><th className="py-1 text-right">Average</th><th className="py-1 text-right">Typical</th><th className="py-1 text-right">Slowest 1 in 10</th><th className="py-1 text-right">Within {p.target_min} min</th></tr></thead>
            <tbody className="divide-y divide-line">{row("Everyone", p.all)}{row("Paid for instant", p.instant)}{row("Standard", p.standard)}</tbody></table>
          <p className="mt-2 text-xs text-ink-mute">Customers choose instant after the pickup, when their bill appears, so pickup speed is not affected by it. The split shows who your fast-service customers are.</p>
        </div>
        {p.by_day.length > 0 && (
          <div className="card overflow-x-auto p-4"><h3 className="font-semibold">By day</h3>
            <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-ink-mute"><th className="py-1">Day</th><th className="py-1 text-right">Pickups</th><th className="py-1 text-right">Average</th><th className="py-1">Within target</th></tr></thead>
              <tbody className="divide-y divide-line">{p.by_day.map((d) => <tr key={d.day}><td className="py-2">{new Date(`${d.day}T12:00:00+01:00`).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}</td><td className="py-2 text-right">{d.n}</td><td className={`py-2 text-right ${d.avg > p.target_min ? "text-red-700" : ""}`}>{d.avg} min</td><td className="py-2"><div className="flex items-center gap-2"><Bar pct={d.within_pct} /><span className="w-10 text-right">{d.within_pct}%</span></div></td></tr>)}</tbody></table>
          </div>
        )}
        {p.by_agent.length > 0 && (
          <div className="card overflow-x-auto p-4"><h3 className="font-semibold">By agent</h3>
            <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-ink-mute"><th className="py-1">Agent</th><th className="py-1 text-right">Pickups</th><th className="py-1 text-right">Average</th><th className="py-1">Within target</th></tr></thead>
              <tbody className="divide-y divide-line">{p.by_agent.map((a) => <tr key={a.agent}><td className="py-2 font-medium">{a.agent}</td><td className="py-2 text-right">{a.n}</td><td className={`py-2 text-right ${a.avg > p.target_min ? "text-red-700" : ""}`}>{a.avg} min</td><td className="py-2"><div className="flex items-center gap-2"><Bar pct={a.within_pct} /><span className="w-10 text-right">{a.within_pct}%</span></div></td></tr>)}</tbody></table>
          </div>
        )}
        {p.slowest.length > 0 && (
          <div className="card overflow-x-auto p-4"><h3 className="font-semibold">Slowest pickups</h3>
            <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-ink-mute"><th className="py-1">Order</th><th className="py-1">Agent</th><th className="py-1 text-right">Total</th><th className="py-1 text-right">Waited for agent</th><th className="py-1 text-right">Travel</th><th className="py-1 text-right">When</th></tr></thead>
              <tbody className="divide-y divide-line">{p.slowest.map((s) => <tr key={s.order_id}><td className="py-2">#{s.order_no}</td><td className="py-2">{s.agent}</td><td className={`py-2 text-right font-medium ${s.minutes > p.target_min ? "text-red-700" : ""}`}>{s.minutes} min</td><td className="py-2 text-right">{s.wait_min} min</td><td className="py-2 text-right">{s.travel_min} min</td><td className="py-2 text-right text-ink-soft">{dt(s.at)}</td></tr>)}</tbody></table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Clothes back to the customer: target {t.target_hours} hours for instant</h2>
        {!gi && !gs ? <p className="card p-5 text-sm text-ink-soft">No delivered orders in this range yet.</p> : (
          <div className="card overflow-x-auto p-4">
            <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-ink-mute"><th className="py-1"></th><th className="py-1 text-right">Instant</th><th className="py-1 text-right">Standard</th></tr></thead>
              <tbody className="divide-y divide-line">
                {cmp("Orders delivered", (g) => String(g.n))}
                {cmp("Average items", (g) => String(g.avg_items))}
                {cmp("Average, from bill paid to delivered", (g) => hm(g.avg_clock_h))}
                {cmp("Typical (median)", (g) => hm(g.median_clock_h))}
                {cmp("Slowest 1 in 10", (g) => hm(g.p90_clock_h))}
                {cmp(`Delivered within ${t.target_hours} hours`, (g) => `${g.within_target_pct}%`)}
                {cmp("Delivered within what the customer was told", (g) => (g.within_promise_pct == null ? "-" : `${g.within_promise_pct}%`))}
                {cmp("Late (past what the customer was told)", (g) => (g.late_n == null ? "-" : String(g.late_n)))}
                {cmp("Agent to hub", (g) => `${g.avg_to_hub_min} min`)}
                {cmp("Washing", (g) => `${g.avg_wash_min} min`)}
                {cmp("Ready to delivered", (g) => `${g.avg_last_leg_min} min`)}
                {cmp("From paid booking to delivered", (g) => hm(g.avg_total_h))}
                {cmp("Instant fees collected", (g) => (g.fee_kobo ? naira(g.fee_kobo) : "-"))}
              </tbody></table>
            <p className="mt-2 text-xs text-ink-mute">The stage rows show where the time goes. If instant is not faster in washing and the last leg, the priority order is not being followed.</p>
          </div>
        )}
        {t.late.length > 0 && (
          <div className="card overflow-x-auto p-4"><h3 className="font-semibold">Instant orders that were late</h3><p className="mt-1 text-sm text-ink-soft">The customer paid extra for speed. Consider refunding the instant fee through Customer problems.</p>
            <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-ink-mute"><th className="py-1">Order</th><th className="py-1 text-right">Items</th><th className="py-1 text-right">Took</th><th className="py-1 text-right">Over by</th><th className="py-1 text-right">Fee paid</th><th className="py-1 text-right">Delivered</th></tr></thead>
              <tbody className="divide-y divide-line">{t.late.map((l) => <tr key={l.order_id}><td className="py-2">#{l.order_no}</td><td className="py-2 text-right">{l.items}</td><td className="py-2 text-right">{l.hours} h</td><td className="py-2 text-right text-red-700">{l.over_min} min</td><td className="py-2 text-right">{naira(l.fee_kobo)}</td><td className="py-2 text-right text-ink-soft">{dt(l.delivered_at)}</td></tr>)}</tbody></table>
          </div>
        )}
      </section>

      {roles.includes("super_admin") && (
        <InstantRules initial={{ enabled: cfg.enabled !== false, feeNaira: (cfg.fee_per_item_kobo ?? 50000) / 100, targetHours: cfg.target_hours ?? 4, largeItems: cfg.large_load_items ?? 30, largeHours: cfg.large_load_hours ?? 8, pickupMinutes: pt.minutes ?? 30 }} />
      )}
    </div>
  );
}
