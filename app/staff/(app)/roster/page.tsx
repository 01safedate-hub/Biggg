import { requireRole } from "@/lib/roles";
import { AddShiftForm, GenerateShifts, RemoveShift, TemplateEditor } from "@/components/ops/RosterTools";

export const metadata = { title: "Shift roster" };
export const dynamic = "force-dynamic";

type Cell = { date: string; hour: number; agents: number; needed: number; expected_orders: number };
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso + "T00:00:00Z"));
const hm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function Roster() {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const today = ymd(new Date());
  const [{ data: ag }, { data: plan }, { data: tpls }, { data: shifts }] = await Promise.all([
    supabase.rpc("list_agents"),
    supabase.rpc("coverage_plan", { _from: today, _days: 7 }),
    supabase.from("shift_templates").select("staff_id,weekday,starts_at,ends_at,active"),
    supabase.from("shifts").select("id,staff_id,shift_date,starts_at,ends_at").gte("ends_at", new Date().toISOString()).lte("starts_at", new Date(Date.now() + 14 * 86400000).toISOString()).order("starts_at"),
  ]);
  const agents = (Array.isArray(ag) ? ag : []) as unknown as { id: string; name: string }[];
  const name = new Map(agents.map((a) => [a.id, a.name]));
  const cells = (Array.isArray(plan) ? plan : []) as unknown as Cell[];
  const hours = Array.from(new Set(cells.map((c) => c.hour))).sort((a, b) => a - b);
  const dates = Array.from(new Set(cells.map((c) => c.date)));
  const by = new Map(cells.map((c) => [`${c.date}-${c.hour}`, c]));
  const gaps = cells.filter((c) => c.agents < c.needed).length;
  const empty = cells.filter((c) => c.agents === 0).length;
  const ids = (shifts ?? []).map((s) => s.id);
  const { data: att } = ids.length ? await supabase.from("attendance").select("shift_id").in("shift_id", ids) : { data: [] };
  const started = new Set((att ?? []).map((a) => a.shift_id));
  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-bold tracking-tight">Shift roster</h1><p className="mt-1 text-sm text-ink-soft">Agents can only check in during a shift, and automatic dispatch only sends jobs to agents who have checked in. Set each agent's weekly pattern, then create the shifts.</p></div>

      <section className="space-y-3" aria-label="Coverage for the next 7 days">
        <div><h2 className="text-lg font-semibold">Coverage, next 7 days</h2>
          <p className={`text-sm ${empty ? "text-red-700" : gaps ? "text-amber-800" : "text-emerald-700"}`}>{empty ? `${empty} opening hour${empty === 1 ? "" : "s"} with nobody on shift.` : gaps ? `${gaps} hour${gaps === 1 ? "" : "s"} with fewer agents than we usually need.` : "Every opening hour is covered."}</p>
          <p className="text-xs text-ink-mute">Each cell shows agents scheduled / agents we usually need. “Usually need” comes from how many pickups were booked at that weekday and hour over the last 8 weeks.</p></div>
        <div className="card overflow-x-auto p-3">
          <table className="w-full min-w-[560px] text-center text-xs">
            <thead><tr><th scope="col" className="p-1 text-left">Day</th>{hours.map((h) => <th key={h} scope="col" className="p-1 font-medium text-ink-soft">{String(h).padStart(2, "0")}:00</th>)}</tr></thead>
            <tbody>{dates.map((d) => (
              <tr key={d}><th scope="row" className="whitespace-nowrap p-1 text-left font-medium">{dayLabel(d)}</th>
                {hours.map((h) => { const c = by.get(`${d}-${h}`); if (!c) return <td key={h} />;
                  const cls = c.agents === 0 ? "bg-red-100 text-red-900" : c.agents < c.needed ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900";
                  return <td key={h} className="p-0.5"><div className={`rounded px-1 py-1.5 font-medium tabular-nums ${cls}`} title={`${c.expected_orders} pickups usually booked this hour`}>{c.agents}/{c.needed}</div></td>; })}
              </tr>))}</tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3"><h2 className="text-lg font-semibold">Weekly patterns</h2>
        {agents.map((a) => <TemplateEditor key={a.id} staffId={a.id} name={a.name} templates={(tpls ?? []).filter((t) => t.staff_id === a.id).map((t) => ({ weekday: t.weekday, starts_at: t.starts_at, ends_at: t.ends_at, active: t.active }))} />)}
        {agents.length === 0 && <p className="card p-5 text-sm text-ink-soft">No delivery agents yet.</p>}
        <GenerateShifts />
      </section>

      <AddShiftForm agents={agents.map((a) => ({ id: a.id, name: a.name }))} />

      <section className="space-y-2"><h2 className="text-lg font-semibold">Coming shifts</h2>
        <div className="card divide-y divide-line">
          {(shifts ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><strong>{name.get(s.staff_id) ?? "Staff"}</strong> · {dayLabel(s.shift_date)} · {hm(s.starts_at)} to {hm(s.ends_at)}</span>
              {started.has(s.id) ? <span className="text-xs text-emerald-700">Checked in</span> : new Date(s.starts_at).getTime() > Date.now() ? <RemoveShift id={s.id} /> : <span className="text-xs text-ink-mute">Running</span>}</div>
          ))}
          {(shifts ?? []).length === 0 && <p className="p-4 text-sm text-ink-soft">No shifts yet. Save a weekly pattern, then create shifts.</p>}
        </div>
      </section>
    </div>
  );
}
