import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { CloseWeek, LogUnits, MarkPaid, VoidButton, WeeklyTargetForm } from "@/components/admin/WeeklyControls";

export const metadata = { title: "Weekly units" };

type Row = { staff_id: string; name: string; job_title: string | null; units: number; pct: number | null; met: boolean; payout_id: string | null; payout_status: string | null; payout_kobo: number | null };
type Board = { week_start: string; week_end: string; target_units: number | null; payout_kobo: number; unlocked: boolean; week_over: boolean; rows: Row[] };

const shift = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export default async function WeeklyPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("weekly_board", week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? { _week_start: week } : {});
  const b = data as unknown as Board | null;
  if (error || !b) return <p role="alert" className="text-sm text-red-700">The weekly board could not be loaded. Please refresh.</p>;

  const { data: logs } = await supabase.from("unit_log").select("id,staff_id,units,note,logged_at")
    .is("voided_at", null).gte("logged_at", `${b.week_start}T00:00:00+01:00`).lt("logged_at", `${shift(b.week_start, 7)}T00:00:00+01:00`).order("logged_at", { ascending: false }).limit(30);
  const name = new Map(b.rows.map((r) => [r.staff_id, r.name]));
  const closed = b.rows.some((r) => r.payout_id);
  const blocked = !b.unlocked ? "Locked until the start-up costs are fully recovered." : b.target_units == null ? "Set the weekly units target first." : !b.week_over ? "You can close the week after Sunday." : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Weekly units</h1>
        <p className="mt-1 text-sm text-ink-soft">Record units washed per person. Everyone on the weekly plan who reaches the target earns the weekly payout. It only starts once the start-up costs are recovered.</p>
      </div>
      {!b.unlocked && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Start-up costs are not fully recovered yet, so no weekly payouts can be created. You can still record units to build the history.</p>}
      <WeeklyTargetForm units={b.target_units} payoutKobo={b.payout_kobo} />

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Week of {longDate(b.week_start)} to {longDate(b.week_end)}</h2>
          <div className="flex gap-2 text-sm">
            <Link className="btn-secondary !px-3 !py-1.5" href={`/admin/weekly?week=${shift(b.week_start, -7)}`}>Previous</Link>
            <Link className="btn-secondary !px-3 !py-1.5" href={`/admin/weekly?week=${shift(b.week_start, 7)}`}>Next</Link>
          </div>
        </div>
        {b.rows.length === 0 ? <p className="mt-4 text-sm text-ink-soft">Nobody is on the weekly plan yet. Switch it on in a staff member&apos;s pay terms.</p> : (
          <ul className="mt-4 divide-y divide-line">
            {b.rows.map((r) => (
              <li key={r.staff_id} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-medium">{r.name} <span className="text-xs font-normal text-ink-mute">{r.job_title}</span></p>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-label={`${r.name} progress`} aria-valuenow={r.pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`h-full ${r.met ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${r.pct ?? 0}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-ink-mute">{r.units}{b.target_units ? ` of ${b.target_units}` : ""} units{r.pct != null ? ` · ${r.pct}%` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  {r.payout_id ? (r.payout_status === "paid" ? <span className="text-sm font-medium text-emerald-700">Paid {naira(r.payout_kobo ?? 0)}</span> : <><span className="text-sm font-medium">{naira(r.payout_kobo ?? 0)} due</span><MarkPaid id={r.payout_id} /></>)
                    : <LogUnits staffId={r.staff_id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!closed && b.rows.length > 0 && <div className="mt-4 border-t border-line pt-4"><CloseWeek weekStart={b.week_start} disabledReason={blocked} /></div>}
      </section>

      {(logs ?? []).length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-semibold">Entries this week</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {(logs ?? []).map((l) => <li key={l.id} className="flex items-center justify-between gap-3 py-2"><span>{name.get(l.staff_id) ?? "Staff"} · {l.units} units{l.note ? ` · ${l.note}` : ""}</span>{!closed && <VoidButton id={l.id} />}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
