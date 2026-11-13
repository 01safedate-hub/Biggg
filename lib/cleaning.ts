// Shared labels and helpers for the cleaning service (customer, staff and public pages).

export const CLEANING_HOTLINE = "0913 258 4627";
export const CLEANING_TEL = "+2349132584627";
export const CLEANING_WHATSAPP = "https://wa.me/2349132584627";

export const SERVICE_LABEL: Record<string, string> = {
  standard: "Standard clean",
  deep: "Deep clean",
  move: "Move-in or move-out clean",
  post_construction: "Post-construction clean",
  after_event: "After-event clean",
  shortlet: "Shortlet turnover",
  office: "Office clean",
};
export const SERVICE_CODES = Object.keys(SERVICE_LABEL);

export const HOME_KIND_LABEL: Record<string, string> = {
  self_contain: "Self-contain",
  flat: "Flat",
  duplex: "Duplex",
  bungalow: "Bungalow",
  shortlet: "Shortlet apartment",
  hostel: "Hostel room",
  office: "Office",
  shop: "Shop",
  other: "Other",
};

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  inspection_booked: "Inspection booked",
  quoting: "Preparing quote",
  quoted: "Quote sent",
  accepted: "Booked",
  lost: "Lost",
  cancelled: "Cancelled",
};

export const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  awaiting_approval: "Waiting for admin approval",
  sent: "Sent to customer",
  accepted: "Accepted and paid",
  declined: "Declined",
  expired: "Expired",
  superseded: "Replaced by a newer version",
};

export const VISIT_STATUS_LABEL: Record<string, string> = {
  held: "Held (awaiting payment)",
  scheduled: "Scheduled",
  on_the_way: "Crew on the way",
  in_progress: "Cleaning now",
  awaiting_signoff: "Finished, awaiting your rating",
  done: "Done",
  no_show: "Could not get in",
  cancelled: "Cancelled",
  unsafe: "Stopped (unsafe)",
};

export const VISIT_KIND_LABEL: Record<string, string> = {
  one_off: "One-off clean",
  plan: "Plan visit",
  plan_first: "First deep clean (plan)",
  reclean: "Free re-clean",
  credit: "Credit visit",
};

export const PLAN_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  active: "Active",
  past_due: "Renewal overdue",
  paused: "Paused",
  cancelled: "Cancelled",
  ended: "Ended",
};

export const INVOICE_PURPOSE_LABEL: Record<string, string> = {
  inspection: "Inspection fee",
  quote: "Cleaning booking",
  balance: "Balance",
  renewal: "Plan renewal",
  extra_work: "Extra work",
};

export const TERM_LABEL: Record<string, string> = {
  monthly: "1 month",
  three_month: "3 months",
  six_month: "6 months",
  yearly: "12 months",
};
export const TERM_MONTHS: Record<string, number> = { monthly: 1, three_month: 3, six_month: 6, yearly: 12 };

export const WINDOW_LABEL: Record<string, string> = { morning: "Morning (8am to 12pm)", afternoon: "Afternoon (12pm to 5pm)" };
export const WEEKDAY_LABEL = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function nairaK(kobo: number | null | undefined): string {
  return `₦${Math.round(Number(kobo ?? 0) / 100).toLocaleString("en-NG")}`;
}

export function minutesLabel(m: number | null | undefined): string {
  const v = Math.max(0, Math.round(Number(m ?? 0)));
  const h = Math.floor(v / 60);
  const r = v % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

export function dayLabel(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(`${String(d).slice(0, 10)}T12:00:00+01:00`);
  return dt.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });
}

export function dateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
}

export function lagosDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return now.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}

// Safe file name for storage paths checked by the database ([A-Za-z0-9._-]).
export function safeFileName(name: string): string {
  const ext = (name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}
