import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";

export const metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

type Plan = { name: string; pieces_per_month: number; monthly_price_kobo: number };
type Subscriber = {
  id: string; customer_id: string; plan_id: string; billing_period: string; status: string;
  price_kobo: number; current_period_start: string | null; current_period_end: string | null;
  created_at: string; plans: Plan | Plan[] | null;
};
type Pickup = { subscription_id: string; scheduled_for: string; status: string; pieces_counted: number | null; overage_pieces: number | null };

type AllowanceState = "not_applicable" | "remaining" | "exhausted" | "overage";
const allowanceState = (used: number, allowance: number): AllowanceState => allowance <= 0 ? "not_applicable" : used >= allowance ? used > allowance ? "overage" : "exhausted" : "remaining";

const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(new Date(value)) : "—";

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase } = await requireRole(["super_admin"]);
  const { status } = await searchParams;
  const allowed = ["active", "pending", "past_due", "cancelled", "expired"];
  let query = supabase.from("subscriptions")
    .select("id,customer_id,plan_id,billing_period,status,price_kobo,current_period_start,current_period_end,created_at,plans(name,pieces_per_month,monthly_price_kobo)")
    .order("created_at", { ascending: false }).limit(500);
  if (status && allowed.includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  const rows = (data ?? []) as unknown as Subscriber[];
  const customerIds = [...new Set(rows.map((row) => row.customer_id))];
  const subscriptionIds = rows.map((row) => row.id);
  const [{ data: profiles }, { data: pickups }] = await Promise.all([
    customerIds.length ? supabase.from("profiles").select("id,full_name,email,phone").in("id", customerIds) : Promise.resolve({ data: [] }),
    subscriptionIds.length ? supabase.from("subscription_pickups").select("subscription_id,scheduled_for,status,pieces_counted,overage_pieces").in("subscription_id", subscriptionIds).order("scheduled_for", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const pickupRows = (pickups ?? []) as Pickup[];
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const filters = [["", "All"], ...allowed.map((value) => [value, value.replace("_", " ")])];
  const money = (value: number) => naira(Number(value ?? 0));

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1><p className="mt-1 text-sm text-ink-soft">Subscriber status, plan allowance, billing period and pickup history.</p></div>
    <nav aria-label="Filter subscriptions" className="flex flex-wrap gap-2">{filters.map(([value, label]) => <Link key={value} href={value ? `/admin/subscriptions?status=${value}` : "/admin/subscriptions"} className={`rounded-full border px-3 py-1.5 text-sm capitalize ${(status ?? "") === value ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>{label}</Link>)}</nav>
    {error ? <p className="card p-4 text-sm text-red-700">Could not load subscriptions. Please refresh or check the database permissions.</p> : rows.length === 0 ? <p className="card p-5 text-sm text-ink-soft">No subscriptions found for this filter.</p> : <div className="space-y-3">
      {rows.map((row) => {
        const profile = profileById.get(row.customer_id);
        const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
        const periodPickups = pickupRows.filter((pickup) => pickup.subscription_id === row.id && (!row.current_period_start || pickup.scheduled_for >= row.current_period_start.slice(0, 10)) && (!row.current_period_end || pickup.scheduled_for <= row.current_period_end.slice(0, 10)));
        const used = periodPickups.reduce((sum, pickup) => sum + Number(pickup.pieces_counted ?? 0), 0);
        const allowance = Number(plan?.pieces_per_month ?? 0);
        const state = allowanceState(used, allowance);
        const remaining = Math.max(0, allowance - used);
        const stateLabel = state === "exhausted" ? "Exhausted" : state === "overage" ? "Over allowance" : state === "remaining" ? "Within allowance" : "Allowance unavailable";
        const stateClasses = state === "exhausted" || state === "overage" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-line bg-surface text-ink-soft";
        const next = pickupRows.filter((pickup) => pickup.subscription_id === row.id && pickup.scheduled_for >= todayIso && ["scheduled", "dispatched"].includes(pickup.status)).sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0];
        return <article key={row.id} className="card space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{profile?.full_name || "Customer name unavailable"}</h2><p className="text-sm text-ink-soft">{profile?.email || profile?.phone || row.customer_id}</p></div><span className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold capitalize">{row.status.replace("_", " ")}</span></div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-ink-mute">Plan</p><p className="font-medium">{plan?.name ?? "Plan unavailable"} · {money(Number(row.price_kobo))} / {row.billing_period}</p></div>
            <div><p className="text-ink-mute">Current period</p><p className="font-medium">{date(row.current_period_start)} – {date(row.current_period_end)}</p></div>
            <div><p className="text-ink-mute">Allowance used</p><p className="font-medium">{used} / {allowance || "—"} pieces</p><p className="mt-1 text-xs text-ink-soft">{allowance > 0 ? `${remaining} pieces remaining` : "Allowance unavailable"}</p><span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${stateClasses}`}>{stateLabel}</span></div>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-sm"><p className="text-ink-soft">Next pickup: {next ? date(next.scheduled_for) : "None scheduled"}</p><p className="text-ink-soft">{periodPickups.length} pickup record(s) this period</p></div>
        </article>;
      })}
    </div>}
  </div>;
}
