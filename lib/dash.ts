import { lagosToday } from "@/lib/money";

export type Totals = {
  revenue_kobo: number; refunds_kobo: number; payments: number; expenses_kobo: number; profit_kobo: number; avg_ticket_kobo: number;
  orders: { total: number; delivered: number; cancelled: number }; new_customers: number; waitlist: number;
  cash_short_kobo: number; cash_counts: number; late_minutes: number; lateness_surcharge_kobo: number;
};
export type DayPoint = { day: string; revenue_kobo: number; online_kobo: number; expenses_kobo: number; orders: number };
export type Dashboard = {
  from: string; to: string; prev_from: string; prev_to: string; cur: Totals; prev: Totals; daily: DayPoint[];
  by_mode: Record<string, number>; by_purpose: Record<string, number>;
  by_money_point: { name: string; total_kobo: number }[]; by_cashier: { name: string; total_kobo: number }[];
  expense_by_category: { name: string; total_kobo: number }[];
  orders_by_source: Record<string, number>; orders_by_status: Record<string, number>;
  waitlist_areas: { area: string; n: number }[];
  now: { open_orders: number; active_subscriptions: number; pending_expenses: number; staff: number; customers: number; waitlist_total: number };
};

/** Percentage change from previous to current. Null when there is nothing to compare against. */
export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

/** Compact naira for chart axes: 1.2M, 450K. Input is kobo. */
export function compactNaira(kobo: number): string {
  const n = kobo / 100;
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000_000) return `${sign}₦${trim(a / 1_000_000_000)}B`;
  if (a >= 1_000_000) return `${sign}₦${trim(a / 1_000_000)}M`;
  if (a >= 1_000) return `${sign}₦${trim(a / 1_000)}K`;
  return `${sign}₦${Math.round(a)}`;
}
const trim = (v: number) => (v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, ""));

const add = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const PRESETS = [
  { key: "7", label: "7 days" }, { key: "30", label: "30 days" }, { key: "90", label: "90 days" },
  { key: "month", label: "This month" }, { key: "last_month", label: "Last month" },
] as const;

/** Turns the URL into a validated date range (never more than a year, never in the future). */
export function resolveRange(sp: { range?: string; from?: string; to?: string }) {
  const today = lagosToday();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (sp.from && sp.to && iso.test(sp.from) && iso.test(sp.to) && sp.from <= sp.to && sp.to <= today && sp.from >= add(sp.to, -365)) {
    return { key: "custom", from: sp.from, to: sp.to, today };
  }
  const key = sp.range ?? "30";
  if (key === "month") return { key, from: `${today.slice(0, 8)}01`, to: today, today };
  if (key === "last_month") {
    const first = `${today.slice(0, 8)}01`;
    const to = add(first, -1);
    return { key, from: `${to.slice(0, 8)}01`, to, today };
  }
  const n = key === "7" ? 7 : key === "90" ? 90 : 30;
  return { key: String(n), from: add(today, -(n - 1)), to: today, today };
}
