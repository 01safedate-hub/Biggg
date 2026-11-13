import { requireRole } from "@/lib/roles";
import { CLEANING_DESK, CLEANING_MANAGER, CLEANING_MONEY } from "@/lib/cleaning-roles";
import { PLAN_STATUS_LABEL, TERM_LABEL, WEEKDAY_LABEL, dayLabel, nairaK } from "@/lib/cleaning";
import { PlanAdmin } from "@/components/cleaning/AdminTools";
import { DeskPay } from "@/components/cleaning/StaffRequestTools";

export const metadata = { title: "Cleaning plans" };
export const dynamic = "force-dynamic";

type Plan = { id: string; customer: string; phone: string | null; address: string; plan: string | null; status: string; monthly_kobo: number; visits_per_month: number; weekday: number; window: string;
  term: string; period_end: string | null; cancel_at_period_end: boolean; bundle: boolean; next_visit: string | null; used_this_month: number; credits: number; open_invoice: { id: string; amount_kobo: number } | null };

export default async function CleaningPlans() {
  const { supabase, roles } = await requireRole(CLEANING_DESK);
  const canMoney = roles.some((r) => CLEANING_MONEY.includes(r));
  const manager = roles.some((r) => CLEANING_MANAGER.includes(r));
  const [{ data, error }, { data: pts }] = await Promise.all([
    supabase.rpc("cleaning_plans_list" as never),
    canMoney ? supabase.from("money_points").select("id,name,kind").eq("active", true).neq("kind", "online").order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const plans = (data ?? []) as unknown as Plan[];
  const points = (pts ?? []) as { id: string; name: string }[];
  const mrr = plans.filter((p) => p.status === "active").reduce((s, p) => s + p.monthly_kobo, 0);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cleaning plans</h1>
        <p className="mt-1 text-sm text-ink-soft">{plans.filter((p) => p.status === "active").length} active · {nairaK(mrr)} a month. Renewal bills go out 3 days before a plan ends; unpaid plans pause after the grace days.</p>
      </div>
      {error && <p className="card p-4 text-sm text-red-700">Could not load plans.</p>}
      {!error && plans.length === 0 && <p className="card p-5 text-sm text-ink-soft">No plans yet.</p>}
      {plans.map((p) => (
        <div key={p.id} className="card space-y-2 p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-semibold">{p.customer} {p.phone ? <a className="font-normal underline" href={`tel:${p.phone}`}>{p.phone}</a> : null}</p>
            <span className={`text-sm font-medium ${p.status === "active" ? "text-emerald-700" : "text-amber-800"}`}>{PLAN_STATUS_LABEL[p.status] ?? p.status}{p.cancel_at_period_end ? " · ending" : ""}</span>
          </div>
          <p className="text-sm text-ink-soft">{p.plan ?? "Plan"}{p.bundle ? " · Home Complete" : ""} · {p.visits_per_month}/month on {WEEKDAY_LABEL[p.weekday]}s ({p.window}) · {nairaK(p.monthly_kobo)}/month · paid {TERM_LABEL[p.term] ?? p.term} · {p.address}</p>
          <p className="text-xs text-ink-mute">Paid until {dayLabel(p.period_end)} · next visit {p.next_visit ? dayLabel(p.next_visit) : "none booked"} · used this month {p.used_this_month} · credits {p.credits}</p>
          {p.open_invoice && <p className="text-sm text-amber-800">Renewal bill {nairaK(p.open_invoice.amount_kobo)} unpaid.</p>}
          {p.open_invoice && canMoney && <DeskPay invoiceId={p.open_invoice.id} amountKobo={p.open_invoice.amount_kobo} points={points} back="/staff/cleaning/plans" />}
          {manager && <PlanAdmin subId={p.id} status={p.status} cancelAtEnd={p.cancel_at_period_end} />}
        </div>
      ))}
    </div>
  );
}
