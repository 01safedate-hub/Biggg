/** Naira text to integer kobo. Returns null for anything that is not a positive amount with at most 2 decimals. */
export function toKobo(input: string): number | null {
  const s = input.replace(/[,\s₦]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const k = Math.round(parseFloat(s) * 100);
  return k > 0 && Number.isSafeInteger(k) ? k : null;
}

/** Today's date in Lagos as YYYY-MM-DD. */
export function lagosToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}

export function longDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso.length === 10 ? `${iso}T12:00:00+01:00` : iso));
}

export const PURPOSE_LABEL: Record<string, string> = {
  pickup_fare: "Transport (pickup + delivery)", delivery_fare: "Delivery transport", items: "Clothes", subscription: "Subscription", demurrage: "Demurrage", other: "Other",
};
export const MODE_LABEL: Record<string, string> = { paystack: "Paystack (online)", cash: "Cash", pos: "POS", transfer: "Bank transfer" };
export const EVIDENCE_LABEL: Record<string, string> = { receipt: "Receipt", bank_debit: "Bank debit", transfer_alert: "Transfer alert", invoice: "Invoice", other: "Other proof" };
