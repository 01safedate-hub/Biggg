export type Stage = "never_ordered" | "one_and_done" | "active" | "loyal" | "lapsed";

export const STAGES: { key: Stage; label: string; color: string; blurb: string; segment: string }[] = [
  { key: "never_ordered", label: "Signed up, never ordered", color: "#94a3b8", blurb: "Created an account but have not paid for a pickup.", segment: "never_ordered" },
  { key: "one_and_done", label: "Stopped after one order", color: "#f59e0b", blurb: "Ordered once and nothing for 30 days or more.", segment: "one_and_done" },
  { key: "active", label: "Active", color: "#2a78d6", blurb: "Ordered recently.", segment: "active" },
  { key: "loyal", label: "Loyal", color: "#1baf7a", blurb: "Three or more orders in a single month, and still ordering.", segment: "loyal" },
  { key: "lapsed", label: "Lapsed", color: "#dc2626", blurb: "Used to come back, but nothing for 60 days or more.", segment: "lapsed" },
];
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<string, (typeof STAGES)[number]>;

export const SEGMENTS: { key: string; label: string }[] = [
  { key: "never_ordered", label: "Signed up, never ordered" },
  { key: "one_and_done", label: "Stopped after one order" },
  { key: "lapsed", label: "Lapsed customers" },
  { key: "active", label: "Active customers" },
  { key: "loyal", label: "Loyal customers" },
  { key: "frequent", label: "Come 2 to 4 times in a month" },
  { key: "all", label: "Everyone" },
];

export type SeriesPoint = { bucket: string; signups: number; orders: number; active: number; new_customers: number };
export type Analytics = {
  totals: { customers: number; never_ordered: number; ordered: number; repeat: number; new_30d: number; active_30d: number; opted_in: number; spent_kobo: number; avg_turnaround_h: number | null };
  stages: Partial<Record<Stage, number>>;
  daily: SeriesPoint[]; weekly: SeriesPoint[]; monthly: SeriesPoint[];
  visits: { month: string; once: number; twice: number; three_four: number; five_plus: number }[];
  turnaround: { delivered: number; avg_h: number | null; median_h: number | null; buckets: { label: string; count: number }[] };
  areas: { area: string; customers: number; orders: number; spent_kobo: number }[];
  waitlist: { area: string; people: number }[];
};
export type CustomerRow = {
  id: string; full_name: string; phone: string | null; email: string | null; customer_code: string; status: string; marketing_opt_in: boolean; signed_up_at: string;
  orders: number; last_order_at: string | null; avg_turnaround_h: number | null; spent_kobo: number; stage: Stage; days_quiet: number; zone_name: string | null;
  address: string | null; lat: number | null; lng: number | null; month_orders: number; busiest_month: number;
};
export type MapPoint = { id: string; name: string; lat: number; lng: number; stage: Stage; orders: number; address: string | null; zone: string | null };

const lagos = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(new Date(`${iso}T00:00:00Z`));
export const dayLabel = (iso: string) => lagos(iso, { day: "numeric", month: "short" });
export const weekLabel = (iso: string) => `Week of ${lagos(iso, { day: "numeric", month: "short" })}`;
export const monthLabel = (iso: string) => lagos(iso, { month: "short", year: "numeric" });
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
export const gmaps = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
export const dt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "Never");
