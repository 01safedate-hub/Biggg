import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { Ring } from "@/components/staff/Ring";

export const metadata = { title: "Staff home" };

type Pay = {
  has_pay: boolean; job_title: string | null; base_salary_kobo: number | null; target_salary_kobo: number | null;
  unlocked: boolean; startup_pct: number; month_pct: number | null; weekly_enabled: boolean; weekly_pct: number | null; weekly_payout_kobo: number;
  payouts: { week_start: string; amount_kobo: number; status: string }[];
};

export default async function StaffHome() {
  const { supabase, roles, name } = await requireRole(["super_admin", "admin", "secretary", "cashier", "delivery_agent"]);
  const { data } = await supabase.rpc("my_pay_overview");
  const p = data as unknown as Pay | null;
  const { data: auth } = await supabase.auth.getUser();
  const { data: profile } = auth.user ? await supabase.from("staff_profiles").select("station_zone_id").eq("user_id", auth.user.id).maybeSingle() : { data: null };
  const { data: station } = profile?.station_zone_id ? await supabase.from("zones").select("name").eq("id", profile.station_zone_id).maybeSingle() : { data: null };
  const canExpense = roles.includes("secretary") || roles.includes("super_admin");
  const first = name.split(" ")[0] || "there";

  const targetState = !p ? "" : !p.unlocked ? "Unlocks when the start-up costs are fully recovered." : p.month_pct == null ? "Your monthly target has not been set yet." : p.month_pct >= 100 ? "Reached. This is what you earn this month." : "Fill the ring to earn it this month.";

  return (
    <div className="space-y-8">
      {p && (
        <section aria-label="My pay and progress" className="relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">{p.job_title || "Team"}{station?.name ? ` · ${station.name}` : ""}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Hello, {first}</h1>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Basic salary</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{p.base_salary_kobo != null ? naira(p.base_salary_kobo) : "—"}</p>
                <p className="mt-1 text-xs text-slate-400">Every month, whatever the month brings.</p>
              </div>
              <div className={`rounded-xl border p-5 backdrop-blur ${p.unlocked ? "border-orange-400/40 bg-orange-400/10" : "border-white/10 bg-white/5"}`}>
                <p className="text-xs font-semibold uppercase tracking-widest text-orange-300">Target-met salary</p>
                <p className={`mt-2 text-3xl font-bold tabular-nums ${p.unlocked ? "" : "text-slate-300"}`}>{p.target_salary_kobo != null ? naira(p.target_salary_kobo) : "—"}</p>
                <p className="mt-1 text-xs text-slate-400">{targetState}</p>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 justify-items-center gap-10 sm:grid-cols-2 lg:grid-cols-3">
              <Ring pct={p.startup_pct} label="Start-up costs recovered" sub={p.unlocked ? "Done. Your bonus pay is now open." : "Every order brings the bonus pay closer."} tone="cyan" />
              <Ring pct={p.month_pct} locked={!p.unlocked} label="Monthly profit target" sub={p.unlocked ? "Profit this month toward the target." : "Opens after start-up costs are recovered."} tone="orange" />
              {p.weekly_enabled && <Ring pct={p.weekly_pct} locked={!p.unlocked} label="Weekly units" sub={p.unlocked ? `Reach 100% this week to earn ${naira(p.weekly_payout_kobo)}.` : "Opens after start-up costs are recovered."} tone="violet" />}
            </div>
          </div>
        </section>
      )}

      {p && p.payouts.length > 0 && (
        <section className="card p-5" aria-label="Weekly payouts">
          <h2 className="text-lg font-semibold">Weekly payouts earned</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {p.payouts.map((x) => <li key={x.week_start} className="flex justify-between py-2"><span>Week of {longDate(x.week_start)}</span><span className="font-medium">{naira(x.amount_kobo)} · {x.status === "paid" ? "Paid" : "On the way"}</span></li>)}
          </ul>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {canExpense && <Link href="/staff/expenses" className="card p-5 hover:bg-canvas"><h2 className="font-semibold">Record an expense</h2><p className="mt-1 text-sm text-ink-soft">Fuel, supplies, repairs. Proof is required.</p></Link>}
        {roles.includes("delivery_agent") && <Link href="/staff/jobs" className="card p-5 hover:bg-canvas"><h2 className="font-semibold">Pickup jobs</h2><p className="mt-1 text-sm text-ink-soft">Your assigned pickups. Count, bill, and leave once paid.</p></Link>}
        {roles.some((r) => ["secretary", "admin", "super_admin"].includes(r)) && <Link href="/staff/dispatch" className="card p-5 hover:bg-canvas"><h2 className="font-semibold">Dispatch</h2><p className="mt-1 text-sm text-ink-soft">Send an agent to paid bookings.</p></Link>}
        {roles.some((r) => ["secretary", "admin", "super_admin"].includes(r)) && <Link href="/staff/receiving" className="card p-5 hover:bg-canvas"><h2 className="font-semibold">Receiving</h2><p className="mt-1 text-sm text-ink-soft">Check what the agent brought, then mark it received.</p></Link>}
        <Link href="/staff/spending" className="card p-5 hover:bg-canvas"><h2 className="font-semibold">Spending</h2><p className="mt-1 text-sm text-ink-soft">See what the business spent, with the proof.</p></Link>
        {roles.some((r) => r !== "delivery_agent") && <Link href="/staff/count" className="card p-5 hover:bg-canvas"><h2 className="font-semibold">Count money</h2><p className="mt-1 text-sm text-ink-soft">Enter what is in a drawer, POS or account at the end of the day.</p></Link>}
      </div>
    </div>
  );
}
