import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { CLEANING_MANAGER } from "@/lib/cleaning-roles";
import { SERVICE_LABEL, VISIT_KIND_LABEL, VISIT_STATUS_LABEL, dateTimeLabel, dayLabel, lagosDate, minutesLabel, nairaK } from "@/lib/cleaning";
import { VisitControls } from "@/components/cleaning/BoardTools";

export const metadata = { title: "Cleaning board" };
export const dynamic = "force-dynamic";

type Board = {
  days: { date: string; capacity: { minutes: number; cleaners: number; fallback: boolean }; booked: number }[];
  visits: { id: string; visit_no: number; date: string; window: string; start_time: string | null; status: string; kind: string; service: string; crew_size: number; duration_min: number;
    customer: string; phone: string | null; address: string; zone: string | null; bundle_laundry: boolean; balance_due_kobo: number; crew: { id: string; name: string; role: string }[] }[];
  inspections: { id: string; at: string; status: string; mode: string; request_id: string; request_no: number; inspector: string | null; address: string | null; customer: string | null }[];
  staff: { id: string; name: string; roles: string[] }[];
};

function addDays(d: string, n: number) {
  const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
}

export default async function CleaningBoard({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const sp = await searchParams;
  const { supabase, roles } = await requireRole(["scheduler", "secretary", "cashier", "inspector", "cleaning_lead", "admin", "super_admin"]);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : lagosDate();
  const to = addDays(from, 6);
  const { data, error } = await supabase.rpc("cleaning_board" as never, { _from: from, _to: to } as never);
  const b = (data ?? { days: [], visits: [], inspections: [], staff: [] }) as unknown as Board;
  const manager = roles.some((r) => CLEANING_MANAGER.includes(r));
  const fallback = b.days.some((d) => d.capacity.fallback);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cleaning board</h1>
          <p className="mt-1 text-sm text-ink-soft">Every paid visit needs a crew lead by the day before. Capacity counts cleaner hours on shift, minus leave, plus travel time.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link className="btn-secondary" href={`/staff/cleaning/board?from=${addDays(from, -7)}`}>← Previous week</Link>
          <Link className="btn-secondary" href="/staff/cleaning/board">This week</Link>
          <Link className="btn-secondary" href={`/staff/cleaning/board?from=${addDays(from, 7)}`}>Next week →</Link>
        </div>
      </div>
      {error && <p className="card p-4 text-sm text-red-700">Could not load the board.</p>}
      {fallback && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No cleaner has weekly working days yet, so capacity uses the default from Cleaning settings. Set working days for each cleaner in <Link className="underline" href="/staff/cleaning/settings#crew">Cleaning settings</Link>.</p>}
      {b.days.map((day) => {
        const visits = b.visits.filter((v) => v.date === day.date);
        const insp = b.inspections.filter((i) => i.at && new Date(i.at).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }) === day.date);
        const pct = day.capacity.minutes > 0 ? Math.round((day.booked / day.capacity.minutes) * 100) : 0;
        return (
          <section key={day.date} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{dayLabel(day.date)}</h2>
              <p className={`text-sm ${pct >= 90 ? "text-red-700" : pct >= 70 ? "text-amber-800" : "text-ink-soft"}`}>
                {day.capacity.minutes === 0 ? "Closed" : `${minutesLabel(day.booked)} booked of ${minutesLabel(day.capacity.minutes)} (${pct}%) · ${day.capacity.cleaners} on shift`}
              </p>
            </div>
            {visits.length === 0 && insp.length === 0 && <p className="text-sm text-ink-mute">Nothing booked.</p>}
            {insp.map((i) => (
              <Link key={i.id} href={`/staff/cleaning/requests/${i.request_id}`} className="card block p-3 text-sm hover:border-brand">
                Inspection {dateTimeLabel(i.at)} · #{i.request_no} {i.customer ?? ""} · {i.address ?? ""} · {i.inspector ?? <span className="text-amber-800">no inspector</span>}{i.status === "awaiting_fee" ? " · fee not paid" : ""}
              </Link>
            ))}
            {visits.map((v) => {
              const lead = v.crew.find((c) => c.role === "lead");
              return (
                <div key={v.id} className={`card space-y-2 p-4 ${!lead && v.status === "scheduled" ? "border-amber-300" : ""}`}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-semibold">#{v.visit_no} · {v.start_time ? v.start_time.slice(0, 5) : v.window} · {v.customer} {v.phone ? <a className="font-normal underline" href={`tel:${v.phone}`}>{v.phone}</a> : null}</p>
                      <p className="text-sm text-ink-soft">{VISIT_KIND_LABEL[v.kind] ?? v.kind} · {SERVICE_LABEL[v.service] ?? v.service} · crew {v.crew_size} × {minutesLabel(v.duration_min)} · {v.zone ?? ""} · {v.address}</p>
                      <p className="text-xs text-ink-mute">{v.crew.length ? v.crew.map((c) => `${c.name}${c.role === "lead" ? " (lead)" : ""}`).join(", ") : "No crew yet"}{v.bundle_laundry ? " · collect laundry" : ""}{v.balance_due_kobo > 0 ? ` · balance ${nairaK(v.balance_due_kobo)} unpaid` : ""}</p>
                    </div>
                    <span className="h-fit rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-dark">{VISIT_STATUS_LABEL[v.status] ?? v.status}</span>
                  </div>
                  {manager && <VisitControls visitId={v.id} crewSize={v.crew_size} crew={v.crew} staff={b.staff} startTime={v.start_time} status={v.status} />}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
