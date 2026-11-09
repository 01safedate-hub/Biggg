import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { ConfirmSalaries, StaffSavingsActions } from "@/components/admin/SavingsAdmin";

export const metadata = { title: "Staff savings" };
export const dynamic = "force-dynamic";

type Row = {
  staff_id: string; name: string; job_title: string | null; active: boolean; salary_kobo: number | null; pct: number; balance_kobo: number;
  bank_name: string | null; account_number: string | null; account_name: string | null;
  exit: { kind: "resignation" | "dismissal"; last_day: string; reason: string | null; notice_given_at: string; savings_paid_at: string | null; due: boolean } | null;
};
type Board = { today: string; this_month: string; months: { month: string; total_salary_kobo: number; total_saved_kobo: number; confirmed_at: string }[]; staff: Row[] };

const monthName = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const prevMonth = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n, 1); return d.toISOString().slice(0, 10); };

export default async function SavingsPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("savings_board");
  const b = data as unknown as Board | null;
  if (error || !b) return <p role="alert" className="text-sm text-red-700">Savings could not be loaded. Please refresh.</p>;

  const done = new Set(b.months.map((m) => m.month.slice(0, 10)));
  const months = [0, 1, 2].map((n) => prevMonth(b.this_month, n)).filter((m) => !done.has(m)).map((m) => ({ value: m, label: monthName(m) }));
  // Everyone on an active salary who has not already left.
  const lines = b.staff.filter((s) => s.active && !(s.exit && (s.exit.kind === "dismissal" || s.exit.last_day < b.today)))
    .map((s) => ({ staff_id: s.staff_id, name: s.name, pct: s.pct, salary_kobo: s.salary_kobo ?? 0 }));
  const due = b.staff.filter((s) => s.exit?.due && !s.exit.savings_paid_at && s.balance_kobo > 0);
  const total = b.staff.reduce((n, s) => n + s.balance_kobo, 0);
  const bank = (s: Row) => s.account_number ? `${s.bank_name ?? "Bank"} · ${s.account_number} · ${s.account_name ?? ""}` : "No bank details";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff savings</h1>
        <p className="mt-1 text-sm text-ink-soft">Each person saves 10%, 15% or 20% of their salary. Savings are paid out at the end of a resignation notice (at least two months), or straight away after a dismissal.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-ink-soft">Held for staff</p><p className="mt-1 text-2xl font-bold">{naira(total)}</p></div>
        <div className="card p-4"><p className="text-sm text-ink-soft">Due to pay now</p><p className="mt-1 text-2xl font-bold">{naira(due.reduce((n, s) => n + s.balance_kobo, 0))}</p></div>
        <div className="card p-4"><p className="text-sm text-ink-soft">Last month confirmed</p><p className="mt-1 text-2xl font-bold">{b.months[0] ? monthName(b.months[0].month) : "None yet"}</p></div>
      </div>

      {due.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5" aria-label="Savings due">
          <h2 className="font-semibold text-amber-950">Savings due to pay</h2>
          <ul className="mt-2 divide-y divide-amber-200">
            {due.map((s) => (
              <li key={s.staff_id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div><p className="font-medium">{s.name} · {naira(s.balance_kobo)}</p><p className="text-sm text-amber-900">{bank(s)}</p>
                  <p className="text-xs text-amber-800">{s.exit?.kind === "dismissal" ? "Dismissed" : `Last day ${longDate(s.exit!.last_day)}`}</p></div>
                <StaffSavingsActions staffId={s.staff_id} name={s.name} balance={s.balance_kobo} due exitKind={s.exit?.kind ?? null} paid={false} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5" aria-label="Confirm salaries">
        <h2 className="text-lg font-semibold">Confirm this month&apos;s salaries</h2>
        <p className="mb-3 mt-1 text-sm text-ink-soft">Do this once a month when you pay salaries. Check the amounts (they start at each person&apos;s basic salary), then confirm.</p>
        <ConfirmSalaries months={months} lines={lines} />
      </section>

      <section className="card p-5" aria-label="Everyone's savings">
        <h2 className="text-lg font-semibold">Everyone</h2>
        <ul className="mt-3 divide-y divide-line">
          {b.staff.map((s) => (
            <li key={s.staff_id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-medium">{s.name}{s.job_title ? <span className="font-normal text-ink-mute"> · {s.job_title}</span> : null}</p>
                <p className="text-sm text-ink-soft">Saves {s.pct}% · Balance <b className="text-ink">{naira(s.balance_kobo)}</b></p>
                <p className="text-xs text-ink-mute">{bank(s)}</p>
                {s.exit && <p className="text-xs text-amber-800">{s.exit.kind === "dismissal" ? "Dismissed" : `Notice given · last day ${longDate(s.exit.last_day)}`}{s.exit.savings_paid_at ? " · savings paid" : ""}</p>}
              </div>
              <StaffSavingsActions staffId={s.staff_id} name={s.name} balance={s.balance_kobo} due={false} exitKind={s.exit?.kind ?? null} paid={!!s.exit?.savings_paid_at} />
            </li>
          ))}
          {b.staff.length === 0 && <li className="py-2 text-sm text-ink-soft">Nobody is on a salary yet.</li>}
        </ul>
      </section>

      {b.months.length > 0 && (
        <section className="card p-5" aria-label="Confirmed months">
          <h2 className="text-lg font-semibold">Confirmed months</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {b.months.map((m) => <li key={m.month} className="flex justify-between py-2"><span>{monthName(m.month)}</span><span>{naira(m.total_salary_kobo)} salaries · {naira(m.total_saved_kobo)} saved</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
