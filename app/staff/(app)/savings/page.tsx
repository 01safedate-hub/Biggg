import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { NoticeForm, SavingsRate } from "@/components/staff/SavingsControls";

export const metadata = { title: "My savings" };
export const dynamic = "force-dynamic";

type Entry = { kind: "deposit" | "payout"; month: string | null; salary_kobo: number | null; pct: number | null; amount_kobo: number; take_home_kobo: number | null; created_at: string };
type Savings = {
  on_salary: boolean; pct: number; salary_kobo: number | null; balance_kobo: number; earliest_last_day: string;
  exit: { kind: "resignation" | "dismissal"; last_day: string; notice_given_at: string; savings_paid_at: string | null } | null;
  entries: Entry[];
};
const monthName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function MySavings() {
  const { supabase } = await requireRole(["super_admin", "admin", "secretary", "cashier", "delivery_agent", "commission_agent", "washer"]);
  const { data, error } = await supabase.rpc("my_savings");
  const s = data as unknown as Savings | null;
  if (error || !s) return <p role="alert" className="text-sm text-red-700">Your savings could not be loaded. Please refresh.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My savings</h1>
        <p className="mt-1 text-sm text-ink-soft">Part of your salary is put aside every month and paid back to you in full when you leave.</p>
      </div>

      <section className="rounded-2xl bg-slate-950 p-6 text-white" aria-label="Savings balance">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Saved so far</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{naira(s.balance_kobo)}</p>
        <p className="mt-1 text-sm text-slate-300">You save <b className="text-white">{s.pct}%</b> of your salary every month.</p>
      </section>

      <section className="card space-y-3 p-5" aria-label="How savings work">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>Every month, <b className="text-ink">10%</b> of your salary is saved for you. That is the starting rate for everyone.</li>
          <li>You can choose to save more: <b className="text-ink">15%</b> or <b className="text-ink">20%</b>. Once you raise it, it cannot go back down.</li>
          <li>Your savings are yours. They are paid out in full when you leave.</li>
          <li>To resign, give at least <b className="text-ink">two months&apos; notice</b> here. Your savings are paid on your last day.</li>
          <li>If you are dismissed, your savings are still paid to you.</li>
        </ol>
      </section>

      {s.on_salary ? (
        <section className="card space-y-3 p-5" aria-label="Savings rate">
          <h2 className="text-lg font-semibold">Your savings rate</h2>
          <SavingsRate pct={s.pct} salaryKobo={s.salary_kobo} />
        </section>
      ) : (
        <p className="card p-5 text-sm text-ink-soft">You are not on a salary in the app, so nothing is being saved for you.</p>
      )}

      <section className="card p-5" aria-label="Savings history">
        <h2 className="text-lg font-semibold">History</h2>
        {s.entries.length === 0 ? <p className="mt-2 text-sm text-ink-soft">Nothing yet. Your first saving appears when this month&apos;s salary is confirmed.</p> : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {s.entries.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>{e.kind === "deposit" ? `${e.month ? monthName(e.month) : ""}: ${e.pct}% of ${naira(e.salary_kobo ?? 0)}` : `Paid out on ${longDate(e.created_at.slice(0, 10))}`}
                  {e.kind === "deposit" && e.take_home_kobo != null && <span className="block text-xs text-ink-mute">Take-home that month: {naira(e.take_home_kobo)}</span>}</span>
                <span className={`font-semibold tabular-nums ${e.kind === "payout" ? "text-emerald-700" : ""}`}>{e.kind === "payout" ? "−" : "+"}{naira(e.amount_kobo)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {s.on_salary && (
        <section className="card space-y-3 p-5" aria-label="Leaving">
          <h2 className="text-lg font-semibold">Leaving LaundryPoint</h2>
          {s.exit ? (
            <p className="text-sm text-ink-soft">
              {s.exit.kind === "resignation" ? <>You gave notice. Your last day is <b className="text-ink">{longDate(s.exit.last_day)}</b>.</> : <>Your employment has ended.</>}{" "}
              {s.exit.savings_paid_at ? "Your savings have been paid." : s.exit.kind === "resignation" ? "Your savings will be paid on your last day." : "Your savings are due to you now."}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-soft">Give at least two months&apos; notice. Your savings are paid out in full on your last day.</p>
              <NoticeForm earliest={s.earliest_last_day} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
