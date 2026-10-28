import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { updatePlan } from "./actions";

export const metadata = { title: "Subscription plans" };
export const dynamic = "force-dynamic";

type Plan = { id: string; name: string; slug: string; monthly_price_kobo: number; yearly_discount_pct: number; pieces_per_month: number; weekly_allowance: number; overage_price_kobo: number; active: boolean; sort_order: number };

export default async function AdminSubscriptionPlansPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.from("plans").select("id,name,slug,monthly_price_kobo,yearly_discount_pct,pieces_per_month,weekly_allowance,overage_price_kobo,active,sort_order").order("sort_order").order("name");
  const plans = (data ?? []) as Plan[];
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Subscription plans</h1><p className="mt-1 text-sm text-ink-soft">Manage plan prices and allowances. Prices are stored in kobo; changes may affect new checkouts, so verify the configured values before saving.</p></div>
    {error ? <p className="card p-4 text-sm text-red-700">Could not load plans. Check database permissions and refresh.</p> : plans.length === 0 ? <p className="card p-4 text-sm text-ink-soft">No plans found.</p> : plans.map((plan) => <form action={updatePlan} key={plan.id} className="card space-y-4 p-4 sm:p-5">
      <input type="hidden" name="id" value={plan.id} />
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{plan.name}</h2><p className="text-xs text-ink-soft">{plan.slug} · Current monthly price {naira(Number(plan.monthly_price_kobo))}</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={plan.active} /> Active for sale</label></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">Plan name<input name="name" required defaultValue={plan.name} className="input mt-1 w-full" /></label>
        <label className="text-sm">Monthly price (kobo)<input name="monthly_price_kobo" type="number" min="0" step="1" required defaultValue={plan.monthly_price_kobo} className="input mt-1 w-full" /></label>
        <label className="text-sm">Pieces per month<input name="pieces_per_month" type="number" min="1" step="1" required defaultValue={plan.pieces_per_month} className="input mt-1 w-full" /></label>
        <label className="text-sm">Weekly allowance<input name="weekly_allowance" type="number" min="1" step="1" required defaultValue={plan.weekly_allowance} className="input mt-1 w-full" /></label>
        <label className="text-sm">Overage price (kobo per piece)<input name="overage_price_kobo" type="number" min="0" step="1" required defaultValue={plan.overage_price_kobo} className="input mt-1 w-full" /></label>
        <label className="text-sm">Yearly discount (%)<input name="yearly_discount_pct" type="number" min="0" max="100" step="0.01" required defaultValue={plan.yearly_discount_pct} className="input mt-1 w-full" /></label>
      </div>
      <div className="flex justify-end"><button className="btn-primary" type="submit">Save plan</button></div>
    </form>)}
  </div>;
}
