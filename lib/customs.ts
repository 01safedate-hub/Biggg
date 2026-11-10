export type CustomRole = "staff" | "manager" | "member";

export type CustomUsage = { category_id: string; category: string; unit: string; price_kobo: number; allowance: number | null; used: number };
export type CustomLine = { member_id: string; member: string; tag: string; category_id: string; category: string; qty: number; confirmed: boolean };
export type CustomBatch = {
  order_id: string; order_no: number; status: string; created_at: string; charge_kobo: number | null; charged: boolean;
  confirmed_via: string | null; shelves: string[]; pieces: number; lines: CustomLine[];
  breakdown: { category: string; unit: string; qty: number; covered: number; charged: number; price_kobo: number; charge_kobo: number }[] | null;
};
export type CustomView = {
  role: CustomRole;
  my_member_ids: string[];
  custom: {
    id: string; name: string; code: string; kind: "business" | "lodge"; mode: "plan" | "one_time"; status: "active" | "paused" | "ended";
    delivery: "collect" | "deliver"; address: string | null; lat: number | null; lng: number | null; period: "weekly" | "monthly" | null;
    period_fee_kobo: number; period_start: string | null; period_end: string | null; notes: string | null; share_token: string | null; created_at: string;
    manager: { id: string; name: string | null; phone: string | null; email: string | null };
  };
  balance_kobo: number | null;
  usage: CustomUsage[];
  members: { id: string; tag: string; name: string; phone: string | null; email: string | null; linked: boolean }[];
  watchers: { id: string; email: string }[] | null;
  batches: CustomBatch[];
  ledger: { kind: string; amount_kobo: number; note: string | null; at: string }[] | null;
};

export const UNITS = ["piece", "kg", "bag", "set"] as const;
export const KIND_LABEL: Record<string, string> = { business: "Business", lodge: "Student lodge" };
export const MODE_LABEL: Record<string, string> = { plan: "Plan", one_time: "One-time" };
export const LEDGER_LABEL: Record<string, string> = { deposit: "Deposit", plan_fee: "Plan fee", batch: "Batch", adjust: "Adjustment" };

export function periodActive(c: CustomView["custom"], today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })) {
  return Boolean(c.period_start && c.period_end && c.period_start <= today && c.period_end >= today);
}
