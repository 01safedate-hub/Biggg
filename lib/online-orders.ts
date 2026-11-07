/** Online (one-time) orders: the customer pays pickup and return together at booking. */

export type ReturnFields = {
  source: string;
  status: string;
  fulfillment_choice?: string | null;
  delivery_fare_kobo?: number | null;
  return_prepaid_kobo?: number | null;
};

/** Online sources shown on the staff Online orders tab. `online` is the older booking flow. */
export const ONLINE_SOURCES = ["one_time", "online"] as const;

/** Statuses that are finished and drop off the working list. */
export const ONLINE_DONE = ["delivered", "closed", "cancelled"] as const;

/** True when the booking payment already covers the return trip to the chosen address (mirrors private.one_time_return_covered). */
export function prepaidReturnCovers(o: ReturnFields): boolean {
  return o.source === "one_time" && o.fulfillment_choice === "deliver"
    && Number(o.delivery_fare_kobo ?? 0) === 0 && Number(o.return_prepaid_kobo ?? 0) > 0;
}

/** Staff-facing stage groups for the Online orders tab, in workflow order. */
export const ONLINE_STAGES: { key: string; label: string; hint: string; statuses: string[] }[] = [
  { key: "pickup", label: "Pickup", hint: "Paid bookings waiting for an agent or with an agent. Assign agents in Dispatch.", statuses: ["awaiting_fare_payment", "awaiting_dispatch", "agent_assigned", "agent_arrived"] },
  { key: "count", label: "Count and bill", hint: "Clothes counted. Waiting for the customer to confirm or pay the bill.", statuses: ["counted", "count_confirmed"] },
  { key: "hub", label: "At the hub", hint: "Received and being washed.", statuses: ["received", "in_house"] },
  { key: "return", label: "Ready to go back", hint: "Washed. The return trip was paid at booking, so most go straight to a rider.", statuses: ["ready", "awaiting_delivery_fare"] },
  { key: "delivery", label: "Out for delivery", hint: "With a rider, or a delivery that failed and needs a call.", statuses: ["out_for_delivery", "failed_delivery"] },
];
