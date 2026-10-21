import Link from "next/link";
import { requireRole } from "@/lib/roles";

export const metadata = { title: "Staff home" };

type Progress = { capital_pct: number; capital_recovered: boolean };

export default async function StaffHome() {
  const { supabase, roles } = await requireRole(["super_admin", "admin", "accountant", "cashier"]);
  const { data } = await supabase.rpc("recovery_progress");
  const p = data as unknown as Progress | null;
  const canExpense = roles.includes("accountant") || roles.includes("super_admin");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Staff home</h1>
      {p && (
        <section aria-label="Business progress" className="card p-6">
          <div className="flex items-end justify-between"><h2 className="text-lg font-semibold">Start-up costs recovered</h2><p className="text-3xl font-bold">{p.capital_pct}%</p></div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={p.capital_pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand" style={{ width: `${Math.min(100, p.capital_pct)}%` }} />
          </div>
          <p className="mt-3 text-sm text-ink-soft">{p.capital_recovered ? "The start-up costs have been fully recovered." : "Every order brings us closer. Thank you."}</p>
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {canExpense && <Link href="/staff/expenses" className="card p-5 hover:bg-canvas"><h2 className="font-semibold">Record an expense</h2><p className="mt-1 text-sm text-ink-soft">Fuel, supplies, repairs. Proof is required.</p></Link>}
        <Link href="/staff/count" className="card p-5 hover:bg-canvas"><h2 className="font-semibold">Count money</h2><p className="mt-1 text-sm text-ink-soft">Enter what is in a drawer, POS or account at the end of the day.</p></Link>
      </div>
    </div>
  );
}
