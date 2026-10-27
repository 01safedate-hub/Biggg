import { requireRole } from "@/lib/roles";
import { ShiftCheckIn } from "@/components/staff/ShiftCheckIn";

export const metadata = { title: "My shifts" };
export const dynamic = "force-dynamic";

const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T12:00:00+01:00"));
const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function MyShiftsPage() {
  const { supabase, roles } = await requireRole(["super_admin", "admin", "secretary", "cashier", "delivery_agent"]);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const canCheckIn = roles.includes("delivery_agent");
  const now = new Date();
  const { data: shifts, error } = await supabase.from("shifts").select("id,shift_date,starts_at,ends_at").eq("staff_id", auth.user.id).gte("shift_date", new Date(now.getTime() - 86400000).toISOString().slice(0,10)).lte("shift_date", new Date(now.getTime() + 35*86400000).toISOString().slice(0,10)).order("starts_at");
  const ids = (shifts ?? []).map(s => s.id);
  const { data: attendance } = ids.length ? await supabase.from("attendance").select("shift_id,checked_in_at,status,minutes_late").in("shift_id", ids) : { data: [] };
  const byShift = new Map((attendance ?? []).map(a => [a.shift_id, a]));
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">My shifts</h1><p className="mt-1 text-sm text-ink-soft">Your upcoming shifts and attendance. Staff GPS check-in requires being within 150 metres of your assigned station.</p></div>
    {error && <p role="alert" className="text-sm text-red-700">Could not load your shifts. Please refresh.</p>}
    <section className="card divide-y divide-line">
      {(shifts ?? []).map(s => { const a = byShift.get(s.id); const started = new Date(s.starts_at).getTime() <= Date.now(); const finished = new Date(s.ends_at).getTime() <= Date.now(); return <article key={s.id} className="space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{dateLabel(s.shift_date)}</p><p className="text-sm text-ink-soft">{timeLabel(s.starts_at)} – {timeLabel(s.ends_at)}</p></div><span className="rounded border border-line px-2 py-1 text-xs">{a ? (a.status === "absent" ? "Absent" : a.status === "late" ? "Checked in late" : "Checked in") : finished ? "No check-in recorded" : "Scheduled"}</span></div>
        {a && <p className="text-xs text-ink-soft">{a.checked_in_at ? `Checked in at ${timeLabel(a.checked_in_at)}${a.minutes_late ? ` · ${a.minutes_late} minutes late` : ""}` : "Attendance recorded automatically."}</p>}
        {canCheckIn && !a && started && !finished && <ShiftCheckIn />}
      </article>; })}
      {(shifts ?? []).length === 0 && <p className="p-5 text-sm text-ink-soft">No shifts scheduled in the next 35 days. Ask your supervisor to confirm your weekly pattern.</p>}
    </section>
    {canCheckIn && <p className="text-xs text-ink-mute">If your station is missing, ask an administrator to assign it in Admin → Staff.</p>}
  </div>;
}